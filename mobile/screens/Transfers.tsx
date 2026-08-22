import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { newLocalId } from "../src/localId";

interface TransferRow {
  id: string;
  sourceShopId: string;
  destShopId: string;
  productId: string;
  quantity: number;
  status: string;
}

interface ProductLite {
  id: string;
  name: string;
}

interface ShopLite {
  id: string;
  name: string;
}

const STATUS_KEY: Record<string, string> = {
  PENDING: "pending",
  IN_TRANSIT: "inTransit",
  RECEIVED: "received",
  CANCELLED: "cancelled",
};

/** Phase 06 — stock transfers between the business's own shops. */
export function TransfersSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId, shops } = useAuth();
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form
  const [sourceShopId, setSourceShopId] = useState("");
  const [destShopId, setDestShopId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

  const load = useCallback(async () => {
    if (!bizId || !shopId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authRequest<{ data: { items: TransferRow[] } }>(
        `/api/v1/transfers?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}&limit=100`
      );
      setRows(res.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  const loadProducts = useCallback(async () => {
    if (!bizId) return;
    try {
      const res = await authRequest<{ data: { items: ProductLite[] } }>(
        `/api/v1/products?businessId=${encodeURIComponent(bizId)}&limit=100`
      );
      setProducts(res.data.items);
    } catch {
      // Non-fatal: the create modal simply has no product options.
    }
  }, [bizId]);

  useEffect(() => {
    load();
    loadProducts();
  }, [load, loadProducts]);

  const shopName = (id: string) => shops.find((s: ShopLite) => s.id === id)?.name ?? "";

  const submit = async () => {
    if (!sourceShopId || !destShopId) {
      setError(t("selectShop"));
      return;
    }
    if (sourceShopId === destShopId) {
      setError(t("selectShop"));
      return;
    }
    if (!productId) {
      setError(t("selectProduct"));
      return;
    }
    const q = Number(quantity);
    if (!Number.isInteger(q) || q <= 0) {
      setError(t("invalidAmount"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await authRequest("/api/v1/transfers", {
        method: "POST",
        body: {
          businessId: bizId,
          sourceShopId,
          destShopId,
          productId,
          quantity: q,
          localId: newLocalId("trn"),
        },
      });
      setCreateOpen(false);
      setSourceShopId("");
      setDestShopId("");
      setProductId("");
      setQuantity("1");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: TransferRow, status: "RECEIVED" | "CANCELLED") => {
    setError(null);
    try {
      await authRequest(`/api/v1/transfers/${row.id}/status`, {
        method: "PUT",
        body: { businessId: bizId, shopId, status },
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("genericError"));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <Button title={`+ ${t("newTransfer")}`} onPress={() => setCreateOpen(true)} />
      </View>
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t("noTransfers")}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>
                  {shopName(item.sourceShopId)} → {shopName(item.destShopId)}
                </Text>
                <Text style={styles.rowMeta}>
                  ×{item.quantity} · {t(STATUS_KEY[item.status] ?? "pending")}
                </Text>
              </View>
              {item.status === "PENDING" || item.status === "IN_TRANSIT" ? (
                <View style={styles.rowActions}>
                  <Button title={t("receive")} onPress={() => changeStatus(item, "RECEIVED")} />
                  <View style={{ width: 6 }} />
                  <Button title={t("cancel")} onPress={() => changeStatus(item, "CANCELLED")} />
                </View>
              ) : null}
            </View>
          )}
        />
      )}

      <FormModal visible={createOpen} onClose={() => setCreateOpen(false)} title={t("newTransfer")}>
        <ScrollView>
          <ErrorBanner message={error} />
          <Text style={styles.fieldLabel}>{t("sourceShop")}</Text>
          <View style={styles.chipWrap}>
            {shops.map((s: ShopLite) => (
              <Chip key={s.id} label={s.name} active={sourceShopId === s.id} onPress={() => setSourceShopId(s.id)} />
            ))}
          </View>
          <View style={{ height: 10 }} />
          <Text style={styles.fieldLabel}>{t("destShop")}</Text>
          <View style={styles.chipWrap}>
            {shops
              .filter((s: ShopLite) => s.id !== sourceShopId)
              .map((s: ShopLite) => (
                <Chip key={s.id} label={s.name} active={destShopId === s.id} onPress={() => setDestShopId(s.id)} />
              ))}
          </View>
          <View style={{ height: 10 }} />
          <Text style={styles.fieldLabel}>{t("selectProduct")}</Text>
          <View style={styles.chipWrap}>
            {products.map((p) => (
              <Chip key={p.id} label={p.name} active={productId === p.id} onPress={() => setProductId(p.id)} />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Input value={quantity} onChangeText={setQuantity} placeholder={t("qty")} keyboardType="numeric" />
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={submit} loading={saving} />
        </ScrollView>
      </FormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    marginBottom: 8,
    alignItems: "flex-end",
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
  rowName: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 6,
  },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});
