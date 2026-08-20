import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, ErrorBanner } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth";

export function BusinessSwitcherScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const { businesses, activeBusinessId, loadBusinesses, setActiveBusiness, loadShops } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBusinesses()
      .catch(() => setError(t("network")))
      .finally(() => setLoading(false));
  }, [loadBusinesses, t]);

  const switchBusiness = async (id: string) => {
    setActiveBusiness(id);
    await loadShops(id);
    onDone();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t("businessSwitcher")}</Text>
      <ErrorBanner message={error} />
      {businesses.length === 0 ? (
        <Text style={styles.empty}>{t("noData")}</Text>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <Card>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.type}</Text>
              {item.id === activeBusinessId ? (
                <Text style={styles.active}>{t("active")}</Text>
              ) : (
                <Button title={t("switch")} onPress={() => switchBusiness(item.id)} />
              )}
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 16 },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  active: { color: colors.success, fontWeight: "700", marginTop: 8 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});