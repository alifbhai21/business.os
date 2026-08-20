import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, ErrorBanner } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth";

export function ShopSwitcherScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId, shops, loadShops, setActiveShop } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeBusinessId) return;
    setError(null);
    const ok = await loadShops(activeBusinessId);
    if (!ok) setError(t("errorLoading"));
  }, [activeBusinessId, loadShops, t]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch(() => setError(t("network")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t("shopSwitcher")}</Text>
      <ErrorBanner message={error} />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 }}>
        <Button title={t("refresh")} onPress={refresh} variant="secondary" />
      </View>
      {shops.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.empty}>{t("noShops")}</Text>
          <Text style={styles.emptyHint}>{t("createFirstShop")}</Text>
        </View>
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => {
            const isActive = item.id === activeShopId;
            const inactive = item.status !== "ACTIVE";
            return (
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>
                      {item.branchCode}
                      {item.address ? ` · ${item.address}` : ""}
                    </Text>
                    <Text style={[styles.badge, inactive ? styles.badgeInactive : styles.badgeActive]}>
                      {inactive ? t("inactive") : t("active")}
                    </Text>
                  </View>
                  {isActive ? (
                    <Text style={styles.activeLabel}>{t("active")}</Text>
                  ) : (
                    <Button title={t("switch")} onPress={() => { setActiveShop(item.id); onDone(); }} />
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  badge: { alignSelf: "flex-start", fontSize: 11, fontWeight: "700", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 6, overflow: "hidden" },
  badgeActive: { color: colors.success },
  badgeInactive: { color: colors.danger },
  activeLabel: { color: colors.success, fontWeight: "700", fontSize: 14 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
  emptyHint: { textAlign: "center", color: colors.textMuted, marginTop: 8, fontSize: 13 },
  emptyBlock: { alignItems: "center" },
});