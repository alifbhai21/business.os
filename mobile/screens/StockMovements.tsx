import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

interface MovementRow {
  id: string;
  productId: string;
  type: string;
  qtyChange: number;
  prevStock: number;
  newStock: number;
  refType: string;
  createdAt: string;
}

interface MovementListResponse {
  data: {
    items: MovementRow[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

interface ProductLite {
  id: string;
  name: string;
}

const PAGE_SIZE = 50;

export function MovementsSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [rows, setRows] = useState<MovementRow[]>([]);
  /** Presentation-only id→name map; the server remains authoritative for stock. */
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

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
        const res = await authRequest<MovementListResponse>(
          `/api/v1/inventory/movements?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}&page=${page}&limit=${PAGE_SIZE}`
        );
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
    [bizId, shopId, t]
  );

  const loadProductNames = useCallback(async () => {
    if (!bizId) return;
    try {
      const res = await authRequest<{ data: { items: ProductLite[] } }>(
        `/api/v1/products?businessId=${encodeURIComponent(bizId)}&limit=100`
      );
      const map: Record<string, string> = {};
      for (const p of res.data.items) map[p.id] = p.name;
      setProductNames(map);
    } catch {
      // Non-fatal: rows fall back to the raw product id.
    }
  }, [bizId]);

  useEffect(() => {
    load(1, false);
    loadProductNames();
  }, [load, loadProductNames]);

  const productName = (id: string) => productNames[id] ?? `#${id.slice(-6)}`;

  return (
    <View style={{ flex: 1 }}>
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t("noMovements")}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => m.id}
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
                <Text style={styles.rowName} numberOfLines={1}>
                  {productName(item.productId)}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.type} · {item.refType}
                </Text>
                <Text style={styles.rowMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.rowQty, { color: item.qtyChange >= 0 ? colors.primary : "#C0392B" }]}>
                  {item.qtyChange >= 0 ? `+${item.qtyChange}` : item.qtyChange}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.prevStock} → {item.newStock}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowQty: { fontSize: 16, fontWeight: "700" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});
