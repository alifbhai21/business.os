import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Button, Chip, ErrorBanner, FormModal, Input } from "../src/components/ui";
import { ApiError, authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka, takaToPaisa } from "../src/money";
import { newLocalId } from "../src/localId";

interface Expense {
  id: string;
  category: string;
  amount: number;
  paymentAccountId: string;
  note: string | null;
  expenseDate: string;
  duplicate?: boolean;
}

interface AccountLite {
  id: string;
  name: string;
  currentBalance: number;
}

const CATEGORIES = [
  "RENT",
  "ELECTRICITY",
  "INTERNET",
  "TRANSPORT",
  "OFFICE",
  "PACKAGING",
  "SALARY",
  "OTHER",
] as const;

const catKey: Record<string, string> = {
  RENT: "rent",
  ELECTRICITY: "electricity",
  INTERNET: "internet",
  TRANSPORT: "transport",
  OFFICE: "office",
  PACKAGING: "packaging",
  SALARY: "salary",
  OTHER: "other",
};

export function ExpensesScreen() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [items, setItems] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<string>("RENT");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

  const loadAccounts = useCallback(async () => {
    if (!bizId || !shopId) {
      setAccounts([]);
      return;
    }
    try {
      const res = await authRequest<{ data: AccountLite[] }>(
        `/api/v1/accounts?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
      );
      setAccounts(res.data);
    } catch {
      setAccounts([]);
    }
  }, [bizId, shopId]);

  const load = useCallback(async () => {
    if (!bizId || !shopId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authRequest<{ data: { items: Expense[] } }>(
        `/api/v1/expenses?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}&limit=100`
      );
      setItems(res.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    loadAccounts();
    load();
  }, [loadAccounts, load]);

  const submit = async () => {
    const paisa = takaToPaisa(amount);
    if (paisa <= 0) {
      setError(t("invalidAmount"));
      return;
    }
    if (!accountId) {
      setError(t("selectAccountRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // localId makes an offline retry of the SAME logical expense idempotent —
      // the server returns the original expense (duplicate: true) instead of
      // deducting the account twice.
      await authRequest("/api/v1/expenses", {
        method: "POST",
        body: {
          businessId: bizId,
          shopId,
          category,
          amount: paisa,
          paymentAccountId: accountId,
          note: note.trim() || null,
          localId: newLocalId("exp"),
        },
      });
      setModalOpen(false);
      setAmount("");
      setNote("");
      setCategory("RENT");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button title={`+ ${t("addExpense")}`} onPress={() => setModalOpen(true)} />
      </View>
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("noExpenses")}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{t(catKey[item.category] ?? item.category)}</Text>
                <Text style={styles.rowMeta}>{new Date(item.expenseDate).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.rowAmount}>-{formatTaka(item.amount)}</Text>
            </View>
          )}
        />
      )}
      <FormModal visible={modalOpen} onClose={() => setModalOpen(false)} title={t("addExpense")}>
        <ErrorBanner message={error} />
        <Text style={styles.fieldLabel}>{t("expenseCategory")}</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(catKey[c])} active={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
        <View style={{ height: 8 }} />
        <Input value={amount} onChangeText={setAmount} placeholder={t("amount")} keyboardType="decimal-pad" />
        <View style={{ height: 8 }} />
        <Text style={styles.fieldLabel}>{t("selectAccount")}</Text>
        <View style={styles.chipWrap}>
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} active={accountId === a.id} onPress={() => setAccountId(a.id)} />
          ))}
        </View>
        <View style={{ height: 8 }} />
        <Input value={note} onChangeText={setNote} placeholder={t("note")} />
        <View style={{ height: 16 }} />
        <Button title={t("save")} onPress={submit} loading={saving} />
      </FormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  toolbar: {
    marginBottom: 12,
    alignItems: "flex-end",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 6,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 14, fontWeight: "700", color: colors.danger },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});