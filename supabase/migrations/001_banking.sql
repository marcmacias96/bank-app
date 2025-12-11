-- =====================================================
-- Banking Schema for Concurrent Balance Management
-- Peninsula Technical Test - Fullstack
-- =====================================================

-- 1. ACCOUNTS TABLE
-- Stores bank account information with optimistic locking support
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    version INTEGER NOT NULL DEFAULT 1,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- CRITICAL: Prevent negative balance at database level
    CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON accounts(updated_at);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_updated_at ON accounts;
CREATE TRIGGER accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 2. TRANSACTIONS TABLE
-- Audit trail for all balance operations
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    type VARCHAR(10) NOT NULL CHECK (type IN ('deposit', 'withdraw')),
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    version_at INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'failed', 'pending')),
    error_message TEXT,
    idempotency_key UUID UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Validate balance change consistency
    CONSTRAINT valid_balance_change CHECK (
        (type = 'deposit' AND balance_after = balance_before + amount) OR
        (type = 'withdraw' AND balance_after = balance_before - amount) OR
        (status = 'failed')
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key)
    WHERE idempotency_key IS NOT NULL;


-- 3. ROW LEVEL SECURITY (RLS)
-- Ensure users can only access their own data

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can insert own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can update own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;

-- Account policies
CREATE POLICY "Users can view own accounts"
    ON accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
    ON accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
    ON accounts FOR UPDATE
    USING (auth.uid() = user_id);

-- Transaction policies
CREATE POLICY "Users can view own transactions"
    ON transactions FOR SELECT
    USING (account_id IN (
        SELECT id FROM accounts WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own transactions"
    ON transactions FOR INSERT
    WITH CHECK (account_id IN (
        SELECT id FROM accounts WHERE user_id = auth.uid()
    ));


-- 4. UPDATE_BALANCE FUNCTION
-- Core function implementing optimistic locking for concurrent balance updates
CREATE OR REPLACE FUNCTION update_balance(
    p_account_id UUID,
    p_amount DECIMAL(15, 2),
    p_type VARCHAR(10),
    p_expected_version INTEGER,
    p_idempotency_key UUID DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    new_balance DECIMAL(15, 2),
    new_version INTEGER,
    error_code VARCHAR(50),
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance DECIMAL(15, 2);
    v_current_version INTEGER;
    v_new_balance DECIMAL(15, 2);
    v_rows_affected INTEGER;
    v_user_id UUID;
BEGIN
    -- 1. Verify user owns this account (security check)
    SELECT a.user_id INTO v_user_id
    FROM accounts a
    WHERE a.id = p_account_id;

    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT
            FALSE,
            NULL::DECIMAL(15,2),
            NULL::INTEGER,
            'ACCOUNT_NOT_FOUND'::VARCHAR(50),
            'Account does not exist'::TEXT;
        RETURN;
    END IF;

    IF v_user_id != auth.uid() THEN
        RETURN QUERY SELECT
            FALSE,
            NULL::DECIMAL(15,2),
            NULL::INTEGER,
            'UNAUTHORIZED'::VARCHAR(50),
            'Not authorized to modify this account'::TEXT;
        RETURN;
    END IF;

    -- 2. Check idempotency (if key provided)
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM transactions
            WHERE idempotency_key = p_idempotency_key
            AND status = 'completed'
        ) THEN
            -- Return cached result
            SELECT t.balance_after, a.version
            INTO v_new_balance, v_current_version
            FROM transactions t
            JOIN accounts a ON a.id = t.account_id
            WHERE t.idempotency_key = p_idempotency_key;

            RETURN QUERY SELECT
                TRUE,
                v_new_balance,
                v_current_version,
                NULL::VARCHAR(50),
                'Idempotent: transaction already processed'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- 3. Get current state (NO LOCK - optimistic approach)
    SELECT balance, version
    INTO v_current_balance, v_current_version
    FROM accounts
    WHERE id = p_account_id;

    -- 4. Version check (optimistic locking)
    IF v_current_version != p_expected_version THEN
        RETURN QUERY SELECT
            FALSE,
            v_current_balance,
            v_current_version,
            'VERSION_CONFLICT'::VARCHAR(50),
            format('Version mismatch: expected %s, found %s',
                   p_expected_version, v_current_version)::TEXT;
        RETURN;
    END IF;

    -- 5. Validate transaction type
    IF p_type NOT IN ('deposit', 'withdraw') THEN
        RETURN QUERY SELECT
            FALSE,
            NULL::DECIMAL(15,2),
            NULL::INTEGER,
            'INVALID_TYPE'::VARCHAR(50),
            'Type must be deposit or withdraw'::TEXT;
        RETURN;
    END IF;

    -- 6. Calculate new balance
    IF p_type = 'deposit' THEN
        v_new_balance := v_current_balance + p_amount;
    ELSE -- withdraw
        v_new_balance := v_current_balance - p_amount;

        -- Check sufficient funds BEFORE update
        IF v_new_balance < 0 THEN
            -- Log failed attempt
            INSERT INTO transactions (
                account_id, type, amount, balance_before,
                balance_after, version_at, status, error_message,
                idempotency_key
            ) VALUES (
                p_account_id, p_type, p_amount, v_current_balance,
                v_current_balance, v_current_version, 'failed',
                'Insufficient funds', p_idempotency_key
            );

            RETURN QUERY SELECT
                FALSE,
                v_current_balance,
                v_current_version,
                'INSUFFICIENT_FUNDS'::VARCHAR(50),
                format('Cannot withdraw %s from balance %s',
                       p_amount, v_current_balance)::TEXT;
            RETURN;
        END IF;
    END IF;

    -- 7. ATOMIC UPDATE with version check
    UPDATE accounts
    SET
        balance = v_new_balance,
        version = version + 1
    WHERE id = p_account_id
    AND version = p_expected_version;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- 8. Check if update succeeded (concurrent modification detection)
    IF v_rows_affected = 0 THEN
        -- Another process modified the account
        SELECT version INTO v_current_version
        FROM accounts WHERE id = p_account_id;

        RETURN QUERY SELECT
            FALSE,
            v_current_balance,
            v_current_version,
            'VERSION_CONFLICT'::VARCHAR(50),
            'Concurrent modification detected'::TEXT;
        RETURN;
    END IF;

    -- 9. Record successful transaction
    INSERT INTO transactions (
        account_id, type, amount, balance_before,
        balance_after, version_at, status, idempotency_key
    ) VALUES (
        p_account_id, p_type, p_amount, v_current_balance,
        v_new_balance, p_expected_version + 1, 'completed',
        p_idempotency_key
    );

    -- 10. Return success
    RETURN QUERY SELECT
        TRUE,
        v_new_balance,
        (p_expected_version + 1)::INTEGER,
        NULL::VARCHAR(50),
        NULL::TEXT;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_balance TO authenticated;


-- 5. HELPER FUNCTION: Create account for current user
CREATE OR REPLACE FUNCTION create_user_account(
    p_initial_balance DECIMAL(15, 2) DEFAULT 0.00,
    p_currency VARCHAR(3) DEFAULT 'EUR'
)
RETURNS accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_account accounts;
BEGIN
    INSERT INTO accounts (user_id, balance, currency)
    VALUES (auth.uid(), p_initial_balance, p_currency)
    RETURNING * INTO v_new_account;

    RETURN v_new_account;
END;
$$;

GRANT EXECUTE ON FUNCTION create_user_account TO authenticated;
