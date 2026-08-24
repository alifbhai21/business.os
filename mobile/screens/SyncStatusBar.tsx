import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useSync } from "../src/offline/SyncProvider";

/**
 * Phase 10 — global offline/sync indicator.
 *
 * Shows connection state, pending count and last-sync time; tapping it
 * triggers a manual sync. Rendered above the tab content in Home.
 */
export function SyncStatusBar() {
  const { t } = useI18n();
  const { online, syncing, pending, conflicts, failed, lastSyncAt, syncNow } = useSync();

  const needsAttention = conflicts + failed > 0;
  const label = !online
    ? `${t("offlineLabel")} · ${pending} ${t("queuedShort")}`
    : syncing
      ? t("syncingLabel")
      : needsAttention
        ? `${conflicts + failed} ${t("needsAttentionShort")}`
        : pending > 0
          ? `${pending} ${t("queuedShort")}`
          : t("onlineLabel");

  const bg = !online ? "#FEF3C7" : needsAttention ? "#FEE2E2" : "#DCFCE7";
  const fg = !online ? "#92400E" : needsAttention ? colors.danger : colors.success;

  return (
    <Pressable onPress={syncNow} style={[styles.bar, { backgroundColor: bg }]}>
      <Text style={[styles.dot, { color: fg }]}>●</Text>
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.action, { color: fg }]}>{syncing ? "…" : t("syncNowShort")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  dot: { fontSize: 10 },
  label: { flex: 1, fontSize: 12, fontWeight: "600" },
  action: { fontSize: 12, fontWeight: "700" },
});
