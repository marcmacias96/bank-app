import { View, ScrollView, RefreshControl } from "react-native";
import { Link } from "expo-router";
import { useState, useCallback } from "react";
import { useBanking } from "@/contexts/banking-context";
import { formatBalance } from "@/lib/banking";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BankingDashboard() {
  const { account, transactions, isLoading, error, refreshAccount, createAccount } =
    useBanking();
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAccount();
    setRefreshing(false);
  }, [refreshAccount]);

  const handleCreateAccount = async () => {
    setCreating(true);
    try {
      await createAccount(1000, "EUR"); // Start with 1000 EUR for testing
    } catch (err) {
      console.error("Failed to create account:", err);
    } finally {
      setCreating(false);
    }
  };

  // Loading state
  if (isLoading && !account) {
    return (
      <View className="flex-1 bg-background p-4">
        <Skeleton className="h-40 w-full rounded-lg mb-4" />
        <Skeleton className="h-12 w-full rounded-lg mb-2" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </View>
    );
  }

  // No account state
  if (!account) {
    return (
      <View className="flex-1 bg-background p-4 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <Text className="text-xl font-bold">Welcome</Text>
            </CardTitle>
            <CardDescription>
              <Text className="text-muted-foreground">
                Create your first bank account to get started.
              </Text>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onPress={handleCreateAccount}
              disabled={creating}
              className="w-full"
            >
              <Text className="text-primary-foreground font-medium">
                {creating ? "Creating..." : "Create Account"}
              </Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View className="flex-1 bg-background p-4 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <Text className="text-xl font-bold text-destructive">Error</Text>
            </CardTitle>
            <CardDescription>
              <Text className="text-muted-foreground">
                {error.getUserMessage()}
              </Text>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onPress={onRefresh} className="w-full">
              <Text className="text-primary-foreground font-medium">
                Try Again
              </Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    );
  }

  const recentTransactions = transactions.slice(0, 3);

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View className="p-4 gap-4">
        {/* Balance Card */}
        <Card>
          <CardHeader>
            <CardDescription>
              <Text className="text-muted-foreground">Current Balance</Text>
            </CardDescription>
            <CardTitle>
              <Text className="text-4xl font-bold">
                {formatBalance(account.balance, account.currency)}
              </Text>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-row gap-3">
            <Link href="/(banking)/deposit" asChild>
              <Button className="flex-1">
                <Text className="text-primary-foreground font-medium">
                  Deposit
                </Text>
              </Button>
            </Link>
            <Link href="/(banking)/withdraw" asChild>
              <Button variant="outline" className="flex-1">
                <Text className="font-medium">Withdraw</Text>
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Text className="text-lg font-semibold">Account Info</Text>
            </CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-muted-foreground">Account ID</Text>
              <Text className="font-mono text-xs">
                {account.id.slice(0, 8)}...
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-muted-foreground">Currency</Text>
              <Text>{account.currency}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-muted-foreground">Version</Text>
              <Text>{account.version}</Text>
            </View>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="flex-row justify-between items-center">
            <CardTitle>
              <Text className="text-lg font-semibold">Recent Transactions</Text>
            </CardTitle>
            <Link href="/(banking)/history" asChild>
              <Button variant="ghost" size="sm">
                <Text className="text-primary text-sm">View All</Text>
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <Text className="text-muted-foreground text-center py-4">
                No transactions yet
              </Text>
            ) : (
              <View className="gap-3">
                {recentTransactions.map((tx) => (
                  <View
                    key={tx.id}
                    className="flex-row justify-between items-center py-2 border-b border-border"
                  >
                    <View>
                      <Text className="font-medium capitalize">{tx.type}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text
                      className={`font-semibold ${
                        tx.type === "deposit"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {tx.type === "deposit" ? "+" : "-"}
                      {formatBalance(tx.amount, account.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
