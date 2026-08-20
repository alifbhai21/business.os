import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Card, Screen } from "../src/components/ui";
import { authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors, moduleLabels, typeLabels } from "../src/theme";

interface Counts {
  products: number;
  customers: number;
  suppliers: number;
}

export function DashboardScreen() {
  const { t, lang } = useI18n();
  const { business, user, activeBusinessId } = useAuth();
  const [counts, setCounts] = useState<Counts>({ products: 0, customers: 0, suppliers: 0 });

  const load = useCallback(async () => {
    if (!activeBusinessId) return;
    const q = `businessId=${encodeURIComponent(activeBusinessId)}&limit=1`;
    const [p, c, s] = await Promise.all([
      authRequest<{ data: { pagination: { total: number } } }>(`/api/v1/products?${q}`),
      authRequest<{ data: { pagination: { total: number } } }>(`/api/v1/customers?${q}`),
      authRequest<{ data: { pagination: { total: number } } }>(`/api/v1/suppliers?${q}`),
    ]);
    setCounts({ products: p.data.pagination.total, customers: c.data.pagination.total, suppliers: s.data.pagination.total });
  }, [activeBusinessId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      <Screen scroll>
        <Text style={styles.greeting}>{t("welcome")} 👋</Text>
        <Text style={styles.bizName}>{business?.name}</Text>
        <Text style={styles.bizType}>{business ? typeLabels[business.type as keyof typeof typeLabels][lang] : ""}</Text>

        <View style={styles.statsRow}>
          <Card style={[styles.stat, styles.statSuccess]}>
            <Text style={styles.statValue}>{counts.products}</Text>
            <Text style={styles.statLabel}>{t("totalProducts")}</Text>
          </Card>
          <Card style={[styles.stat, styles.statBlue]}>
            <Text style={styles.statValue}>{counts.customers}</Text>
            <Text style={styles.statLabel}>{t("totalCustomers")}</Text>
          </Card>
          <Card style={[styles.stat, styles.statOrange]}>
            <Text style={styles.statValue}>{counts.suppliers}</Text>
            <Text style={styles.statLabel}>{t("totalSuppliers")}</Text>
          </Card>
        </View>

        <Card>
          <Text style={styles.cardTitle}>{t("modulesForBusiness")}</Text>
          {(business?.modules ?? []).map((m) => (
            <Text key={m} style={styles.moduleRow}>
              • {moduleLabels[m]?.[lang] ?? m}
            </Text>
          ))}
        </Card>

        <Text style={styles.userLine}>
          {user?.name} · {user?.role}
        </Text>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  greeting: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 8,
  },
  bizName: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  bizType: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 18,
  },
  statSuccess: { backgroundColor: colors.surface },
  statBlue: { backgroundColor: colors.surface },
  statOrange: { backgroundColor: colors.surface },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 8,
  },
  moduleRow: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
  },
  userLine: {
    marginTop: 16,
    fontSize: 13,
    color: colors.textMuted,
  },
});