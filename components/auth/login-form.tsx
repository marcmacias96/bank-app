import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/contexts/auth-context";
import { validateLoginForm, type LoginFormErrors } from "@/lib/validations";
import { FormField } from "./form-field";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setServerError(null);

    const validation = validateLoginForm(email, password);
    setErrors(validation.errors);

    if (!validation.isValid) {
      return;
    }

    setIsLoading(true);

    try {
      await signIn(email, password);
    } catch (error) {
      if (error instanceof Error) {
        setServerError(error.message);
      } else {
        setServerError("An unexpected error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="gap-4">
      <FormField
        label="Email"
        placeholder="Enter your email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
        }}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!isLoading}
      />

      <FormField
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
        }}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        editable={!isLoading}
      />

      {serverError && (
        <View className="bg-destructive/10 p-3 rounded-md">
          <Text className="text-destructive text-sm text-center">
            {serverError}
          </Text>
        </View>
      )}

      <Button
        onPress={handleSubmit}
        disabled={isLoading}
        className="w-full mt-2"
      >
        <Text className="text-primary-foreground font-medium">
          {isLoading ? "Signing in..." : "Sign In"}
        </Text>
      </Button>
    </View>
  );
}
