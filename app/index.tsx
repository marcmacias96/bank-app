import { View } from "react-native";
import { Link, Redirect } from "expo-router";
import { useAuth } from "@/contexts/auth-context";
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

export default function Index() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Skeleton className="h-40 w-full max-w-sm rounded-lg" />
      </View>
    );
  }

  // For demo purposes, skip auth and go directly to banking
  // In production, you would check isAuthenticated
  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <Text className="text-2xl font-bold">Peninsula Banking</Text>
          </CardTitle>
          <CardDescription>
            <Text className="text-muted-foreground">
              Concurrent Balance Management Demo
            </Text>
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          {isAuthenticated ? (
            <>
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
            </>
          ) : (
            <>
              <Text className="text-center text-muted-foreground">
                Please sign in to access your account.
              </Text>
              <Link href="/(banking)" asChild>
                <Button className="w-full">
                  <Text className="text-primary-foreground font-medium">
                    Demo Mode (No Auth)
                  </Text>
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

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
  );
}
