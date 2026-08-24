import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, ErrorBanner } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth";
import { useSync } from "../src/offline/SyncProvider";
import { listByStatus, requeueAll, requeueRow, removeRow } from "../src/offline/queue";
import { fetchBackupStatus, type BackupStatus as BackupStatusData } from "../src/backup";

/**
 * Phase 10 — sync center.
 *
 * The user can always see: connection state, pending/failed/conflict counts,
 * the last successful sync, and every queued item that needs attention
 * (with retry / discard actions). Nothing here computes business values.
 */

const OP_LABEL: Record<string, string> = {
  sale: "sale",
  purchase: "purchase",
  payment: "payment",
  expense: "expense",
  customer: "customer",
  supplier: "supplier",
  product: "product",
};

export function SyncCenterScreen({
  onDone,
  onNavigateBackup,
}: {
  onDone: () => void;
  onNavigateBackup?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const { online, syncing, pending, failed, conflicts, synced, lastSyncAt, refresh, syncNow } =
    useSync();

  const [attention, setAttention] = useState<
    Array<{ id: number; opType: string; status: string; lastError: string | null; createdAt: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Phase 11 — compact cloud-backup indicator (server payload only).
  const [backup, setBackup] = useState<BackupStatusData | null>(null);

  const loadBackup = useCallback(async () => {
    try {
      setBackup(await fetchBackupStatus());
    } catch {
      setBackup(null); // offline — indicator simply stays neutral
    }
  }, []);

  useEffect(() => {
    loadBackup();
  }, [loadBackup]);

  const loadAttention = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listByStatus(ownerId, ["FAILED", "CONFLICT"]);
      setAttention(
        rows.map((r) => ({
          id: r.id,
          opType: OP_LABEL[r.opType] ?? r.opType,
          status: r.status,
          lastError: r.lastError,
          createdAt: r.createdAt,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [ownerId, t]);

  useEffect(() => {
    loadAttention();
  }, [loadAttention]);

  const retryAll = async () => {
    if (!ownerId) return;
    setError(null);
    try {
      await requeueAll(ownerId);
      await loadAttention();
      await refresh();
      syncNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  };

  const retryOne = async (id: number) => {
    if (!ownerId) return;
    setError(null);
    try {
      await requeueRow(ownerId, id);
      await loadAttention();
      await refresh();
      syncNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  };

  const discard = async (id: number) => {
    if (!ownerId) return;
    setError(null);
    try {
      await removeRow(ownerId, id);
      await loadAttention();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t("syncCenter")}</Text>
      <ErrorBanner message={error} />

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{t("connectionState")}</Text>
          <Text style={[styles.value, { color: online ? colors.success : "#B7791F" }]}>
            {online ? t("onlineLabel") : t("offlineLabel")}
          </Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{t("lastSync")}</Text>
          <Text style={styles.value}>
            {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : t("neverSynced")}
          </Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{t("pendingCountLabel")}</Text>
          <Text style={styles.value}>{pending}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{t("failedCountLabel")}</Text>
          <Text style={[styles.value, { color: failed > 0 ? "#B7791F" : colors.text }]}>
            {failed}
          </Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{t("conflictCountLabel")}</Text>
          <Text style={[styles.value, { color: conflicts > 0 ? colors.danger : colors.text }]}>
            {conflicts}
          </Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{t("syncedCountLabel")}</Text>
          <Text style={styles.value}>{synced}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{t("cloudBackup")}</Text>
          <Text
            style={[
              styles.value,
              { color: backup ? (backup.healthy ? colors.success : "#B7791F") : colors.textMuted },
            ]}
          >
            {backup
              ? backup.healthy
                ? t("backupHealthy")
                : t("backupUnavailable")
              : "—"}
            {backup?.lastWriteAt ? ` · ${new Date(backup.lastWriteAt).toLocaleString()}` : ""}
          </Text>
        </View>
      </Card>

      {onNavigateBackup ? (
        <Button title={t("backupExport")} onPress={onNavigateBackup} variant="secondary" />
      ) : null}

      <Button
        title={syncing ? t("syncingLabel") : t("syncNowBtn")}
        onPress={syncNow}
        loading={syncing}
      />

      <Text style={styles.sectionTitle}>{t("needsAttention")}</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
      ) : attention.length === 0 ? (
        <Text style={styles.empty}>{t("nothingNeedsAttention")}</Text>
      ) : (
        <>
          <FlatList
            data={attention}
            keyExtractor={(a) => String(a.id)}
            renderItem={({ item }) => (
              <Card>
                <View style={styles.rowBetween}>
                  <Text style={styles.opType}>{item.opType}</Text>
                  <Text
                    style={[
                      styles.badge,
                      { color: item.status === "CONFLICT" ? colors.danger : "#B7791F" },
                    ]}
                  >
                    {item.status === "CONFLICT" ? t("conflictBadge") : t("failedBadge")}
                  </Text>
                </View>
                {item.lastError ? <Text style={styles.errorLine}>{item.lastError}</Text> : null}
                <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString()}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Button title={t("retryItem")} variant="secondary" onPress={() => retryOne(item.id)} />
                  <Button title={t("discardItem")} variant="danger" onPress={() => discard(item.id)} />
                </View>
              </Card>
            )}
          />
          <View style={{ height: 8 }} />
          <Button title={t("retryAll")} onPress={retryAll} variant="secondary" />
        </>
      )}

      <View style={{ height: 16 }} />
      <Button title={t("back")} onPress={onDone} variant="secondary" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  meta: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 13, fontWeight: "600", color: colors.text },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  opType: { fontSize: 15, fontWeight: "600", color: colors.text },
  badge: { fontSize: 11, fontWeight: "800" },
  errorLine: { fontSize: 12, color: colors.danger, marginTop: 2 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 24, fontSize: 14 },
});
