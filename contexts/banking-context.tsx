/**
 * Banking Context for React Native
 * Peninsula Technical Test - Fullstack
 *
 * Provides global state management for banking operations.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  updateBalance as updateBalanceService,
  getAccount,
  getUserAccount,
  getTransactions,
  createAccount as createAccountService,
  getOrCreateDemoAccount,
} from "@/lib/banking";
import type {
  Account,
  Transaction,
  BankingContextType,
  UpdateBalanceParams,
  UpdateBalanceResult,
} from "@/types/banking";
import { BankingError } from "@/types/banking";

const BankingContext = createContext<BankingContextType | undefined>(undefined);

interface BankingProviderProps {
  children: ReactNode;
}

export function BankingProvider({ children }: BankingProviderProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<BankingError | null>(null);

  /**
   * Fetches the user's account when authenticated, or demo account otherwise
   */
  const refreshAccount = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let data: Account | null;
      if (isAuthenticated) {
        // Authenticated: get user's account
        data = await getUserAccount();
      } else {
        // Demo mode: get or create demo account
        data = await getOrCreateDemoAccount();
      }

      setAccount(data);
    } catch (err) {
      if (err instanceof BankingError) {
        setError(err);
      } else {
        setError(
          new BankingError(
            "UNKNOWN_ERROR",
            err instanceof Error ? err.message : "Failed to fetch account"
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  /**
   * Fetches transactions for the current account
   */
  const refreshTransactions = useCallback(
    async (limit: number = 50) => {
      if (!account) return;

      try {
        const data = await getTransactions(account.id, limit);
        setTransactions(data);
      } catch (err) {
        console.error("Failed to fetch transactions:", err);
      }
    },
    [account]
  );

  /**
   * Creates a new account for the user
   */
  const createAccount = useCallback(
    async (initialBalance: number = 0, currency: string = "EUR") => {
      try {
        setIsLoading(true);
        setError(null);
        const newAccount = await createAccountService(initialBalance, currency);
        setAccount(newAccount);
      } catch (err) {
        if (err instanceof BankingError) {
          setError(err);
          throw err;
        } else {
          const bankingError = new BankingError(
            "UNKNOWN_ERROR",
            err instanceof Error ? err.message : "Failed to create account"
          );
          setError(bankingError);
          throw bankingError;
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Updates the account balance with optimistic locking
   */
  const updateBalance = useCallback(
    async (
      params: Omit<UpdateBalanceParams, "accountId">
    ): Promise<UpdateBalanceResult> => {
      if (!account) {
        throw new BankingError("ACCOUNT_NOT_FOUND", "No account found");
      }

      try {
        setError(null);
        const result = await updateBalanceService({
          ...params,
          accountId: account.id,
        });

        if (result.success && result.newBalance !== null && result.newVersion !== null) {
          // Update local state optimistically
          setAccount((prev) =>
            prev
              ? {
                  ...prev,
                  balance: result.newBalance!,
                  version: result.newVersion!,
                  updatedAt: new Date().toISOString(),
                }
              : null
          );

          // Refresh transactions to show the new one
          await refreshTransactions();
        }

        return result;
      } catch (err) {
        if (err instanceof BankingError) {
          setError(err);
          throw err;
        }
        const bankingError = new BankingError(
          "UNKNOWN_ERROR",
          err instanceof Error ? err.message : "Transaction failed"
        );
        setError(bankingError);
        throw bankingError;
      }
    },
    [account, refreshTransactions]
  );

  // Load account when auth state changes
  useEffect(() => {
    if (!authLoading) {
      refreshAccount();
    }
  }, [authLoading, isAuthenticated, refreshAccount]);

  // Load transactions when account changes
  useEffect(() => {
    if (account) {
      refreshTransactions();
    } else {
      setTransactions([]);
    }
  }, [account?.id, refreshTransactions]);

  const value: BankingContextType = {
    account,
    transactions,
    isLoading,
    error,
    updateBalance,
    refreshAccount,
    refreshTransactions,
    createAccount,
  };

  return (
    <BankingContext.Provider value={value}>{children}</BankingContext.Provider>
  );
}

/**
 * Hook to access banking context
 * @throws Error if used outside BankingProvider
 */
export function useBanking() {
  const context = useContext(BankingContext);
  if (context === undefined) {
    throw new Error("useBanking must be used within a BankingProvider");
  }
  return context;
}
