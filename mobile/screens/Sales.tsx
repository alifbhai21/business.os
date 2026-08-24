import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Chip, ErrorBanner, FormModal, InfoBanner, Input } from "../src/components/ui";
import { ApiError, API_URL, authRequest, getStoredAccessToken } from "../src/api";
import { authMutation } from "../src/offline/mutate";
import { BarcodeScannerModal } from "../src/BarcodeScanner";
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
  variantName?: string;
}

export function SalesScreen() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId, user } = useAuth();
  const [items, setItems] = useState<Sale[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Phase 12 — scan barcode → server lookup → prefill cart line.
  const [scannerOpen, setScannerOpen] = useState(false);

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

  // Phase 12 — resolve a scanned/typed barcode against the tenant-scoped
  // lookup endpoint and drop the product straight into the cart. The server
  // answers with the authoritative price; a variant's price delta rides on
  // matchedVariant.priceAdjustmentPaisa.
  const handleBarcode = async (code: string) => {
    setScannerOpen(false);
    setError(null);
    try {
      const res = await authRequest<{
        data: {
          id: string;
          name: string;
          sellingPrice: number;
          status: string;
          matchedVariant: { name: string; priceAdjustmentPaisa: number } | null;
        };
      }>(
        `/api/v1/products/lookup/barcode?businessId=${encodeURIComponent(bizId)}&barcode=${encodeURIComponent(code)}`
      );
      const p = res.data;
      if (p.status !== "ACTIVE") {
        setError(t("productNotActive"));
        return;
      }
      const unitPrice =
        p.sellingPrice + (p.matchedVariant?.priceAdjustmentPaisa ?? 0);
      setCart((prev) => {
        const existing = prev.find((l) => l.productId === p.id && l.variantName === (p.matchedVariant?.name ?? null));
        if (existing) {
          return prev.map((l) =>
            l.productId === p.id && l.variantName === (p.matchedVariant?.name ?? null)
              ? { ...l, qty: l.qty + 1 }
              : l
          );
        }
        return [
          ...prev,
          {
            productId: p.id,
            name: p.matchedVariant ? `${p.name} (${p.matchedVariant.name})` : p.name,
            qty: 1,
            unitPrice,
            variantName: p.matchedVariant?.name ?? undefined,
          },
        ];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
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
    setInfo(null);
    try {
      // The server recomputes every total from the Product records — the client
      // only proposes productId/qty/unitPrice. localId makes an offline retry
      // idempotent (duplicate:true returns the original sale). A network
      // failure queues the exact same payload durably for /sync/push.
      const result = await authMutation(user?.id ?? "", "sale", "/api/v1/sales", {
        businessId: bizId,
        shopId,
        items: cart.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          ...(l.variantName ? { variantName: l.variantName } : {}),
        })),
        customerId: customerId || null,
        customerName: walkInName.trim() || null,
        paidAmount: paid,
        accountId: accountId || null,
        localId: newLocalId("sal"),
      });
      if (result.queued) setInfo(t("queuedOffline"));
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

  // Phase 12 — share a server-rendered invoice summary and offer the
  // print-ready view (browser print dialog → PDF). Every figure comes from
  // the invoice serializer; nothing is recomputed here.
  const openInvoice = async (sale: Sale) => {
    setError(null);
    try {
      const res = await authRequest<{
        data: {
          invoiceNo: string | null;
          status: string;
          paymentStatus: string;
          counterparty: { name: string | null };
          items: Array<{ productName: string; variantName?: string | null; qty: number; lineTotal: number }>;
          totals: { total: number; paidAmount: number; dueAmount: number };
        };
      }>(
        `/api/v1/invoices/sales/${sale.id}?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
      );
      const inv = res.data;
      const lines = inv.items
        .map((l) => `• ${l.productName}${l.variantName ? ` (${l.variantName})` : ""} ×${l.qty} — ${formatTaka(l.lineTotal)}`)
        .join("\n");
      const summary = `${t("invoice")} ${inv.invoiceNo ?? sale.id}\n${lines}\n${t("total")}: ${formatTaka(
        inv.totals.total
      )} · ${t("due")}: ${formatTaka(inv.totals.dueAmount)}`;
      await Share.share({ title: t("invoice"), message: summary });
      // Print/PDF via the authoritative HTML view. Browsers cannot set
      // Authorization headers, so the short-lived access token rides in the
      // query (verified identically by requireAuth).
      const token = await getStoredAccessToken();
      void Linking.openURL(
        `${API_URL}/api/v1/invoices/sales/${sale.id}/print?businessId=${encodeURIComponent(
          bizId
        )}&shopId=${encodeURIComponent(shopId)}${token ? `&access_token=${encodeURIComponent(token)}` : ""}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button title={`+ ${t("newSale")}`} onPress={openNew} />
      </View>
      <InfoBanner message={info} />
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
                <Pressable onPress={() => void openInvoice(item)} hitSlop={8}>
                  <Text style={styles.invoiceLink}>🧾 {t("invoice")}</Text>
                </Pressable>
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
          <View style={{ height: 8 }} />
          <Button title={t("scanBarcode")} onPress={() => setScannerOpen(true)} variant="secondary" />

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

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(code) => void handleBarcode(code)}
      />
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
  invoiceLink: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 4,
  },
  rowDue: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});