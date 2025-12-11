import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface AuthTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function AuthTabs({ tabs, activeTab, onTabChange }: AuthTabsProps) {
  return (
    <View className="flex-row bg-muted rounded-lg p-1 mb-4">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Button
            key={tab.id}
            variant="ghost"
            onPress={() => onTabChange(tab.id)}
            className={cn(
              "flex-1 py-2 rounded-md",
              isActive && "bg-background shadow-sm"
            )}
          >
            <Text
              className={cn(
                "font-medium text-sm",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {tab.label}
            </Text>
          </Button>
        );
      })}
    </View>
  );
}
