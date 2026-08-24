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
import { formatTaka } from "../src/money";
import { newLocalId } from "../src/localId";

interface StockRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  avgCost: number;
  lowStock: boolean;
}

interface StockListResponse {
  data: {
    items: StockRow[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

const PAGE_SIZE = 50;

export function StockSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId, user } = useAuth();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Adjust form
  const [adjProductId, setAdjProductId] = useState("");
  const [adjQty, setAdjQty] = useState("");
  const [adjKind, setAdjKind] = useState<"adjustment" | "damage">("adjustment");
  const [adjReason, setAdjReason] = useState("");

  // Opening form
  const [openProductId, setOpenProductId] = useState("");
  const [openQty, setOpenQty] = useState("");

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
        const res = await authRequest<StockListResponse>(
          `/api/v1/inventory/stock?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}&page=${page}&limit=${PAGE_SIZE}${lowOnly ? "&lowStock=true" : ""}`
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
    [bizId, shopId, lowOnly, t]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const submitAdjust = async () => {
    const product = rows.find((r) => r.id === adjProductId);
    if (!product) {
      setError(t("selectProduct"));
      return;
    }
    const q = Number(adjQty);
    if (!Number.isInteger(q) || q === 0) {
      setError(t("invalidAmount"));
      return;
    }
    if (!adjReason.trim()) {
      setError(t("reason") + "?");
      return;
    }
    setSaving("adjust");
    setError(null);
    try {
      // Phase 12 — offline-capable: a NETWORK failure queues the exact
      // payload for /sync/push (exactly-once via the movement localId).
      const result = await authMutation(user?.id ?? "", "inventory_adjust", "/api/v1/inventory/adjust", {
        businessId: bizId,
        shopId,
        productId: product.id,
        qtyChange: q,
        kind: adjKind,
        reason: adjReason.trim(),
        localId: newLocalId("adj"),
      });
      if (result.queued) setInfo(t("queuedOffline"));
      setAdjustOpen(false);
      setAdjProductId("");
      setAdjQty("");
      setAdjReason("");
      await load(1, false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("genericError"));
    } finally {
      setSaving(null);
    }
  };

  const submitOpening = async () => {
    const product = rows.find((r) => r.id === openProductId);
    if (!product) {
      setError(t("selectProduct"));
      return;
    }
    const q = Number(openQty);
    if (!Number.isInteger(q) || q < 0) {
      setError(t("invalidAmount"));
      return;
    }
    setSaving("opening");
    setError(null);
    try {
      const result = await authMutation(user?.id ?? "", "inventory_opening", "/api/v1/inventory/opening", {
        businessId: bizId,
        shopId,
        productId: product.id,
        quantity: q,
        localId: newLocalId("opn"),
      });
      if (result.queued) setInfo(t("queuedOffline"));
      setOpeningOpen(false);
      setOpenProductId("");
      setOpenQty("");
      await load(1, false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("genericError"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.filterRow}>
        <Chip label={t("allStock")} active={!lowOnly} onPress={() => setLowOnly(false)} />
        <Chip label={t("lowStock")} active={lowOnly} onPress={() => setLowOnly(true)} />
      </View>
      <View style={styles.actionsRow}>
        <Button title={`+ ${t("adjustStock")}`} onPress={() => setAdjustOpen(true)} />
        <View style={{ width: 8 }} />
        <Button title={`+ ${t("openingStock")}`} onPress={() => setOpeningOpen(true)} />
      </View>
      <InfoBanner message={info} />
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t("noData")}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
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
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.sku || item.unit} · min {item.minStock}
                </Text>
                {item.avgCost > 0 ? (
                  <Text style={styles.rowMeta}>
                    {t("avgCost")}: {formatTaka(item.avgCost)}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.rowStock, item.currentStock < 0 && { color: "#C0392B" }]}>
                  {item.currentStock}
                </Text>
                {item.lowStock ? <Text style={styles.lowBadge}>{t("lowStock")}</Text> : null}
              </View>
            </View>
          )}
        />
      )}

      <FormModal visible={adjustOpen} onClose={() => setAdjustOpen(false)} title={t("adjustStock")}>
        <ScrollView>
          <ErrorBanner message={error} />
          <Text style={styles.fieldLabel}>{t("selectProduct")}</Text>
          <View style={styles.chipWrap}>
            {rows.map((r) => (
              <Chip
                key={r.id}
                label={`${r.name} (${r.currentStock})`}
                active={adjProductId === r.id}
                onPress={() => setAdjProductId(r.id)}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Input
            value={adjQty}
            onChangeText={setAdjQty}
            placeholder={`${t("qty")} (+/-)`}
            keyboardType="numbers-and-punctuation"
          />
          <View style={{ height: 8 }} />
          <Text style={styles.fieldLabel}>{t("kind")}</Text>
          <View style={styles.chipWrap}>
            <Chip label={t("correctionKind")} active={adjKind === "adjustment"} onPress={() => setAdjKind("adjustment")} />
            <Chip label={t("damageKind")} active={adjKind === "damage"} onPress={() => setAdjKind("damage")} />
          </View>
          <View style={{ height: 8 }} />
          <Input value={adjReason} onChangeText={setAdjReason} placeholder={t("reason")} />
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={submitAdjust} loading={saving === "adjust"} />
        </ScrollView>
      </FormModal>

      <FormModal visible={openingOpen} onClose={() => setOpeningOpen(false)} title={t("openingStock")}>
        <ScrollView>
          <ErrorBanner message={error} />
          <Text style={styles.fieldLabel}>{t("selectProduct")}</Text>
          <View style={styles.chipWrap}>
            {rows.map((r) => (
              <Chip
                key={r.id}
                label={`${r.name} (${r.currentStock})`}
                active={openProductId === r.id}
                onPress={() => setOpenProductId(r.id)}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Input value={openQty} onChangeText={setOpenQty} placeholder={t("qty")} keyboardType="numeric" />
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={submitOpening} loading={saving === "opening"} />
        </ScrollView>
      </FormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 8,
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
  rowStock: { fontSize: 16, fontWeight: "700", color: colors.primary },
  lowBadge: { fontSize: 11, color: "#C0392B", fontWeight: "700", marginTop: 2 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});
