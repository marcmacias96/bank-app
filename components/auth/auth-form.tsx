import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useState } from "react";
import { AuthTabs } from "./auth-tabs";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

const TABS = [
  { id: "login", label: "Sign In" },
  { id: "register", label: "Register" },
];

export function AuthForm() {
  const [activeTab, setActiveTab] = useState("login");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <Text className="text-2xl font-bold">DOLAR APP</Text>
        </CardTitle>
        <CardDescription>
          <Text className="text-muted-foreground">
            Sign in to access your account
          </Text>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        {activeTab === "login" ? <LoginForm /> : <RegisterForm />}
      </CardContent>
    </Card>
  );
}
