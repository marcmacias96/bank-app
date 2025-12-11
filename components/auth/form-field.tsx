import { View, type TextInputProps } from "react-native";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function FormField({ label, error, className, ...props }: FormFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="font-medium text-sm">{label}</Text>
      <Input
        className={cn(error && "border-destructive", className)}
        {...props}
      />
      {error && (
        <Text className="text-destructive text-xs">{error}</Text>
      )}
    </View>
  );
}
