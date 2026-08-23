import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Chip, ErrorBanner } from "../src/components/ui";
import { authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka } from "../src/money";

/**
 * Phase 08 — business reports.
 *
 * Sales / Purchases / Inventory / Financial. Every figure is rendered
 * directly from the server's report endpoints (GET /api/v1/reports/*) —
 * the app never derives financial values itself.
 */

type Section = "sales" | "purchases" | "inventory" | "financial";

interface SeriesRow {
  key: string;
  count: number;
  total: number;
  paid?: number;
  due?: number;
}

interface ProductRow {
  productId: string;
  productName: string;
  qtySold?: number;
  qtyPurchased?: number;
  salesTotal?: number;
  purchasesTotal?: number;
  costTotal?: number;
  netRevenue?: number;
  grossProfit?: number;
}

interface PartyRow {
  customerId?: string | null;
  supplierId?: string | null;
  customerName?: string | null;
  supplierName?: string | null;
  count: number;
  total: number;
  paid?: number;
  due?: number;
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={[rowStyles.label, strong && rowStyles.strong]}>{label}</Text>
      <Text style={[rowStyles.value, strong && rowStyles.strong, tone ? { color: tone } : null]}>
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  label: { fontSize: 14, color: colors.textMuted, flex: 1, paddingRight: 8 },
  value: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
  strong: { fontWeight: "700", color: colors.text, fontSize: 15 },
});

// ── Sales / Purchases ────────────────────────────────────────────────────────

function DocReport({ kind }: { kind: "sales" | "purchases" }) {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [mode, setMode] = useState<"daily" | "monthly">("daily");
  // NOTE: keep this union in a named type — a parenthesized conditional
  // inside useState's generic args trips the TSX parser.
  type Dimension = "none" | "product" | "customer" | "supplier";
  const [dimension, setDimension] = useState<Dimension>("none");
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [breakdown, setBreakdown] = useState<ProductRow[] | PartyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

  const load = useCallback(async () => {
    if (!bizId || !shopId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // API contract: grouping is chosen via groupBy alone - daily/monthly
      // series use the time mode, breakdowns switch groupBy to the dimension.
      const groupBy = dimension === "none" ? mode : dimension;
      const res = await authRequest<{ data: { items: ProductRow[] | PartyRow[] | SeriesRow[] } }>(
        `/api/v1/reports/${kind}?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}&groupBy=${groupBy}`
      );
      if (dimension === "none") {
        setSeries(res.data.items as SeriesRow[]);
        setBreakdown([]);
      } else {
        setBreakdown(res.data.items as ProductRow[] | PartyRow[]);
        setSeries([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, kind, mode, dimension, t]);

  useEffect(() => {
    load();
  }, [load]);

  const dims: { key: typeof dimension; label: string }[] =
    kind === "sales"
      ? [
          { key: "none", label: t("byDate") },
          { key: "product", label: t("byProduct") },
          { key: "customer", label: t("byCustomer") },
        ]
      : [
          { key: "none", label: t("byDate") },
          { key: "product", label: t("byProduct") },
          { key: "supplier", label: t("bySupplier") },
        ];

  return (
    <View>
      <View style={styles.chipWrap}>
        {dims.map((d) => (
          <Chip
            key={d.key}
            label={d.label}
            active={dimension === d.key}
            onPress={() => setDimension(d.key)}
          />
        ))}
      </View>
      <View style={styles.chipWrap}>
        <Chip label={t("daily")} active={mode === "daily"} onPress={() => setMode("daily")} />
        <Chip label={t("monthly")} active={mode === "monthly"} onPress={() => setMode("monthly")} />
      </View>

      {error && <ErrorBanner message={error} />}
      {loading ? (
        <ActivityIndicator style={styles.spinner} color={colors.primary} />
      ) : dimension === "none" ? (
        series.length === 0 ? (
          <Text style={styles.empty}>{t("noData")}</Text>
        ) : (
          series.map((r) => (
            <View key={r.key} style={styles.card}>
              <Row label={`${t("period")}: ${r.key}`} value={`${formatTaka(r.total)}`} strong />
              <Row label={t("count")} value={String(r.count)} />
              {r.paid !== undefined && <Row label={t("paidAmount")} value={formatTaka(r.paid ?? 0)} />}
              {r.due !== undefined && r.due > 0 && (
                <Row label={t("dueAmount")} value={formatTaka(r.due)} tone={colors.danger} />
              )}
            </View>
          ))
        )
      ) : breakdown.length === 0 ? (
        <Text style={styles.empty}>{t("noData")}</Text>
      ) : (
        (breakdown as (ProductRow & PartyRow)[]).map((r, i) => {
          const name = r.productName ?? r.customerName ?? r.supplierName ?? "?";
          const total = r.salesTotal ?? r.purchasesTotal ?? r.total ?? 0;
          const qty = r.qtySold ?? r.qtyPurchased;
          return (
            <View key={`${name}-${i}`} style={styles.card}>
              <Row label={name} value={formatTaka(total)} strong />
              {qty !== undefined && <Row label={t("qty")} value={String(qty)} />}
              {r.count !== undefined && <Row label={t("count")} value={String(r.count)} />}
              {r.netRevenue !== undefined && (
                <Row label={t("netRevenue")} value={formatTaka(r.netRevenue)} />
              )}
              {r.costTotal !== undefined && (
                <Row label={t("totalCost")} value={formatTaka(r.costTotal)} />
              )}
              {r.grossProfit !== undefined && (
                <Row
                  label={t("grossProfit")}
                  value={formatTaka(r.grossProfit)}
                  tone={r.grossProfit >= 0 ? colors.success : colors.danger}
                />
              )}
              {r.due !== undefined && r.due > 0 && (
                <Row label={t("dueAmount")} value={formatTaka(r.due)} tone={colors.danger} />
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

// ── Inventory ────────────────────────────────────────────────────────────────

interface InventorySummary {
  productCount: number;
  totalUnits: number;
  stockValue: number;
  retailValue: number;
  lowStockCount: number;
}

interface InventoryItem {
  id: string;
  name: string;
  currentStock: number;
  minStock: number;
  avgCost: number;
  stockValue: number;
  lowStock: boolean;
}

function InventorySection() {
  const { t } = useI18n();
  const { activeBusinessId } = useAuth();
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bizId = activeBusinessId ?? "";

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!bizId) {
        setLoading(false);
        return;
      }
      try {
        const res = await authRequest<{ data: { summary: InventorySummary; items: InventoryItem[] } }>(
          `/api/v1/reports/inventory?businessId=${encodeURIComponent(bizId)}&limit=100`
        );
        if (!alive) return;
        setSummary(res.data.summary);
        setItems(res.data.items);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bizId, t]);

  if (error) return <ErrorBanner message={error} />;
  if (loading || !summary) return <ActivityIndicator style={styles.spinner} color={colors.primary} />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Row label={t("stockValue")} value={formatTaka(summary.stockValue)} strong />
        <Row label={t("retailValue")} value={formatTaka(summary.retailValue)} />
        <Row label={t("totalProducts")} value={String(summary.productCount)} />
        <Row label={t("stockUnits")} value={String(summary.totalUnits)} />
        <Row
          label={t("lowStock")}
          value={String(summary.lowStockCount)}
          tone={summary.lowStockCount > 0 ? colors.danger : undefined}
        />
      </View>
      {items.map((p) => (
        <View key={p.id} style={styles.card}>
          <Row
            label={p.name}
            value={formatTaka(p.stockValue)}
            strong
            tone={p.lowStock ? colors.danger : undefined}
          />
          <Row
            label={`${t("stock")}: ${p.currentStock}${p.minStock > 0 ? ` / ${p.minStock}` : ""}`}
            value={`${t("avgCost")}: ${formatTaka(p.avgCost)}`}
          />
        </View>
      ))}
    </ScrollView>
  );
}

// ── Financial ────────────────────────────────────────────────────────────────

interface PLData {
  revenue: { total: number };
  cogs: { total: number };
  grossProfit: number;
  operatingExpenses: { total: number };
  netProfit: number;
}

interface ReceivablesData {
  totals: { total: number; count: number };
}

interface PayablesData {
  totals: { total: number; count: number };
}

interface ExpensesData {
  totalAmount: number;
  items: { category: string; count: number; total: number }[];
}

function FinancialSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [pl, setPl] = useState<PLData | null>(null);
  const [rec, setRec] = useState<ReceivablesData | null>(null);
  const [pay, setPay] = useState<PayablesData | null>(null);
  const [exp, setExp] = useState<ExpensesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!bizId) {
        setLoading(false);
        return;
      }
      setError(null);
      const qs = `businessId=${encodeURIComponent(bizId)}${shopId ? `&shopId=${encodeURIComponent(shopId)}` : ""}`;
      try {
        const [plR, recR, payR, expR] = await Promise.all([
          authRequest<{ data: PLData }>(`/api/v1/reports/profit-loss?${qs}`),
          authRequest<{ data: ReceivablesData }>(`/api/v1/reports/receivables?${qs}&limit=1`),
          authRequest<{ data: PayablesData }>(`/api/v1/reports/payables?${qs}&limit=1`),
          authRequest<{ data: ExpensesData }>(`/api/v1/reports/expenses?${qs}`),
        ]);
        if (!alive) return;
        setPl(plR.data);
        setRec(recR.data);
        setPay(payR.data);
        setExp(expR.data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bizId, shopId, t]);

  if (error) return <ErrorBanner message={error} />;
  if (loading || !pl) return <ActivityIndicator style={styles.spinner} color={colors.primary} />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("profitLoss")}</Text>
        <Row label={t("revenue")} value={formatTaka(pl.revenue.total)} />
        <Row label={t("costOfGoodsSold")} value={`-${formatTaka(pl.cogs.total)}`} />
        <Row
          label={t("grossProfit")}
          value={formatTaka(pl.grossProfit)}
          strong
          tone={pl.grossProfit >= 0 ? colors.success : colors.danger}
        />
        <Row label={t("operatingExpenses")} value={`-${formatTaka(pl.operatingExpenses.total)}`} />
        <Row
          label={t("netProfit")}
          value={formatTaka(pl.netProfit)}
          strong
          tone={pl.netProfit >= 0 ? colors.success : colors.danger}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("receivablePayable")}</Text>
        <Row label={t("receivable")} value={formatTaka(rec?.totals.total ?? 0)} />
        <Row label={t("payable")} value={formatTaka(pay?.totals.total ?? 0)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("expensesByCategory")}</Text>
        {(exp?.items.length ?? 0) === 0 ? (
          <Text style={styles.emptyInline}>{t("noData")}</Text>
        ) : (
          <>
            {exp!.items.map((c) => (
              <Row key={c.category} label={`${categoryLabel(c.category, t)}`} value={formatTaka(c.total)} />
            ))}
            <Row label={t("totalExpenses")} value={formatTaka(exp!.totalAmount)} strong />
          </>
        )}
      </View>
    </ScrollView>
  );
}

function categoryLabel(category: string, t: (k: string) => string): string {
  const key = `expCat_${category}`;
  const translated = t(key);
  if (translated !== key) return translated;
  // Fallback: humanize the enum.
  return category.charAt(0) + category.slice(1).toLowerCase();
}

// ── Hub ──────────────────────────────────────────────────────────────────────

export function ReportsScreen({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("sales");

  const sections: { key: Section; label: string }[] = [
    { key: "sales", label: t("sales") },
    { key: "purchases", label: t("purchases") },
    { key: "inventory", label: t("inventory") },
    { key: "financial", label: t("financialReport") },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onDone ? (
          <View style={styles.backWrap}>
            <Button title="←" onPress={onDone} variant="secondary" />
          </View>
        ) : null}
        <Text style={styles.title}>{t("reports")}</Text>
      </View>
      <View style={styles.chipsRow}>
        {sections.map((s) => (
          <Chip key={s.key} label={s.label} active={section === s.key} onPress={() => setSection(s.key)} />
        ))}
      </View>
      <View style={styles.content}>
        {section === "sales" && <DocReport kind="sales" />}
        {section === "purchases" && <DocReport kind="purchases" />}
        {section === "inventory" && <InventorySection />}
        {section === "financial" && <FinancialSection />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  backWrap: { width: 60, marginRight: 8 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  spinner: { marginTop: 48 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40, fontSize: 15 },
  emptyInline: { color: colors.textMuted, fontSize: 13 },
});
