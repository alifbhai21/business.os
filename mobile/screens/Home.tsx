import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DashboardScreen, type QuickAction } from "./Dashboard";
import { ProductsScreen } from "./Products";
import { PartiesScreen } from "./Parties";
import { TransactionsScreen } from "./Transactions";
import { InventoryScreen } from "./InventoryHub";
import { SettingsScreen, SettingsRoute } from "./Settings";
import { BusinessSwitcherScreen } from "./BusinessSwitcher";
import { ShopSwitcherScreen } from "./ShopSwitcher";
import { BusinessSettingsScreen } from "./BusinessSettings";
import { ShopManagementScreen } from "./ShopManagement";
import { AccountingScreen } from "./Accounting";
import { ReportsScreen } from "./Reports";
import { GlobalSearchScreen } from "./GlobalSearch";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";

type Tab = "dashboard" | "transactions" | "products" | "inventory" | "parties" | "settings";

/** Overlays beyond the Settings routes that Home hosts. */
type ExtraOverlay = "reports" | "search";

/** Dashboard quick-action destinations land on the transactions hub. */
const DASHBOARD_TXN_TARGET: Record<QuickAction, "sales" | "purchases" | "payments" | "expenses" | "accounts"> = {
  sale: "sales",
  purchase: "purchases",
  customerPayment: "payments",
  supplierPayment: "payments",
  expense: "expenses",
  transfer: "accounts",
};

export function Home() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [overlay, setOverlay] = useState<SettingsRoute | ExtraOverlay | null>(null);
  const [txnSection, setTxnSection] = useState<
    "sales" | "purchases" | "payments" | "accounts" | "expenses" | undefined
  >(undefined);
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "dashboard", label: t("dashboard"), icon: "▦" },
    { key: "transactions", label: t("sales"), icon: "🛒" },
    { key: "products", label: t("products"), icon: "◈" },
    { key: "inventory", label: t("inventory"), icon: "📦" },
    { key: "parties", label: t("customers"), icon: "👥" },
    { key: "settings", label: t("settings"), icon: "⚙" },
  ];

  if (overlay === "businessSwitcher") return <BusinessSwitcherScreen onDone={() => setOverlay(null)} />;
  if (overlay === "shopSwitcher") return <ShopSwitcherScreen onDone={() => setOverlay(null)} />;
  if (overlay === "businessSettings") return <BusinessSettingsScreen onDone={() => setOverlay(null)} />;
  if (overlay === "shopManagement") return <ShopManagementScreen onDone={() => setOverlay(null)} />;
  if (overlay === "accounting") return <AccountingScreen onDone={() => setOverlay(null)} />;
  if (overlay === "reports") return <ReportsScreen onDone={() => setOverlay(null)} />;
  if (overlay === "search") return <GlobalSearchScreen onDone={() => setOverlay(null)} />;

  const handleQuickAction = (action: QuickAction) => {
    setTxnSection(DASHBOARD_TXN_TARGET[action]);
    setTab("transactions");
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {tab === "dashboard" && (
          <DashboardScreen
            onQuickAction={handleQuickAction}
            onOpenReports={() => setOverlay("reports")}
            onOpenSearch={() => setOverlay("search")}
          />
        )}
        {tab === "transactions" && <TransactionsScreen initial={txnSection} />}
        {tab === "products" && <ProductsScreen />}
        {tab === "inventory" && <InventoryScreen />}
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