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
import { formatTaka } from "../src/money";
import { newLocalId } from "../src/localId";

interface DocItem {
  productId: string;
  productName: string;
  qty: number;
  returnedQty: number;
}

interface DocRow {
  id: string;
  invoiceNo: string | null;
  total: number;
  status: string;
  items: DocItem[];
}

interface DocListResponse {
  data: {
    items: DocRow[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

const PAGE_SIZE = 50;

/**
 * Phase 06 — Returns. One section handles both directions: pick a completed
 * sale (stock comes back) or a completed purchase (stock goes out), then
 * return whole units per line. The server owns every financial figure — the
 * app sends only productId/qty/reason and an idempotent localId.
 */
export function ReturnsSection() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [direction, setDirection] = useState<"sale" | "purchase">("sale");
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnDoc, setReturnDoc] = useState<DocRow | null>(null);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const bizId = activeBusinessId ?? "";
  const shopId = activeShopId ?? "";

  const load = useCallback(
    async (page = 1, append = false) => {
      if (!bizId || !shopId) {
        setDocs([]);
        setLoading(false);
        return;
      }
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const base =
          direction === "sale" ? "/api/v1/sales" : "/api/v1/purchases";
        const res = await authRequest<DocListResponse>(
          `${base}?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}&status=COMPLETED&page=${page}&limit=${PAGE_SIZE}`
        );
        const { items, pagination } = res.data;
        setDocs((prev) => (append ? [...prev, ...items] : items));
        setHasMore(page < pagination.totalPages);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [bizId, shopId, direction, t]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const openReturnModal = (doc: DocRow) => {
    setReturnDoc(doc);
    setQtys({});
    setReason("");
    setError(null);
  };

  const submit = async () => {
    if (!returnDoc) return;
    const items: { productId: string; qty: number }[] = [];
    for (const line of returnDoc.items) {
      const raw = qtys[line.productId];
      if (!raw) continue;
      const q = Number(raw);
      if (!Number.isInteger(q) || q <= 0) {
        setError(t("invalidAmount"));
        return;
      }
      if (q > line.qty - (line.returnedQty ?? 0)) {
        setError(`${line.productName}: ${t("insufficientStock")}`);
        return;
      }
      items.push({ productId: line.productId, qty: q });
    }
    if (items.length === 0) {
      setError(t("selectItems"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await authRequest(
        direction === "sale"
          ? `/api/v1/sales/${returnDoc.id}/return`
          : `/api/v1/purchases/${returnDoc.id}/return`,
        {
          method: "POST",
          body: {
            businessId: bizId,
            shopId,
            items,
            reason: reason.trim() || null,
            localId: newLocalId(direction === "sale" ? "sret" : "pret"),
          },
        }
      );
      setReturnDoc(null);
      await load(1, false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.chipRow}>
        <Chip label={t("saleReturn")} active={direction === "sale"} onPress={() => setDirection("sale")} />
        <Chip label={t("purchaseReturn")} active={direction === "purchase"} onPress={() => setDirection("purchase")} />
      </View>
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : docs.length === 0 ? (
        <Text style={styles.empty}>{t("noReturns")}</Text>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(d) => d.id}
          onEndReached={() => {
            if (hasMore && !loadingMore) load(Math.ceil(docs.length / PAGE_SIZE) + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.invoiceNo ?? t("draft")}</Text>
                <Text style={styles.rowMeta}>
                  {item.items.length} × {t("qty")} · {formatTaka(item.total)}
                </Text>
              </View>
              <Button title={t("returns")} onPress={() => openReturnModal(item)} />
            </View>
          )}
        />
      )}

      <FormModal
        visible={returnDoc !== null}
        onClose={() => setReturnDoc(null)}
        title={direction === "sale" ? t("saleReturn") : t("purchaseReturn")}
      >
        <ScrollView>
          <ErrorBanner message={error} />
          {returnDoc?.items.map((line) => {
            const remaining = line.qty - (line.returnedQty ?? 0);
            return (
              <View key={line.productId} style={{ marginBottom: 8 }}>
                <Text style={styles.fieldLabel}>
                  {line.productName} · {t("returnedQty")} ≤ {remaining}
                </Text>
                <Input
                  value={qtys[line.productId] ?? ""}
                  onChangeText={(v) =>
                    setQtys((prev) => ({ ...prev, [line.productId]: v }))
                  }
                  placeholder={`0–${remaining}`}
                  keyboardType="numeric"
                />
              </View>
            );
          })}
          <Input value={reason} onChangeText={setReason} placeholder={t("reasonOptional")} />
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={submit} loading={saving} />
        </ScrollView>
      </FormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
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
  rowName: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 4,
  },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});
