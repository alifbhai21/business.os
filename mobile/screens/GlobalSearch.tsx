import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, ErrorBanner, Input } from "../src/components/ui";
import { authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka } from "../src/money";

/**
 * Phase 08 - global search.
 *
 * One term, five buckets (products, customers, suppliers, sales invoices,
 * purchase invoices). Results come straight from GET /api/v1/search which is
 * tenant- and shop-scoped server-side.
 */

interface SearchResults {
  products: { id: string; name: string; sku: string | null; barcode: string | null; currentStock: number; sellingPrice: number }[];
  customers: { id: string; name: string; phone: string | null; currentDue: number }[];
  suppliers: { id: string; name: string; phone: string | null; company: string | null; currentPayable: number }[];
  sales: { id: string; invoiceNo: string | null; status: string; total: number; customerName: string | null; saleDate: string }[];
  purchases: { id: string; invoiceNo: string | null; status: string; total: number; supplierName: string | null; purchaseDate: string }[];
}

const EMPTY: SearchResults = { products: [], customers: [], suppliers: [], sales: [], purchases: [] };

export function GlobalSearchScreen({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (q: string) => {
    if (!activeBusinessId) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ businessId: activeBusinessId, q: trimmed });
      if (activeShopId) qs.set("shopId", activeShopId);
      const res = await authRequest<{ data: SearchResults }>(`/api/v1/search?${qs.toString()}`);
      setResults(res.data);
    } catch (e) {
      setResults(null);
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId, activeShopId, t]);

  // Debounced live search - never fires per keystroke.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      run(term).catch(() => {});
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [term, run]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onDone ? (
          <View style={styles.backWrap}>
            <Button title={"←"} onPress={onDone} variant="secondary" />
          </View>
        ) : null}
        <Text style={styles.title}>{t("globalSearch")}</Text>
      </View>
      <View style={styles.searchWrap}>
        <Input value={term} onChangeText={setTerm} placeholder={t("searchProductsCustomersInvoices")} />
        {loading ? <ActivityIndicator style={styles.spin} color={colors.primary} /> : null}
      </View>
      {error ? <ErrorBanner message={error} /> : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
        {!results && !loading && !error ? (
          <Text style={styles.hint}>{t("searchHint")}</Text>
        ) : null}

        {results && results.products.length > 0 ? (
          <>
            <Text style={styles.bucketTitle}>{t("products")}</Text>
            {results.products.map((p) => (
              <Card key={p.id}>
                <Text style={styles.rowTitle}>{p.name}</Text>
                <Text style={styles.meta}>
                  {[p.sku, p.barcode].filter(Boolean).join(" · ") || "-"}
                </Text>
                <Text style={styles.metaStrong}>
                  {t("stock")}: {p.currentStock} · {formatTaka(p.sellingPrice)}
                </Text>
              </Card>
            ))}
          </>
        ) : null}

        {results && results.customers.length > 0 ? (
          <>
            <Text style={styles.bucketTitle}>{t("customers")}</Text>
            {results.customers.map((c) => (
              <Card key={c.id}>
                <Text style={styles.rowTitle}>{c.name}</Text>
                <Text style={styles.meta}>{c.phone ?? "-"}</Text>
                <Text style={[styles.metaStrong, { color: colors.danger }]}>
                  {t("dueLabel")}: {formatTaka(c.currentDue)}
                </Text>
              </Card>
            ))}
          </>
        ) : null}

        {results && results.suppliers.length > 0 ? (
          <>
            <Text style={styles.bucketTitle}>{t("suppliers")}</Text>
            {results.suppliers.map((s) => (
              <Card key={s.id}>
                <Text style={styles.rowTitle}>{s.name}</Text>
                <Text style={styles.meta}>{[s.company, s.phone].filter(Boolean).join(" · ") || "-"}</Text>
                <Text style={[styles.metaStrong, { color: colors.danger }]}>
                  {t("payableLabel")}: {formatTaka(s.currentPayable)}
                </Text>
              </Card>
            ))}
          </>
        ) : null}

        {results && results.sales.length > 0 ? (
          <>
            <Text style={styles.bucketTitle}>{t("sales")}</Text>
            {results.sales.map((s) => (
              <Card key={s.id}>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowTitle}>{s.invoiceNo ?? t("draftLabel")}</Text>
                  <Text style={styles.badge}>{s.status}</Text>
                </View>
                <Text style={styles.meta}>{s.customerName ?? t("walkIn")}</Text>
                <Text style={styles.metaStrong}>{formatTaka(s.total)}</Text>
              </Card>
            ))}
          </>
        ) : null}

        {results && results.purchases.length > 0 ? (
          <>
            <Text style={styles.bucketTitle}>{t("purchases")}</Text>
            {results.purchases.map((p) => (
              <Card key={p.id}>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowTitle}>{p.invoiceNo ?? t("draftLabel")}</Text>
                  <Text style={styles.badge}>{p.status}</Text>
                </View>
                <Text style={styles.meta}>{p.supplierName ?? "-"}</Text>
                <Text style={styles.metaStrong}>{formatTaka(p.total)}</Text>
              </Card>
            ))}
          </>
        ) : null}

        {results &&
          results.products.length === 0 &&
          results.customers.length === 0 &&
          results.suppliers.length === 0 &&
          results.sales.length === 0 &&
          results.purchases.length === 0 ? (
            <Card>
              <Text style={styles.hint}>{t("noData")}</Text>
            </Card>
          ) : null}
      </ScrollView>
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
  searchWrap: {
    padding: 16,
    paddingBottom: 8,
  },
  spin: {
    marginTop: 8,
  },
  bucketTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 10,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  metaStrong: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginTop: 3,
  },
  badge: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    backgroundColor: colors.chipBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  hint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 30,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
