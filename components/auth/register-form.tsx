import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/contexts/auth-context";
import { validateRegisterForm, type RegisterFormErrors } from "@/lib/validations";
import { FormField } from "./form-field";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function RegisterForm() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async () => {
    setServerError(null);

    const validation = validateRegisterForm(email, password, confirmPassword);
    setErrors(validation.errors);

    if (!validation.isValid) {
      return;
    }

    setIsLoading(true);

    try {
      await signUp(email, password);
      setIsSuccess(true);
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

  if (isSuccess) {
    return (
      <View className="items-center gap-4 py-4">
        <View className="bg-green-500/10 p-4 rounded-full">
          <Text className="text-2xl">✓</Text>
        </View>
        <Text className="text-lg font-semibold text-center">
          Account created!
        </Text>
        <Text className="text-muted-foreground text-center text-sm">
          You can now sign in with your credentials.
        </Text>
      </View>
    );
  }

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
        autoComplete="new-password"
        editable={!isLoading}
      />

      <FormField
        label="Confirm Password"
        placeholder="Confirm your password"
        value={confirmPassword}
        onChangeText={(text) => {
          setConfirmPassword(text);
          if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
        }}
        error={errors.confirmPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
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
          {isLoading ? "Creating account..." : "Create Account"}
        </Text>
      </Button>
    </View>
  );
}
