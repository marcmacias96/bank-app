import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost } from "@rn-primitives/portal";
import { AuthProvider } from "@/contexts/auth-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(banking)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
        <PortalHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
