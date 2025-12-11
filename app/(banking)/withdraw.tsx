import { View, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import { useBanking } from "@/contexts/banking-context";
import { formatBalance } from "@/lib/banking";
import { BankingError } from "@/types/banking";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function WithdrawScreen() {
  const { account, updateBalance } = useBanking();
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const currentBalance = account?.balance ?? 0;

  const handleWithdraw = async () => {
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount.");
      return;
    }

    if (numAmount > currentBalance) {
      Alert.alert(
        "Insufficient Funds",
        `You cannot withdraw more than your current balance of ${formatBalance(
          currentBalance,
          account?.currency ?? "EUR"
        )}.`
      );
      return;
    }

    setIsLoading(true);

    try {
      const result = await updateBalance({
        amount: numAmount,
        type: "withdraw",
      });

      if (result.success) {
        Alert.alert(
          "Success",
          `Withdrew ${formatBalance(numAmount, account?.currency ?? "EUR")}`,
          [{ text: "OK", onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          "Failed",
          result.errorMessage ?? "Withdrawal failed. Please try again."
        );
      }
    } catch (error) {
      if (error instanceof BankingError) {
        Alert.alert("Error", error.getUserMessage());
      } else {
        Alert.alert("Error", "An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Quick amounts based on current balance
  const quickAmounts = [10, 50, 100, 500].filter((a) => a <= currentBalance);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <View className="flex-1 p-4 justify-center">
        <Card>
          <CardHeader>
            <CardTitle>
              <Text className="text-2xl font-bold">Make a Withdrawal</Text>
            </CardTitle>
            <CardDescription>
              <Text className="text-muted-foreground">
                Available balance:{" "}
                {formatBalance(currentBalance, account?.currency ?? "EUR")}
              </Text>
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            {/* Amount Input */}
            <View className="gap-2">
              <Text className="font-medium">Amount ({account?.currency ?? "EUR"})</Text>
              <Input
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                className="text-2xl text-center"
                editable={!isLoading}
              />
            </View>

            {/* Quick Amount Buttons */}
            {quickAmounts.length > 0 && (
              <View className="flex-row flex-wrap gap-2">
                {quickAmounts.map((quickAmount) => (
                  <Button
                    key={quickAmount}
                    variant="outline"
                    size="sm"
                    onPress={() => setAmount(quickAmount.toString())}
                    disabled={isLoading}
                    className="flex-1 min-w-[70px]"
                  >
                    <Text>{quickAmount}</Text>
                  </Button>
                ))}
              </View>
            )}

            {/* Withdraw All Button */}
            {currentBalance > 0 && (
              <Button
                variant="secondary"
                onPress={() => setAmount(currentBalance.toString())}
                disabled={isLoading}
                className="w-full"
              >
                <Text className="text-secondary-foreground">
                  Withdraw All ({formatBalance(currentBalance, account?.currency ?? "EUR")})
                </Text>
              </Button>
            )}

            {/* Warning for large withdrawals */}
            {parseFloat(amount) > 0 && parseFloat(amount) === currentBalance && (
              <View className="bg-destructive/10 p-3 rounded-lg">
                <Text className="text-destructive text-sm text-center">
                  This will withdraw your entire balance
                </Text>
              </View>
            )}

            {/* Submit Button */}
            <Button
              onPress={handleWithdraw}
              disabled={isLoading || !amount || parseFloat(amount) > currentBalance}
              className="w-full mt-4"
            >
              <Text className="text-primary-foreground font-medium">
                {isLoading ? "Processing..." : "Withdraw"}
              </Text>
            </Button>

            {/* Cancel Button */}
            <Button
              variant="ghost"
              onPress={() => router.back()}
              disabled={isLoading}
              className="w-full"
            >
              <Text className="text-muted-foreground">Cancel</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}
