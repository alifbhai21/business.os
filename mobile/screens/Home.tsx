import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DashboardScreen } from "./Dashboard";
import { ProductsScreen } from "./Products";
import { PartiesScreen } from "./Parties";
import { TransactionsScreen } from "./Transactions";
import { SettingsScreen, SettingsRoute } from "./Settings";
import { BusinessSwitcherScreen } from "./BusinessSwitcher";
import { ShopSwitcherScreen } from "./ShopSwitcher";
import { BusinessSettingsScreen } from "./BusinessSettings";
import { ShopManagementScreen } from "./ShopManagement";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";

type Tab = "dashboard" | "transactions" | "products" | "parties" | "settings";

export function Home() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [overlay, setOverlay] = useState<SettingsRoute | null>(null);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "dashboard", label: t("dashboard"), icon: "▦" },
    { key: "transactions", label: t("sales"), icon: "🛒" },
    { key: "products", label: t("products"), icon: "◈" },
    { key: "parties", label: t("customers"), icon: "👥" },
    { key: "settings", label: t("settings"), icon: "⚙" },
  ];

  if (overlay === "businessSwitcher") return <BusinessSwitcherScreen onDone={() => setOverlay(null)} />;
  if (overlay === "shopSwitcher") return <ShopSwitcherScreen onDone={() => setOverlay(null)} />;
  if (overlay === "businessSettings") return <BusinessSettingsScreen onDone={() => setOverlay(null)} />;
  if (overlay === "shopManagement") return <ShopManagementScreen onDone={() => setOverlay(null)} />;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {tab === "dashboard" && <DashboardScreen />}
        {tab === "transactions" && <TransactionsScreen />}
        {tab === "products" && <ProductsScreen />}
        {tab === "parties" && <PartiesScreen />}
        {tab === "settings" && <SettingsScreen onNavigate={setOverlay} />}
      </View>
      <View style={styles.tabBar}>
        {tabs.map((tb) => {
          const active = tab === tb.key;
          return (
            <Pressable key={tb.key} style={styles.tabItem} onPress={() => setTab(tb.key)}>
              <Text style={[styles.tabIcon, active && { color: colors.primary }]}>{tb.icon}</Text>
              <Text style={[styles.tabLabel, active && { color: colors.primary, fontWeight: "700" }]}>
                {tb.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIcon: {
    fontSize: 18,
    color: colors.textMuted,
  },
  tabLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});