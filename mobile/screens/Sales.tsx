import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Chip, ErrorBanner, FormModal, Input } from "../src/components/ui";
import { ApiError, authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka, takaToPaisa } from "../src/money";
import { newLocalId } from "../src/localId";

interface Sale {
  id: string;
  invoiceNo: string | null;
  customerName: string | null;
  total: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: string;
  status: string;
  saleDate: string;
}

interface ProductLite {
  id: string;
  name: string;
  sellingPrice: number;
  currentStock: number;
}

interface CustomerLite {
  id: string;
  name: string;
  currentDue: number;
}

interface AccountLite {
  id: string;
  name: string;
}

const PAYMENT_METHODS = ["CASH", "BANK", "MOBILE_MONEY", "CARD"] as const;
const methodKey: Record<string, string> = {
  CASH: "cash",
  BANK: "bank",
  MOBILE_MONEY: "bkash",
  CARD: "card",
};

interface CartLine {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export function SalesScreen() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [items, setItems] = useState<Sale[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New sale form state
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [customerId, setCustomerId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [accountId, setAccountId] = useState("");

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
      const res = await authRequest<{ data: { items: Sale[] } }>(
        `/api/v1/sales?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}&limit=100`
      );
      setItems(res.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  const loadOptions = useCallback(async () => {
    if (!bizId || !shopId) {
      setProducts([]);
      setCustomers([]);
      setAccounts([]);
      return;
    }
    try {
      const [p, c, a] = await Promise.all([
        authRequest<{ data: { items: ProductLite[] } }>(
          `/api/v1/products?businessId=${encodeURIComponent(bizId)}&limit=100`
        ),
        authRequest<{ data: { items: CustomerLite[] } }>(
          `/api/v1/customers?businessId=${encodeURIComponent(bizId)}&limit=100`
        ),
        authRequest<{ data: AccountLite[] }>(
          `/api/v1/accounts?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
        ),
      ]);
      setProducts(p.data.items);
      setCustomers(c.data.items);
      setAccounts(a.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    load();
    loadOptions();
  }, [load, loadOptions]);

  const addToCart = () => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      setError(t("selectProduct"));
      return;
    }
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) {
      setError(t("invalidAmount"));
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, qty: l.qty + q } : l
        );
      }
      return [...prev, { productId: product.id, name: product.name, qty: q, unitPrice: product.sellingPrice }];
    });
    setSelectedProductId("");
    setQty("1");
    setError(null);
  };

  const submit = async () => {
    if (cart.length === 0) {
      setError(t("selectItems"));
      return;
    }
    if (!customerId && !walkInName.trim()) {
      setError(t("selectParty"));
      return;
    }
    const paid = takaToPaisa(paidAmount);
    if (paid > 0 && !accountId) {
      setError(t("selectAccountRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // The server recomputes every total from the Product records — the client
      // only proposes productId/qty/unitPrice. localId makes an offline retry
      // idempotent (duplicate:true returns the original sale).
      await authRequest("/api/v1/sales", {
        method: "POST",
        body: {
          businessId: bizId,
          shopId,
          items: cart.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unitPrice: l.unitPrice,
          })),
          customerId: customerId || null,
          customerName: walkInName.trim() || null,
          paidAmount: paid,
          accountId: accountId || null,
          localId: newLocalId("sal"),
        },
      });
      setModalOpen(false);
      setCart([]);
      setCustomerId("");
      setWalkInName("");
      setPaidAmount("");
      setAccountId("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setCart([]);
    setCustomerId("");
    setWalkInName("");
    setPaidAmount("");
    setAccountId("");
    setError(null);
    setModalOpen(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button title={`+ ${t("newSale")}`} onPress={openNew} />
      </View>
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("noSales")}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.invoiceNo ?? t("draft")}</Text>
                <Text style={styles.rowMeta}>
                  {item.customerName ?? t("walkIn")} · {t(item.paymentStatus.toLowerCase())}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.rowTotal}>{formatTaka(item.total)}</Text>
                <Text style={styles.rowDue}>
                  {t("dueAmount")}: {formatTaka(item.dueAmount)}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      <FormModal visible={modalOpen} onClose={() => setModalOpen(false)} title={t("newSale")}>
        <ScrollView>
          <ErrorBanner message={error} />
          <Text style={styles.fieldLabel}>{t("selectProduct")}</Text>
          <View style={styles.chipWrap}>
            {products.map((p) => (
              <Chip
                key={p.id}
                label={`${p.name} (${formatTaka(p.sellingPrice)})`}
                active={selectedProductId === p.id}
                onPress={() => setSelectedProductId(p.id)}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Input value={qty} onChangeText={setQty} placeholder={t("qty")} keyboardType="numeric" />
            </View>
            <View style={{ width: 8 }} />
            <Button title={`+ ${t("addToCart")}`} onPress={addToCart} />
          </View>

          {cart.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>{t("cart")}</Text>
              {cart.map((l) => (
                <View key={l.productId} style={styles.cartLine}>
                  <Text style={styles.cartName}>
                    {l.name} × {l.qty}
                  </Text>
                  <Text style={styles.cartPrice}>{formatTaka(l.unitPrice * l.qty)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 12 }} />
          <Text style={styles.fieldLabel}>{t("selectCustomer")}</Text>
          <View style={styles.chipWrap}>
            <Chip label={t("walkIn")} active={!customerId} onPress={() => setCustomerId("")} />
            {customers.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                active={customerId === c.id}
                onPress={() => setCustomerId(c.id)}
              />
            ))}
          </View>
          {!customerId && (
            <>
              <View style={{ height: 8 }} />
              <Input
                value={walkInName}
                onChangeText={setWalkInName}
                placeholder={t("walkIn")}
                autoCapitalize="words"
              />
            </>
          )}
          <View style={{ height: 8 }} />
          <Input value={paidAmount} onChangeText={setPaidAmount} placeholder={t("paidAmount")} keyboardType="decimal-pad" />
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
  formRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cartLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  cartName: {
    fontSize: 13,
    color: colors.text,
  },
  cartPrice: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
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
  rowTotal: { fontSize: 14, fontWeight: "700", color: colors.primary },
  rowDue: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});