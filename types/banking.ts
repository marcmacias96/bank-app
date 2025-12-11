/**
 * Banking Types for Concurrent Balance Management
 * Peninsula Technical Test - Fullstack
 */

/**
 * Supported transaction types
 */
export type TransactionType = "deposit" | "withdraw";

/**
 * Transaction status values
 */
export type TransactionStatus = "completed" | "failed" | "pending";

/**
 * Error codes returned by the banking system
 */
export type BankingErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_TYPE"
  | "INVALID_AMOUNT"
  | "MAX_RETRIES_EXCEEDED"
  | "NETWORK_ERROR"
  | "UNAUTHORIZED"
  | "UNKNOWN_ERROR";

/**
 * Bank account model
 */
export interface Account {
  id: string;
  userId: string;
  balance: number;
  version: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transaction record model
 */
export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  versionAt: number;
  status: TransactionStatus;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}

/**
 * Parameters for balance update operation
 */
export interface UpdateBalanceParams {
  accountId: string;
  amount: number;
  type: TransactionType;
  idempotencyKey?: string;
}

/**
 * Result of a balance update operation
 */
export interface UpdateBalanceResult {
  success: boolean;
  newBalance: number | null;
  newVersion: number | null;
  errorCode: BankingErrorCode | null;
  errorMessage: string | null;
}

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: BankingErrorCode[];
}

/**
 * Default retry configuration
 * Uses exponential backoff with jitter
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  retryableErrors: ["VERSION_CONFLICT", "NETWORK_ERROR"],
};

/**
 * Custom error class for banking operations
 */
export class BankingError extends Error {
  constructor(
    public readonly code: BankingErrorCode,
    message: string,
    public readonly currentBalance?: number,
    public readonly currentVersion?: number
  ) {
    super(message);
    this.name = "BankingError";
    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BankingError);
    }
  }

  /**
   * Determines if this error can be recovered by retrying
   */
  isRetryable(): boolean {
    return this.code === "VERSION_CONFLICT" || this.code === "NETWORK_ERROR";
  }

  /**
   * Creates a user-friendly message for this error
   */
  getUserMessage(): string {
    switch (this.code) {
      case "INSUFFICIENT_FUNDS":
        return "Insufficient funds for this withdrawal";
      case "VERSION_CONFLICT":
        return "Transaction conflict, please try again";
      case "ACCOUNT_NOT_FOUND":
        return "Account not found";
      case "UNAUTHORIZED":
        return "You are not authorized to perform this action";
      case "INVALID_AMOUNT":
        return "Invalid amount specified";
      case "INVALID_TYPE":
        return "Invalid transaction type";
      case "MAX_RETRIES_EXCEEDED":
        return "Transaction failed after multiple attempts, please try again later";
      case "NETWORK_ERROR":
        return "Network error, please check your connection";
      default:
        return "An unexpected error occurred";
    }
  }
}

/**
 * Raw response from Supabase RPC call
 */
export interface SupabaseRpcResponse {
  success: boolean;
  new_balance: number | null;
  new_version: number | null;
  error_code: string | null;
  error_message: string | null;
}

/**
 * State shape for the banking context
 */
export interface BankingState {
  account: Account | null;
  transactions: Transaction[];
  isLoading: boolean;
  error: BankingError | null;
}

/**
 * Banking context type with state and actions
 */
export interface BankingContextType extends BankingState {
  updateBalance: (
    params: Omit<UpdateBalanceParams, "accountId">
  ) => Promise<UpdateBalanceResult>;
  refreshAccount: () => Promise<void>;
  refreshTransactions: (limit?: number) => Promise<void>;
  createAccount: (initialBalance?: number, currency?: string) => Promise<void>;
}

/**
 * Database row types (snake_case from Supabase)
 */
export interface AccountRow {
  id: string;
  user_id: string;
  balance: string; // DECIMAL comes as string
  version: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  account_id: string;
  type: TransactionType;
  amount: string; // DECIMAL comes as string
  balance_before: string;
  balance_after: string;
  version_at: number;
  status: TransactionStatus;
  error_message: string | null;
  idempotency_key: string | null;
  created_at: string;
}

/**
 * Converts a database account row to the Account model
 */
export function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    balance: parseFloat(row.balance),
    version: row.version,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Converts a database transaction row to the Transaction model
 */
export function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type,
    amount: parseFloat(row.amount),
    balanceBefore: parseFloat(row.balance_before),
    balanceAfter: parseFloat(row.balance_after),
    versionAt: row.version_at,
    status: row.status,
    errorMessage: row.error_message,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}
