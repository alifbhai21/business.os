import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Card, Chip, ErrorBanner } from "../src/components/ui";
import { ApiError, authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka } from "../src/money";

/**
 * Phase 07 — read-only accounting reports.
 *
 * Every figure is rendered straight from the server's journal-derived
 * reports (GET /api/v1/accounting/*). The app never computes financial
 * values locally — the ledger is the single source of truth.
 */

type Section = "chart" | "pl" | "bs" | "cf" | "tb" | "ledger";

interface AccountLine {
  accountName: string;
  accountType: string;
  amount?: number;
  debit: number;
  credit: number;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={[rowStyles.label, strong && rowStyles.strong]}>{label}</Text>
      <Text style={[rowStyles.value, strong && rowStyles.strong]}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  label: { fontSize: 14, color: colors.textMuted, flex: 1, paddingRight: 8 },
  value: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
  strong: { fontWeight: "700", color: colors.text, fontSize: 15 },
});

function ReportCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

// ── Profit & Loss ───────────────────────────────────────────────────────────

interface PLData {
  revenue: { total: number; accounts: { accountName: string; amount: number }[] };
  cogs: { total: number; accounts: { accountName: string; amount: number }[] };
  grossProfit: number;
  operatingExpenses: { total: number; accounts: { accountName: string; amount: number }[] };
  netProfit: number;
}

export function PLSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [data, setData] = useState<PLData | null>(null);
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
      const res = await authRequest<{ data: PLData }>(
        `/api/v1/accounting/profit-loss?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Text style={styles.empty}>{t("noData")}</Text>;

  return (
    <View>
      <ReportCard>
        <Row label={t("revenue")} value={formatTaka(data.revenue.total)} />
        {data.revenue.accounts.map((a) => (
          <Row key={a.accountName} label={`   ${a.accountName}`} value={formatTaka(a.amount)} />
        ))}
        <Row label={t("costOfGoodsSold")} value={formatTaka(data.cogs.total)} />
        <Row label={t("grossProfit")} value={formatTaka(data.grossProfit)} strong />
        <Row label={t("operatingExpenses")} value={formatTaka(data.operatingExpenses.total)} />
        {data.operatingExpenses.accounts.map((a) => (
          <Row key={a.accountName} label={`   ${a.accountName}`} value={formatTaka(a.amount)} />
        ))}
        <Row label={t("netProfit")} value={formatTaka(data.netProfit)} strong />
      </ReportCard>
      <Button title={t("syncNow")} onPress={load} variant="secondary" />
    </View>
  );
}

// ── Balance Sheet ───────────────────────────────────────────────────────────

interface BSData {
  assets: { total: number; accounts: { accountName: string; amount: number }[] };
  liabilities: { total: number; accounts: { accountName: string; amount: number }[] };
  equity: { contributed: number; retainedEarnings: number; total: number };
}

export function BSSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [data, setData] = useState<BSData | null>(null);
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
      const res = await authRequest<{ data: BSData }>(
        `/api/v1/accounting/balance-sheet?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Text style={styles.empty}>{t("noData")}</Text>;

  return (
    <View>
      <ReportCard>
        <Row label={t("totalAssets")} value={formatTaka(data.assets.total)} strong />
        {data.assets.accounts.map((a) => (
          <Row key={a.accountName} label={`   ${a.accountName}`} value={formatTaka(a.amount)} />
        ))}
        <Row label={t("totalLiabilities")} value={formatTaka(data.liabilities.total)} strong />
        {data.liabilities.accounts.map((a) => (
          <Row key={a.accountName} label={`   ${a.accountName}`} value={formatTaka(a.amount)} />
        ))}
        <Row label={t("equity")} value={formatTaka(data.equity.total)} strong />
        <Row
          label={`   ${t("netProfit")}`}
          value={formatTaka(data.equity.retainedEarnings)}
        />
      </ReportCard>
      <Button title={t("syncNow")} onPress={load} variant="secondary" />
    </View>
  );
}

// ── Cash Flow ───────────────────────────────────────────────────────────────

interface CFData {
  operating: { inflow: number; outflow: number; net: number };
  investing: { inflow: number; outflow: number; net: number };
  financing: { inflow: number; outflow: number; net: number };
  interAccountTransfers: { inflow: number; outflow: number; net: number };
  netCashFlow: number;
}

export function CFSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [data, setData] = useState<CFData | null>(null);
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
      const res = await authRequest<{ data: CFData }>(
        `/api/v1/accounting/cash-flow?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Text style={styles.empty}>{t("noData")}</Text>;

  return (
    <View>
      <ReportCard>
        <Row
          label={t("operatingActivities")}
          value={`${formatTaka(data.operating.inflow)} / ${formatTaka(data.operating.outflow)}`}
        />
        <Row label={`${t("netAmount")} — ${t("operatingActivities")}`} value={formatTaka(data.operating.net)} strong />
        <Row
          label={t("investingActivities")}
          value={`${formatTaka(data.investing.inflow)} / ${formatTaka(data.investing.outflow)}`}
        />
        <Row
          label={t("financingActivities")}
          value={`${formatTaka(data.financing.inflow)} / ${formatTaka(data.financing.outflow)}`}
        />
        <Row
          label={t("interAccountTransfers")}
          value={formatTaka(data.interAccountTransfers.net)}
        />
        <Row label={t("cashFlow")} value={formatTaka(data.netCashFlow)} strong />
      </ReportCard>
      <Button title={t("syncNow")} onPress={load} variant="secondary" />
    </View>
  );
}

// ── Trial Balance ───────────────────────────────────────────────────────────

interface TBData {
  accounts: AccountLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export function TBSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [data, setData] = useState<TBData | null>(null);
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
      const res = await authRequest<{ data: TBData }>(
        `/api/v1/accounting/trial-balance?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Text style={styles.empty}>{t("noData")}</Text>;

  return (
    <View>
      <ReportCard>
        {data.accounts.length === 0 ? (
          <Text style={styles.empty}>{t("noData")}</Text>
        ) : (
          data.accounts.map((a) => (
            <Row key={a.accountName} label={a.accountName} value={formatTaka(a.debit - a.credit)} />
          ))
        )}
        <Row label={`${t("debit")} / ${t("credit")}`} value={`${formatTaka(data.totalDebit)} / ${formatTaka(data.totalCredit)}`} strong />
      </ReportCard>
      <Button title={t("syncNow")} onPress={load} variant="secondary" />
    </View>
  );
}

// ── General Ledger ──────────────────────────────────────────────────────────

interface LedgerRow {
  date: string;
  description: string;
  referenceType: string;
  accountName: string;
  debit: number;
  credit: number;
  runningBalance?: number;
}

interface LedgerResponse {
  data: {
    items: LedgerRow[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

const PAGE_SIZE = 50;

export function LedgerSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

  // Account options come from the trial balance (server-derived).
  useEffect(() => {
    (async () => {
      if (!bizId || !shopId) return;
      try {
        const res = await authRequest<{ data: TBData }>(
          `/api/v1/accounting/trial-balance?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
        );
        setAccounts(res.data.accounts.map((a) => a.accountName));
      } catch {
        // Non-fatal: the ledger still works unfiltered.
      }
    })();
  }, [bizId, shopId]);

  const load = useCallback(
    async (page = 1, append = false) => {
      if (!bizId || !shopId) {
        setRows([]);
        setLoading(false);
        return;
      }
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const qs = [
          `businessId=${encodeURIComponent(bizId)}`,
          `shopId=${encodeURIComponent(shopId)}`,
          `page=${page}`,
          `limit=${PAGE_SIZE}`,
        ];
        if (accountName) qs.push(`accountName=${encodeURIComponent(accountName)}`);
        const res = await authRequest<LedgerResponse>(`/api/v1/accounting/ledger?${qs.join("&")}`);
        const { items, pagination } = res.data;
        setRows((prev) => (append ? [...prev, ...items] : items));
        setHasMore(page < pagination.totalPages);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [bizId, shopId, accountName, t]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.chipWrap}>
        <Chip label={t("allAccounts")} active={!accountName} onPress={() => setAccountName("")} />
        {accounts.map((name) => (
          <Chip key={name} label={name} active={accountName === name} onPress={() => setAccountName(name)} />
        ))}
      </View>
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t("noData")}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => `${i}-${r.description}-${r.debit}-${r.credit}`}
          onEndReached={() => {
            if (hasMore && !loadingMore) load(Math.ceil(rows.length / PAGE_SIZE) + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.accountName}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {item.referenceType} · {item.description}
                </Text>
                <Text style={styles.rowMeta}>{new Date(item.date).toLocaleDateString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {item.debit > 0 ? (
                  <Text style={[styles.rowAmount, { color: colors.primary }]}>Dr {formatTaka(item.debit)}</Text>
                ) : null}
                {item.credit > 0 ? (
                  <Text style={[styles.rowAmount, { color: "#C0392B" }]}>Cr {formatTaka(item.credit)}</Text>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ── Chart of Accounts (Phase 12) ────────────────────────────────────────────

interface ChartAccount {
  name: string;
  accountType: string;
  normalBalance: string;
}

export function ChartSection() {
  const { t } = useI18n();
  const { activeBusinessId } = useAuth();
  const bizId = activeBusinessId ?? "";
  const [groups, setGroups] = useState<Array<{ type: string; accounts: ChartAccount[] }>>([]);
  const [expenseCats, setExpenseCats] = useState<Array<{ category: string; accountName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!bizId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await authRequest<{
          data: {
            grouped: Record<string, ChartAccount[]>;
            expenseCategories: Array<{ category: string; accountName: string }>;
          };
        }>(`/api/v1/accounting/chart?businessId=${encodeURIComponent(bizId)}`);
        const order = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
        setGroups(
          order
            .map((type) => ({ type, accounts: res.data.grouped[type] ?? [] }))
            .filter((g) => g.accounts.length > 0)
        );
        setExpenseCats(res.data.expenseCategories);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [bizId, t]);

  if (loading) return <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />;
  return (
    <View>
      <ErrorBanner message={error} />
      {groups.map((g) => (
        <Card key={g.type} style={{ marginBottom: 10 }}>
          <Text style={styles.groupTitle}>{t(g.type.toLowerCase())}</Text>
          {g.accounts.map((a) => (
            <View key={a.name} style={styles.accountRow}>
              <Text style={styles.accountName}>{a.name}</Text>
              <Text style={styles.normalBalance}>
                {t(a.normalBalance.toLowerCase())}
              </Text>
            </View>
          ))}
        </Card>
      ))}
      <Card>
        <Text style={styles.groupTitle}>{t("expenseCategories")}</Text>
        {expenseCats.map((c) => (
          <View key={c.category} style={styles.accountRow}>
            <Text style={styles.accountName}>{c.category}</Text>
            <Text style={styles.normalBalance}>{c.accountName}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

// ── Hub ─────────────────────────────────────────────────────────────────────

export function AccountingScreen({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("pl");

  const sections: { key: Section; label: string }[] = [
    { key: "chart", label: t("chartOfAccounts") },
    { key: "pl", label: t("profitLoss") },
    { key: "bs", label: t("balanceSheet") },
    { key: "cf", label: t("cashFlow") },
    { key: "tb", label: t("trialBalance") },
    { key: "ledger", label: t("generalLedger") },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onDone ? (
          <View style={styles.backWrap}>
            <Button title="←" onPress={onDone} variant="secondary" />
          </View>
        ) : null}
        <Text style={styles.title}>{t("accounting")}</Text>
      </View>
      <View style={styles.chipsRow}>
        {sections.map((s) => (
          <Chip key={s.key} label={s.label} active={section === s.key} onPress={() => setSection(s.key)} />
        ))}
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {section === "chart" && <ChartSection />}
        {section === "pl" && <PLSection />}
        {section === "bs" && <BSSection />}
        {section === "cf" && <CFSection />}
        {section === "tb" && <TBSection />}
        {section === "ledger" && <LedgerSection />}
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
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
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
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 14, fontWeight: "700" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
  groupTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  accountName: { fontSize: 14, color: colors.text },
  normalBalance: { fontSize: 12, color: colors.textMuted },
});
