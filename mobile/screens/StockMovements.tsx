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

export function MovementsSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const res = await authRequest<{ data: { items: MovementRow[] } }>(
        `/api/v1/inventory/movements?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}&limit=100`
      );
      setRows(res.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    load();
  }, [load]);

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
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.type}</Text>
                <Text style={styles.rowMeta}>
                  {item.refType} · {new Date(item.createdAt).toLocaleString()}
                </Text>
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
