import { View, FlatList, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useBanking } from "@/contexts/banking-context";
import { formatBalance, formatDate } from "@/lib/banking";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Transaction } from "@/types/banking";

function TransactionItem({
  transaction,
  currency,
}: {
  transaction: Transaction;
  currency: string;
}) {
  const isDeposit = transaction.type === "deposit";
  const statusColors = {
    completed: "text-foreground",
    failed: "text-destructive",
    pending: "text-muted-foreground",
  };

  return (
    <Card className="mb-3">
      <CardContent className="py-3">
        <View className="flex-row justify-between items-start">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <View
                className={`w-2 h-2 rounded-full ${
                  isDeposit ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <Text className="font-semibold capitalize">{transaction.type}</Text>
              {transaction.status !== "completed" && (
                <View className="bg-muted px-2 py-0.5 rounded">
                  <Text className="text-xs text-muted-foreground capitalize">
                    {transaction.status}
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-muted-foreground mt-1">
              {formatDate(transaction.createdAt)}
            </Text>
            {transaction.errorMessage && (
              <Text className="text-xs text-destructive mt-1">
                {transaction.errorMessage}
              </Text>
            )}
          </View>
          <View className="items-end">
            <Text
              className={`font-bold text-lg ${
                isDeposit ? "text-green-600" : "text-red-600"
              } ${statusColors[transaction.status]}`}
            >
              {isDeposit ? "+" : "-"}
              {formatBalance(transaction.amount, currency)}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Balance: {formatBalance(transaction.balanceAfter, currency)}
            </Text>
          </View>
        </View>

        {/* Transaction Details */}
        <View className="mt-3 pt-3 border-t border-border">
          <View className="flex-row justify-between">
            <Text className="text-xs text-muted-foreground">Before</Text>
            <Text className="text-xs">
              {formatBalance(transaction.balanceBefore, currency)}
            </Text>
          </View>
          <View className="flex-row justify-between mt-1">
            <Text className="text-xs text-muted-foreground">After</Text>
            <Text className="text-xs">
              {formatBalance(transaction.balanceAfter, currency)}
            </Text>
          </View>
          <View className="flex-row justify-between mt-1">
            <Text className="text-xs text-muted-foreground">Version</Text>
            <Text className="text-xs font-mono">{transaction.versionAt}</Text>
          </View>
          {transaction.idempotencyKey && (
            <View className="flex-row justify-between mt-1">
              <Text className="text-xs text-muted-foreground">Idempotency Key</Text>
              <Text className="text-xs font-mono">
                {transaction.idempotencyKey.slice(0, 8)}...
              </Text>
            </View>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <View className="p-4 gap-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </View>
  );
}

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <Text className="text-muted-foreground text-center">
        No transactions yet.{"\n"}Make a deposit or withdrawal to see your history.
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const { account, transactions, isLoading, refreshTransactions } = useBanking();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshTransactions(100);
    setRefreshing(false);
  }, [refreshTransactions]);

  if (isLoading && transactions.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <LoadingSkeleton />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Summary Header */}
      <View className="p-4 bg-card border-b border-border">
        <View className="flex-row justify-between">
          <View>
            <Text className="text-muted-foreground text-sm">Total Transactions</Text>
            <Text className="text-2xl font-bold">{transactions.length}</Text>
          </View>
          <View className="items-end">
            <Text className="text-muted-foreground text-sm">Deposits</Text>
            <Text className="text-lg font-semibold text-green-600">
              {transactions.filter((t) => t.type === "deposit" && t.status === "completed").length}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-muted-foreground text-sm">Withdrawals</Text>
            <Text className="text-lg font-semibold text-red-600">
              {transactions.filter((t) => t.type === "withdraw" && t.status === "completed").length}
            </Text>
          </View>
        </View>
      </View>

      {/* Transaction List */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionItem
            transaction={item}
            currency={account?.currency ?? "EUR"}
          />
        )}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}
