import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { StockSection } from "./Inventory";
import { MovementsSection } from "./StockMovements";
import { ReturnsSection } from "./Returns";
import { TransfersSection } from "./Transfers";

type Section = "stock" | "movements" | "returns" | "transfers";

/** Phase 06 — Inventory hub: stock list, movements ledger, returns, transfers. */
export function InventoryScreen() {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("stock");

  const sections: { key: Section; label: string; icon: string }[] = [
    { key: "stock", label: t("stockList"), icon: "▦" },
    { key: "movements", label: t("movements"), icon: "⇅" },
    { key: "returns", label: t("returns"), icon: "↩" },
    { key: "transfers", label: t("transfers"), icon: "⇄" },
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
        {section === "stock" && <StockSection />}
        {section === "movements" && <MovementsSection />}
        {section === "returns" && <ReturnsSection />}
        {section === "transfers" && <TransfersSection />}
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
    padding: 16,
  },
});
