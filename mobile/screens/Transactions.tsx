import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { SalesScreen } from "./Sales";
import { PurchasesScreen } from "./Purchases";
import { PaymentsScreen } from "./Payments";
import { AccountsScreen } from "./Accounts";
import { ExpensesScreen } from "./Expenses";

type Section = "sales" | "purchases" | "payments" | "accounts" | "expenses";

export function TransactionsScreen() {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("sales");

  const sections: { key: Section; label: string; icon: string }[] = [
    { key: "sales", label: t("sales"), icon: "🛒" },
    { key: "purchases", label: t("purchases"), icon: "📦" },
    { key: "payments", label: t("payments"), icon: "💸" },
    { key: "accounts", label: t("accounts"), icon: "🏦" },
    { key: "expenses", label: t("expenses"), icon: "🧾" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.chipsRow}>
        {sections.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.chip, section === s.key && styles.chipActive]}
            onPress={() => setSection(s.key)}
          >
            <Text style={[styles.chipText, section === s.key && styles.chipTextActive]}>
              {s.icon} {s.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.content}>
        {section === "sales" && <SalesScreen />}
        {section === "purchases" && <PurchasesScreen />}
        {section === "payments" && <PaymentsScreen />}
        {section === "accounts" && <AccountsScreen />}
        {section === "expenses" && <ExpensesScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chipsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.chipBg,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFF",
  },
  content: {
    flex: 1,
  },
});