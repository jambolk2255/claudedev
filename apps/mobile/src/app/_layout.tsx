import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading, Screen } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

function Navigator() {
  const { status, user } = useAuth();
  if (status === "loading") {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }
  return (
    <I18nProvider currency={user?.organization.currency}>
      <Routes />
    </I18nProvider>
  );
}

function Routes() {
  const { status } = useAuth();
  const { t } = useI18n();
  const c = useTheme();
  const header = { headerStyle: { backgroundColor: c.card }, headerTintColor: c.text, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } };
  return (
    <Stack screenOptions={{ ...header, headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Protected guard={status === "signedIn"}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: t("product.title") }} />
        <Stack.Screen name="order/[id]" options={{ title: t("order.title") }} />
        <Stack.Screen name="count" options={{ title: t("count.title") }} />
        <Stack.Screen name="sale" options={{ title: t("sale.title") }} />
      </Stack.Protected>
      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: (n, err) => !(err instanceof ApiError && err.status > 0 && err.status < 500) && n < 2 },
        },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <StatusBar style="auto" />
          <Navigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
