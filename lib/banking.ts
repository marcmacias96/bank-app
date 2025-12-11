/**
 * Banking Service for Concurrent Balance Management
 * Peninsula Technical Test - Fullstack
 *
 * Implements optimistic locking with retry logic for concurrent balance updates.
 */

import { supabase } from "@/lib/supabase";
import {
  type Account,
  type Transaction,
  type UpdateBalanceParams,
  type UpdateBalanceResult,
  type RetryConfig,
  type SupabaseRpcResponse,
  type AccountRow,
  type TransactionRow,
  BankingError,
  DEFAULT_RETRY_CONFIG,
  mapAccountRow,
  mapTransactionRow,
} from "@/types/banking";

/**
 * Calculates delay with exponential backoff and jitter.
 * Jitter prevents "thundering herd" when multiple clients retry simultaneously.
 *
 * @param attempt - Current retry attempt (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  // Jitter: +/- 25% randomization
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Promise-based sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates a UUID v4 for idempotency
 */
function generateIdempotencyKey(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID generation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Fetches the current version and balance of an account.
 * Required for optimistic locking.
 *
 * @param accountId - The account UUID
 * @returns Current version and balance
 * @throws BankingError if account not found
 */
async function getAccountVersion(
  accountId: string
): Promise<{ version: number; balance: number }> {
  const { data, error } = await supabase
    .from("accounts")
    .select("version, balance")
    .eq("id", accountId)
    .single();

  if (error || !data) {
    throw new BankingError(
      "ACCOUNT_NOT_FOUND",
      `Failed to fetch account: ${error?.message ?? "Account not found"}`
    );
  }

  return {
    version: data.version,
    balance: parseFloat(data.balance),
  };
}

/**
 * Executes a single balance update attempt via Supabase RPC.
 *
 * @param params - Update parameters including expected version
 * @returns Result of the update attempt
 * @throws BankingError on network errors
 */
async function attemptBalanceUpdate(
  params: UpdateBalanceParams & {
    expectedVersion: number;
    idempotencyKey: string;
  }
): Promise<UpdateBalanceResult> {
  const { data, error } = await supabase.rpc("update_balance", {
    p_account_id: params.accountId,
    p_amount: params.amount,
    p_type: params.type,
    p_expected_version: params.expectedVersion,
    p_idempotency_key: params.idempotencyKey,
  });

  if (error) {
    throw new BankingError("NETWORK_ERROR", `Supabase RPC error: ${error.message}`);
  }

  // Supabase returns array for RETURNS TABLE functions
  const result = (data as SupabaseRpcResponse[])?.[0];

  if (!result) {
    throw new BankingError("UNKNOWN_ERROR", "Empty response from server");
  }

  return {
    success: result.success,
    newBalance: result.new_balance,
    newVersion: result.new_version,
    errorCode: result.error_code as UpdateBalanceResult["errorCode"],
    errorMessage: result.error_message,
  };
}

/**
 * Updates an account balance with optimistic locking and automatic retries.
 *
 * This is the main function for concurrent balance management. It:
 * 1. Fetches the current account version
 * 2. Validates the operation client-side (early exit for insufficient funds)
 * 3. Calls the server RPC with the expected version
 * 4. Retries with exponential backoff on VERSION_CONFLICT
 *
 * @param params - Update parameters (accountId, amount, type)
 * @param retryConfig - Optional retry configuration
 * @returns Result of the operation
 * @throws BankingError if all retries fail or non-retryable error occurs
 *
 * @example
 * ```typescript
 * const result = await updateBalance({
 *   accountId: 'uuid-here',
 *   amount: 100.00,
 *   type: 'deposit'
 * });
 *
 * if (result.success) {
 *   console.log(`New balance: ${result.newBalance}`);
 * }
 * ```
 */
export async function updateBalance(
  params: UpdateBalanceParams,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<UpdateBalanceResult> {
  // Input validation
  if (params.amount <= 0) {
    throw new BankingError("INVALID_AMOUNT", "Amount must be positive");
  }

  if (!["deposit", "withdraw"].includes(params.type)) {
    throw new BankingError("INVALID_TYPE", "Type must be deposit or withdraw");
  }

  // Generate idempotency key if not provided (persists across retries)
  const idempotencyKey = params.idempotencyKey ?? generateIdempotencyKey();

  let lastError: BankingError | null = null;
  let attempt = 0;

  while (attempt <= retryConfig.maxRetries) {
    try {
      // Get current version for optimistic locking
      const { version: expectedVersion, balance: currentBalance } =
        await getAccountVersion(params.accountId);

      // Early validation: check funds before making RPC call
      if (params.type === "withdraw" && currentBalance < params.amount) {
        throw new BankingError(
          "INSUFFICIENT_FUNDS",
          `Cannot withdraw ${params.amount} from balance ${currentBalance}`,
          currentBalance,
          expectedVersion
        );
      }

      // Attempt the update
      const result = await attemptBalanceUpdate({
        ...params,
        expectedVersion,
        idempotencyKey,
      });

      // Success!
      if (result.success) {
        return result;
      }

      // Non-retryable error
      if (
        result.errorCode &&
        !retryConfig.retryableErrors.includes(result.errorCode)
      ) {
        throw new BankingError(
          result.errorCode,
          result.errorMessage ?? "Unknown error",
          result.newBalance ?? undefined,
          result.newVersion ?? undefined
        );
      }

      // Retryable error - prepare for next attempt
      lastError = new BankingError(
        result.errorCode ?? "UNKNOWN_ERROR",
        result.errorMessage ?? "Unknown error",
        result.newBalance ?? undefined,
        result.newVersion ?? undefined
      );
    } catch (error) {
      if (error instanceof BankingError) {
        // Non-retryable errors throw immediately
        if (!error.isRetryable()) {
          throw error;
        }
        lastError = error;
      } else {
        // Unexpected error
        lastError = new BankingError(
          "UNKNOWN_ERROR",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    // Calculate delay and wait before retry
    if (attempt < retryConfig.maxRetries) {
      const delay = calculateBackoffDelay(attempt, retryConfig);
      console.log(
        `[Banking] Retry ${attempt + 1}/${retryConfig.maxRetries} ` +
          `after ${delay}ms due to: ${lastError?.code}`
      );
      await sleep(delay);
    }

    attempt++;
  }

  // All retries exhausted
  throw new BankingError(
    "MAX_RETRIES_EXCEEDED",
    `Failed after ${retryConfig.maxRetries} retries. Last error: ${lastError?.message}`,
    lastError?.currentBalance,
    lastError?.currentVersion
  );
}

/**
 * Fetches account details by ID.
 *
 * @param accountId - The account UUID
 * @returns Account details
 * @throws BankingError if account not found
 */
export async function getAccount(accountId: string): Promise<Account> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (error || !data) {
    throw new BankingError(
      "ACCOUNT_NOT_FOUND",
      `Failed to fetch account: ${error?.message ?? "Account not found"}`
    );
  }

  return mapAccountRow(data as AccountRow);
}

/**
 * Fetches the account for the current authenticated user.
 *
 * @returns Account details or null if no account exists
 */
export async function getUserAccount(): Promise<Account | null> {
  // Get the current authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Fetch account filtered by the authenticated user's ID
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned
      return null;
    }
    throw new BankingError("UNKNOWN_ERROR", `Failed to fetch account: ${error.message}`);
  }

  return mapAccountRow(data as AccountRow);
}

/**
 * Fetches or creates a demo account.
 * Use this for demo mode without authentication.
 *
 * @returns Demo account
 */
export async function getOrCreateDemoAccount(): Promise<Account> {
  // Try to get existing demo account (user_id is null for demo accounts)
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .is("user_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!error && data) {
    return mapAccountRow(data as AccountRow);
  }

  // Create new demo account
  return createAccount(100, "EUR", true);
}

/**
 * Fetches transaction history for an account.
 *
 * @param accountId - The account UUID
 * @param limit - Maximum number of transactions to fetch (default 50)
 * @returns Array of transactions, most recent first
 */
export async function getTransactions(
  accountId: string,
  limit: number = 50
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new BankingError(
      "UNKNOWN_ERROR",
      `Failed to fetch transactions: ${error.message}`
    );
  }

  return (data as TransactionRow[]).map(mapTransactionRow);
}

/**
 * Creates a new account for the current user or demo mode.
 *
 * @param initialBalance - Starting balance (default 100 for demo)
 * @param currency - Currency code (default EUR)
 * @param isDemo - If true, creates a demo account without auth
 * @returns The newly created account
 */
export async function createAccount(
  initialBalance: number = 100,
  currency: string = "EUR",
  isDemo: boolean = true
): Promise<Account> {
  const functionName = isDemo ? "create_demo_account" : "create_user_account";

  const { data, error } = await supabase.rpc(functionName, {
    p_initial_balance: initialBalance,
    p_currency: currency,
  });

  if (error) {
    throw new BankingError(
      "UNKNOWN_ERROR",
      `Failed to create account: ${error.message}`
    );
  }

  return mapAccountRow(data as AccountRow);
}

/**
 * Formats a balance for display with currency symbol.
 *
 * @param balance - The numeric balance
 * @param currency - Currency code
 * @returns Formatted string (e.g., "1,234.56 EUR")
 */
export function formatBalance(balance: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balance);
}

/**
 * Formats a date for display.
 *
 * @param dateString - ISO date string
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateString));
}
