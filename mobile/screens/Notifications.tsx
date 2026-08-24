import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, ErrorBanner } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth";
import { authRequest } from "../src/api";

/**
 * Phase 12 — in-app notifications.
 *
 * Reading the list asks the server to materialize current conditions (low
 * stock / dues / sync failures) and returns the authoritative rows; the UI
 * renders them verbatim and offers per-row and bulk acknowledgement.
 */

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

const TYPE_KEY: Record<string, string> = {
  LOW_STOCK: "notifLowStock",
  CUSTOMER_DUE: "notifCustomerDue",
  SUPPLIER_DUE: "notifSupplierDue",
  SYNC_FAILURE: "notifSyncFailure",
};

export function NotificationsScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const { activeBusinessId } = useAuth();
  const bizId = activeBusinessId ?? "";

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authRequest<{
        data: { data: NotificationItem[]; unreadCount: number };
      }>(`/api/v1/notifications?businessId=${encodeURIComponent(bizId)}&limit=50`);
      setItems(res.data.data);
      setUnreadCount(res.data.unreadCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    setError(null);
    try {
      await authRequest(`/api/v1/notifications/${id}/read`, {
        method: "POST",
        body: { businessId: bizId },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  };

  const markAllRead = async () => {
    setError(null);
    try {
      await authRequest("/api/v1/notifications/read-all", {
        method: "POST",
        body: { businessId: bizId },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t("notifications")}</Text>
      <ErrorBanner message={error} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={styles.meta}>
          {unreadCount > 0
            ? `${unreadCount} ${t("unreadSuffix")}`
            : t("allCaughtUp")}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("noNotifications")}</Text>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(n) => n.id}
            renderItem={({ item }) => (
              <Card style={!item.read ? styles.unreadCard : undefined}>
                <View style={styles.rowBetween}>
                  <Text style={styles.type}>{t(TYPE_KEY[item.type] ?? item.type)}</Text>
                  {!item.read && (
                    <Button title={t("markRead")} variant="secondary" onPress={() => markRead(item.id)} />
                  )}
                </View>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString()}</Text>
              </Card>
            )}
          />
          <View style={{ height: 8 }} />
          <Button title={t("markAllRead")} onPress={markAllRead} variant="secondary" />
        </>
      )}

      <View style={{ height: 16 }} />
      <Button title={t("back")} onPress={onDone} variant="secondary" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginVertical: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  type: { fontSize: 12, fontWeight: "800", color: colors.primary, textTransform: "uppercase" },
  body: { fontSize: 14, color: colors.text, marginTop: 4 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 32, fontSize: 14 },
});
