import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { I18nProvider, useI18n } from "./src/i18n";
import { AuthProvider, useAuth } from "./src/auth";
import { SyncProvider } from "./src/offline/SyncProvider";
import { WelcomeScreen } from "./screens/Welcome";
import { LoginScreen } from "./screens/Login";
import { RegisterScreen } from "./screens/Register";
import { BusinessSetupScreen } from "./screens/BusinessSetup";
import { ShopSetupScreen } from "./screens/ShopSetup";
import { Home } from "./screens/Home";
import { Button } from "./src/components/ui";
import { colors } from "./src/theme";

type BootState = "loading" | "ready" | "error";

function Root() {
  const { t } = useI18n();
  const {
    state,
    token,
    businesses,
    shops,
    activeBusinessId,
    activeShopId,
    loadBusinesses,
    setActiveShop,
  } = useAuth();
  const [view, setView] = useState<"welcome" | "login" | "register">("welcome");
  const [boot, setBoot] = useState<BootState>("loading");
  const [enteredHome, setEnteredHome] = useState(false);

  const bootBusinesses = useCallback(async () => {
    setBoot("loading");
    const ok = await loadBusinesses();
    setBoot(ok ? "ready" : "error");
  }, [loadBusinesses]);

  useEffect(() => {
    if (state === "authenticated" && token) bootBusinesses();
  }, [state, token, bootBusinesses]);

  useEffect(() => {
    if (!token) setEnteredHome(false);
  }, [token]);

  const canEnterHome = businesses.length > 0 && shops.length > 0;
  useEffect(() => {
    if (canEnterHome && boot === "ready" && !enteredHome) setEnteredHome(true);
  }, [canEnterHome, boot, enteredHome]);

  useEffect(() => {
    if (canEnterHome && boot === "ready" && !activeShopId) {
      setActiveShop(shops[0].id);
    }
  }, [canEnterHome, boot, activeShopId, shops, setActiveShop]);

  if (state === "initializing") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!token || state !== "authenticated") {
    if (view === "login") return <LoginScreen onBack={() => setView("welcome")} />;
    if (view === "register") return <RegisterScreen onBack={() => setView("welcome")} />;
    return <WelcomeScreen onLogin={() => setView("login")} onRegister={() => setView("register")} />;
  }
  if (boot === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (boot === "error") {
    return (
      <View style={styles.loading}>
        <Text style={styles.bootError}>{t("network")}</Text>
        <Button title={t("retry")} onPress={bootBusinesses} />
      </View>
    );
  }
  if (enteredHome) return <Home />;
  if (businesses.length === 0) {
    return <BusinessSetupScreen onDone={bootBusinesses} />;
  }
  return <ShopSetupScreen businessId={activeBusinessId ?? businesses[0].id} onDone={bootBusinesses} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12,
  },
  bootError: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <SyncProvider>
          <Root />
          <StatusBar style="auto" />
        </SyncProvider>
      </AuthProvider>
    </I18nProvider>
  );
}