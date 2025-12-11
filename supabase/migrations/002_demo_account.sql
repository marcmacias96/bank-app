-- =====================================================
-- Demo Account Support (No Authentication Required)
-- Peninsula Technical Test - Fullstack
-- =====================================================

-- First, we need to modify the accounts table to allow demo accounts
-- The foreign key constraint prevents using a demo user_id that doesn't exist in auth.users

-- Option 1: Make user_id nullable for demo accounts (cleaner approach)
-- We'll drop the existing constraint and add a new one that allows NULL

-- Drop the existing foreign key constraint
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_fkey;

-- Make user_id nullable
ALTER TABLE accounts ALTER COLUMN user_id DROP NOT NULL;

-- Add back the foreign key but allow NULL values
ALTER TABLE accounts
ADD CONSTRAINT accounts_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Function to create a demo account (for testing without auth)
CREATE OR REPLACE FUNCTION create_demo_account(
    p_initial_balance DECIMAL(15, 2) DEFAULT 100.00,
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
    -- Check if demo account already exists (user_id IS NULL means demo)
    SELECT * INTO v_new_account
    FROM accounts
    WHERE user_id IS NULL
    LIMIT 1;

    IF v_new_account.id IS NOT NULL THEN
        RETURN v_new_account;
    END IF;

    -- Create new demo account with NULL user_id
    INSERT INTO accounts (user_id, balance, currency)
    VALUES (NULL, p_initial_balance, p_currency)
    RETURNING * INTO v_new_account;

    RETURN v_new_account;
END;
$$;

-- Grant execute to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION create_demo_account TO anon;
GRANT EXECUTE ON FUNCTION create_demo_account TO authenticated;

-- Update update_balance to allow demo user (user_id IS NULL)
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
    v_account_exists BOOLEAN;
BEGIN
    -- 1. Verify account exists and get user_id
    SELECT a.user_id, TRUE INTO v_user_id, v_account_exists
    FROM accounts a
    WHERE a.id = p_account_id;

    IF NOT v_account_exists THEN
        RETURN QUERY SELECT
            FALSE,
            NULL::DECIMAL(15,2),
            NULL::INTEGER,
            'ACCOUNT_NOT_FOUND'::VARCHAR(50),
            'Account does not exist'::TEXT;
        RETURN;
    END IF;

    -- Allow if: user owns account OR it's a demo account (user_id IS NULL)
    IF v_user_id IS NOT NULL AND v_user_id != auth.uid() THEN
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

-- Grant execute to anonymous users for demo
GRANT EXECUTE ON FUNCTION update_balance TO anon;

-- Add RLS policies for demo user (user_id IS NULL)
DROP POLICY IF EXISTS "Demo user can view demo accounts" ON accounts;
CREATE POLICY "Demo user can view demo accounts"
    ON accounts FOR SELECT
    USING (user_id IS NULL);

DROP POLICY IF EXISTS "Demo user can view demo transactions" ON transactions;
CREATE POLICY "Demo user can view demo transactions"
    ON transactions FOR SELECT
    USING (account_id IN (
        SELECT id FROM accounts WHERE user_id IS NULL
    ));
