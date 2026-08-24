import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Chip, ErrorBanner, FormModal, InfoBanner, Input } from "../src/components/ui";
import { ApiError, authRequest } from "../src/api";
import { authMutation } from "../src/offline/mutate";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka, takaToPaisa } from "../src/money";
import { newLocalId } from "../src/localId";

interface Payment {
  id: string;
  type: string;
  amount: number;
  method: string;
  paymentDate: string;
}

interface CustomerLite {
  id: string;
  name: string;
  currentDue: number;
}

interface SupplierLite {
  id: string;
  name: string;
  currentPayable: number;
}

interface AccountLite {
  id: string;
  name: string;
}

const METHOD_KEY: Record<string, string> = {
  CASH: "cash",
  BANK: "bank",
  MOBILE_MONEY: "bkash",
  CARD: "card",
};

const METHODS = ["CASH", "BANK", "MOBILE_MONEY", "CARD"] as const;

export function PaymentsScreen() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId, user } = useAuth();
  const [items, setItems] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<"customer_payment" | "supplier_payment">("customer_payment");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("CASH");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

  const load = useCallback(async () => {
    if (!bizId || !shopId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authRequest<{ data: Payment[] }>(
        `/api/v1/payments?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
      );
      setItems(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  const loadOptions = useCallback(async () => {
    if (!bizId || !shopId) {
      setCustomers([]);
      setSuppliers([]);
      setAccounts([]);
      return;
    }
    try {
      const [c, s, a] = await Promise.all([
        authRequest<{ data: { items: CustomerLite[] } }>(
          `/api/v1/customers?businessId=${encodeURIComponent(bizId)}&limit=100`
        ),
        authRequest<{ data: { items: SupplierLite[] } }>(
          `/api/v1/suppliers?businessId=${encodeURIComponent(bizId)}&limit=100`
        ),
        authRequest<{ data: AccountLite[] }>(
          `/api/v1/accounts?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
        ),
      ]);
      setCustomers(c.data.items);
      setSuppliers(s.data.items);
      setAccounts(a.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    load();
    loadOptions();
  }, [load, loadOptions]);

  const openNew = () => {
    setType("customer_payment");
    setPartyId("");
    setAmount("");
    setMethod("CASH");
    setAccountId("");
    setNote("");
    setError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    const paisa = takaToPaisa(amount);
    if (paisa <= 0) {
      setError(t("invalidAmount"));
      return;
    }
    if (!partyId) {
      setError(type === "customer_payment" ? t("selectCustomer") : t("selectSupplier"));
      return;
    }
    if (!accountId) {
      setError(t("selectAccountRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      // idempotencyKey / localId: an offline retry of the SAME payment returns
      // the original (duplicate:true) instead of moving money twice. A network
      // failure queues the exact payload durably.
      const payRef = newLocalId("pay");
      const result = await authMutation(user?.id ?? "", "payment", "/api/v1/payments", {
        businessId: bizId,
        shopId,
        type,
        customerId: type === "customer_payment" ? partyId : null,
        supplierId: type === "supplier_payment" ? partyId : null,
        amount: paisa,
        method,
        accountId,
        note: note.trim() || null,
        idempotencyKey: payRef,
        localId: payRef,
      });
      if (result.queued) setInfo(t("queuedOffline"));
      setModalOpen(false);
      setPartyId("");
      setAmount("");
      setAccountId("");
      setNote("");
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
        <Button title={`+ ${t("payments")}`} onPress={openNew} />
      </View>
      <InfoBanner message={info} />
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("noPayments")}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>
                  {item.type === "customer_payment" ? t("customerPayment") : t("supplierPayment")}
                </Text>
                <Text style={styles.rowMeta}>
                  {t(METHOD_KEY[item.method] ?? item.method)} ·{" "}
                  {new Date(item.paymentDate).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.rowAmount}>{formatTaka(item.amount)}</Text>
            </View>
          )}
        />
      )}

      <FormModal visible={modalOpen} onClose={() => setModalOpen(false)} title={t("payments")}>
        <ScrollView>
          <ErrorBanner message={error} />
          <View style={styles.typeRow}>
            <Button
              title={t("customerPayment")}
              variant={type === "customer_payment" ? "primary" : "secondary"}
              onPress={() => {
                setType("customer_payment");
                setPartyId("");
              }}
            />
            <Button
              title={t("supplierPayment")}
              variant={type === "supplier_payment" ? "primary" : "secondary"}
              onPress={() => {
                setType("supplier_payment");
                setPartyId("");
              }}
            />
          </View>
          <View style={{ height: 12 }} />
          <Text style={styles.fieldLabel}>
            {type === "customer_payment" ? t("selectCustomer") : t("selectSupplier")}
          </Text>
          <View style={styles.chipWrap}>
            {type === "customer_payment"
              ? customers.map((c) => (
                  <Chip
                    key={c.id}
                    label={`${c.name} (${t("due")}: ${formatTaka(c.currentDue)})`}
                    active={partyId === c.id}
                    onPress={() => setPartyId(c.id)}
                  />
                ))
              : suppliers.map((s) => (
                  <Chip
                    key={s.id}
                    label={`${s.name} (${formatTaka(s.currentPayable)})`}
                    active={partyId === s.id}
                    onPress={() => setPartyId(s.id)}
                  />
                ))}
          </View>
          <View style={{ height: 8 }} />
          <Input value={amount} onChangeText={setAmount} placeholder={t("amount")} keyboardType="decimal-pad" />
          <View style={{ height: 8 }} />
          <Text style={styles.fieldLabel}>{t("selectPaymentMethod")}</Text>
          <View style={styles.chipWrap}>
            {METHODS.map((m) => (
              <Chip
                key={m}
                label={t(METHOD_KEY[m])}
                active={method === m}
                onPress={() => setMethod(m)}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Text style={styles.fieldLabel}>{t("selectAccount")}</Text>
          <View style={styles.chipWrap}>
            {accounts.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                active={accountId === a.id}
                onPress={() => setAccountId(a.id)}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Input value={note} onChangeText={setNote} placeholder={t("note")} />
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={submit} loading={saving} />
        </ScrollView>
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
  typeRow: {
    flexDirection: "row",
    gap: 8,
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
  rowAmount: { fontSize: 14, fontWeight: "700", color: colors.primary },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});