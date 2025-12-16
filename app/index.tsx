import { AuthForm } from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/contexts/auth-context";
import { Link } from "expo-router";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    View,
} from "react-native";

export default function Index() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Skeleton className="h-40 w-full max-w-sm rounded-lg" />
      </View>
    );
  }

  if (isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <Text className="text-2xl font-bold">DOLAR APP</Text>
            </CardTitle>
            <CardDescription>
              <Text className="text-muted-foreground">
                Welcome back!
              </Text>
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <Text className="text-center text-muted-foreground">
              Signed in as {user?.email}
            </Text>
            <Link href="/(banking)" asChild>
              <Button className="w-full">
                <Text className="text-primary-foreground font-medium">
                  Go to Banking
                </Text>
              </Button>
            </Link>
            <Button variant="outline" onPress={() => signOut()} className="w-full">
              <Text>Sign Out</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
        className="p-4"
      >
        <View className="items-center">
          <AuthForm />

          <View className="mt-4 items-center">
            <Link href="/(banking)" asChild>
              <Button variant="ghost">
                <Text className="text-muted-foreground text-sm">
                  Continue in demo mode
                </Text>
              </Button>
            </Link>
          </View>

          {/* Technical Info */}
          <View className="mt-8 p-4 bg-muted/50 rounded-lg w-full max-w-sm">
            <Text className="text-sm font-semibold mb-2">Technical Features:</Text>
            <Text className="text-xs text-muted-foreground">
              - Optimistic Locking with version control{"\n"}
              - Exponential backoff with jitter for retries{"\n"}
              - Idempotency keys for duplicate prevention{"\n"}
              - PostgreSQL CHECK constraint for balance validation
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
