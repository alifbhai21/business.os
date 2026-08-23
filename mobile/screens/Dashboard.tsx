import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { Card, ErrorBanner } from "../src/components/ui";
import { authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors, moduleLabels, typeLabels } from "../src/theme";
import { formatTaka } from "../src/money";

/**
 * Phase 08 — Owner dashboard.
 *
 * Every figure is fetched from the server-authoritative dashboard endpoint
 * (GET /api/v1/dashboard). The app NEVER computes financial truth locally:
 * sales, purchases, expenses, profit, stock value, cash, receivables,
 * payables and low stock all arrive as integer paisa computed on the server.
 *
 * Quick actions land on the matching Transactions-hub section via Home;
 * reports/search open as overlays.
 */

export type QuickAction =
  | "sale"
  | "purchase"
  | "customerPayment"
  | "supplierPayment"
  | "expense"
  | "transfer";

interface DashboardScreenProps {
  onQuickAction?: (action: QuickAction) => void;
  onOpenReports?: () => void;
  onOpenSearch?: () => void;
}

interface DashboardData {
  today: {
    salesCount: number;
    salesTotal: number;
    salesPaid: number;
    salesDue: number;
    purchasesCount: number;
    purchasesTotal: number;
    expensesCount: number;
    expensesTotal: number;
    grossProfit: number;
  };
  stockValue: number;
  cash: { total: number };
  receivablesTotal: number;
  payablesTotal: number;
  lowStockCount: number;
  lowStock: { id: string; name: string; currentStock: number; minStock: number }[];
  recentTransactions: {
    type: string;
    id: string;
    date: string;
    refNo: string | null;
    party: string | null;
    amount: number;
  }[];
}

export function DashboardScreen({ onQuickAction, onOpenReports, onOpenSearch }: DashboardScreenProps) {
  const { t, lang } = useI18n();
  const { business, user, activeBusinessId, activeShopId } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

  const load = useCallback(async () => {
    if (!bizId) {
      setLoading(false);
      return;
    }
    setError(null);
    const qs = `businessId=${encodeURIComponent(bizId)}${shopId ? `&shopId=${encodeURIComponent(shopId)}` : ""}`;
    try {
      const res = await authRequest<{ data: DashboardData }>(`/api/v1/dashboard?${qs}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const quickActions: { action: QuickAction; label: string; icon: string }[] = [
    { action: "sale", label: t("qaSale"), icon: "+" },
    { action: "purchase", label: t("qaPurchase"), icon: "+" },
    { action: "customerPayment", label: t("qaPayment"), icon: "+" },
    { action: "expense", label: t("qaExpense"), icon: "+" },
    { action: "transfer", label: t("qaTransfer"), icon: "⇄" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{t("welcome")} 👋</Text>
            <Text style={styles.bizName}>{business?.name}</Text>
            <Text style={styles.bizType}>
              {business ? typeLabels[business.type as keyof typeof typeLabels][lang] : ""}
            </Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => onOpenSearch?.()}>
            <Text style={styles.iconTxt}>🔍</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => onOpenReports?.()}>
            <Text style={styles.iconTxt}>📊</Text>
          </Pressable>
        </View>

        {error && <ErrorBanner message={error} />}
        {error && (
          <Pressable style={styles.retry} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryTxt}>{t("retry")}</Text>
          </Pressable>
        )}

        {loading && !data ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : data ? (
          <>
            {/* Quick actions */}
            <View style={styles.qaRow}>
              {quickActions.map((a) => (
                <Pressable key={a.action} style={styles.qaBtn} onPress={() => onQuickAction?.(a.action)}>
                  <Text style={styles.qaIcon}>{a.icon}</Text>
                  <Text style={styles.qaLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Today's key metrics — all server-computed */}
            <Text style={styles.section}>{t("todaySummary")}</Text>
            <View style={styles.grid2}>
              <Card style={styles.cell}>
                <Text style={[styles.cellValue, { color: colors.success }]}>
                  {formatTaka(data.today.salesTotal)}
                </Text>
                <Text style={styles.cellLabel}>
                  {t("todaySales")} ({data.today.salesCount})
                </Text>
              </Card>
              <Card style={styles.cell}>
                <Text style={[styles.cellValue, { color: colors.danger }]}>
                  {formatTaka(data.today.purchasesTotal)}
                </Text>
                <Text style={styles.cellLabel}>
                  {t("todayPurchases")} ({data.today.purchasesCount})
                </Text>
              </Card>
              <Card style={styles.cell}>
                <Text style={[styles.cellValue, { color: colors.danger }]}>
                  {formatTaka(data.today.expensesTotal)}
                </Text>
                <Text style={styles.cellLabel}>
                  {t("todayExpenses")} ({data.today.expensesCount})
                </Text>
              </Card>
              <Card style={styles.cell}>
                <Text
                  style={[
                    styles.cellValue,
                    { color: data.today.grossProfit >= 0 ? colors.success : colors.danger },
                  ]}
                >
                  {formatTaka(data.today.grossProfit)}
                </Text>
                <Text style={styles.cellLabel}>{t("grossProfit")}</Text>
              </Card>
            </View>

            {/* Balance snapshot */}
            <Text style={styles.section}>{t("businessPosition")}</Text>
            <View style={styles.grid2}>
              <Card style={styles.cell}>
                <Text style={styles.cellValue}>{formatTaka(data.cash.total)}</Text>
                <Text style={styles.cellLabel}>{t("cashBalance")}</Text>
              </Card>
              <Card style={styles.cell}>
                <Text style={styles.cellValue}>{formatTaka(data.stockValue)}</Text>
                <Text style={styles.cellLabel}>{t("stockValue")}</Text>
              </Card>
              <Card style={styles.cell}>
                <Text style={[styles.cellValue, { color: colors.primary }]}>
                  {formatTaka(data.receivablesTotal)}
                </Text>
                <Text style={styles.cellLabel}>{t("receivable")}</Text>
              </Card>
              <Card style={styles.cell}>
                <Text style={[styles.cellValue, { color: colors.danger }]}>
                  {formatTaka(data.payablesTotal)}
                </Text>
                <Text style={styles.cellLabel}>{t("payable")}</Text>
              </Card>
            </View>

            {/* Low stock */}
            <View style={styles.sectionRow}>
              <Text style={styles.section}>{t("lowStock")}</Text>
              <Text style={styles.badge}>{data.lowStockCount}</Text>
            </View>
            {data.lowStock.length === 0 ? (
              <Card>
                <Text style={styles.emptyRow}>{t("noLowStock")}</Text>
              </Card>
            ) : (
              data.lowStock.map((p) => (
                <Card key={p.id} style={styles.rowCard}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.rowMetaLow}>
                    {p.currentStock} / {p.minStock}
                  </Text>
                </Card>
              ))
            )}

            {/* Recent transactions */}
            <Text style={styles.section}>{t("recentActivity")}</Text>
            {data.recentTransactions.length === 0 ? (
              <Card>
                <Text style={styles.emptyRow}>{t("noRecentActivity")}</Text>
              </Card>
            ) : (
              data.recentTransactions.map((r) => (
                <Card key={`${r.type}-${r.id}`} style={styles.rowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {recentLabel(r, lang)}
                      {r.refNo ? ` · ${r.refNo}` : ""}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {r.party ?? new Date(r.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.rowAmount,
                      { color: r.amount >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    {r.amount >= 0 ? "" : "-"}
                    {formatTaka(Math.abs(r.amount))}
                  </Text>
                </Card>
              ))
            )}
          </>
        ) : null}

        {/* Business modules + user line retained from the previous dashboard */}
        {business && (
          <Card>
            <Text style={styles.cardTitle}>{t("modulesForBusiness")}</Text>
            {(business.modules ?? []).map((m) => (
              <Text key={m} style={styles.moduleRow}>
                • {moduleLabels[m]?.[lang] ?? m}
              </Text>
            ))}
            <Text style={styles.userLine}>
              {user?.name} · {user?.role}
            </Text>
          </Card>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function recentLabel(
  r: { type: string; party: string | null },
  lang: "bn" | "en"
): string {
  const map: Record<string, [string, string]> = {
    SALE: ["বিক্রয়", "Sale"],
    PURCHASE: ["ক্রয়", "Purchase"],
    EXPENSE: ["খরচ", "Expense"],
    PAYMENT: ["পেমেন্ট", "Payment"],
  };
  const entry = map[r.type] ?? [r.type, r.type];
  return lang === "bn" ? entry[0] : entry[1];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 12,
  },
  greeting: {
    fontSize: 15,
    color: colors.textMuted,
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
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    marginTop: 4,
  },
  iconTxt: { fontSize: 17 },
  retry: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  retryTxt: { color: colors.primary, fontWeight: "700" },
  spinner: { marginTop: 48 },
  qaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  qaBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 78,
  },
  qaIcon: { fontSize: 15, color: colors.primary, fontWeight: "800" },
  qaLabel: { fontSize: 11, color: colors.text, fontWeight: "600", marginTop: 2 },
  section: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    backgroundColor: colors.chipBg,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  grid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  cell: {
    flexGrow: 1,
    flexBasis: "46%",
    alignItems: "center",
    paddingVertical: 14,
    marginBottom: 0,
  },
  cellValue: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  cellLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  rowTitle: { fontSize: 14, fontWeight: "600", color: colors.text, flex: 1, paddingRight: 8 },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2, flex: 1, paddingRight: 8 },
  rowMetaLow: { fontSize: 13, color: colors.danger, fontWeight: "700" },
  rowAmount: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  emptyRow: { color: colors.textMuted, fontSize: 13 },
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
    marginTop: 10,
    fontSize: 13,
    color: colors.textMuted,
  },
});
