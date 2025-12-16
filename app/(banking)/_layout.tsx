import { BankingProvider } from "@/contexts/banking-context";
import { Stack } from "expo-router";

export default function BankingLayout() {
  return (
    <BankingProvider>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: "DOLAR APP",
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="deposit"
          options={{
            title: "Deposit",
            headerShown: true,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="withdraw"
          options={{
            title: "Withdraw",
            headerShown: true,
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="history"
          options={{
            title: "Transaction History",
            headerShown: true,
          }}
        />
      </Stack>
    </BankingProvider>
  );
}
