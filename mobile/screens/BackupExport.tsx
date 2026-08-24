import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, ErrorBanner, SectionTitle } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import {
  fetchBackupStatus,
  fetchExportCsv,
  fetchExportJson,
  type BackupStatus as BackupStatusData,
} from "../src/backup";
import { syncEngine } from "../src/offline/syncEngine";

/**
 * Phase 11 — backup status + restore + data export.
 *
 * Every figure is rendered from the server payload (/backup/status,
 * /sync/restore counts). Exports share the raw server text through the OS
 * share sheet — nothing is computed or stored client-side.
 */

const CSV_TYPES = [
  "sales",
  "purchases",
  "payments",
  "expenses",
  "products",
  "customers",
  "suppliers",
  "accounts",
] as const;

export function BackupExportScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<BackupStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchBackupStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const share = async (title: string, text: string) => {
    try {
      await Share.share({ title, message: text });
    } catch {
      // User cancelled the share sheet — not an error.
    }
  };

  const exportJson = async () => {
    setBusy(true);
    setError(null);
    try {
      await share(t("exportJson"), await fetchExportJson());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async (type: string) => {
    setBusy(true);
    setError(null);
    try {
      await share(`${t("exportCsv")} — ${type}`, await fetchExportCsv(type));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    setRestoreSummary(null);
    try {
      const result = await syncEngine.restoreAll();
      if (result) {
        const c = result.counts;
        setRestoreSummary(
          `${c.products ?? 0} ${t("products")} · ${c.customers ?? 0} ${t("customers")} · ${
            c.suppliers ?? 0
          } ${t("suppliers")} · ${c.accounts ?? 0} ${t("accountsLabel")}`
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("backupExport")}</Text>
        <ErrorBanner message={error} />

        <SectionTitle>{t("backupStatus")}</SectionTitle>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : status ? (
          <Card>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{t("cloudBackup")}</Text>
              <Text style={[styles.value, { color: status.healthy ? colors.success : "#B7791F" }]}>
                {status.connected ? t("backupHealthy") : t("backupUnavailable")}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{t("lastServerWrite")}</Text>
              <Text style={styles.value}>
                {status.lastWriteAt ? new Date(status.lastWriteAt).toLocaleString() : t("neverSynced")}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{t("salesCount")}</Text>
              <Text style={styles.value}>{status.counts.sales ?? 0}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{t("purchasesCount")}</Text>
              <Text style={styles.value}>{status.counts.purchases ?? 0}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{t("paymentsCount")}</Text>
              <Text style={styles.value}>{status.counts.payments ?? 0}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{t("expensesCount")}</Text>
              <Text style={styles.value}>{status.counts.expenses ?? 0}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{t("auditRowsCount")}</Text>
              <Text style={styles.value}>{status.counts.auditLogs ?? 0}</Text>
            </View>
          </Card>
        ) : null}

        <SectionTitle>{t("newDeviceRestore")}</SectionTitle>
        {restoreSummary ? (
          <Card>
            <Text style={styles.meta}>{t("restoredFromCloud")}</Text>
            <Text style={styles.summary}>{restoreSummary}</Text>
          </Card>
        ) : null}
        <Button title={busy ? t("restoring") : t("restoreNowBtn")} onPress={restore} loading={busy} />

        <SectionTitle>{t("exportData")}</SectionTitle>
        <Button
          title={busy ? t("exporting") : t("exportJson")}
          onPress={exportJson}
          variant="secondary"
        />
        <View style={{ height: 8 }} />
        <View style={styles.csvWrap}>
          {CSV_TYPES.map((type) => (
            <Button
              key={type}
              title={`${t("exportCsv")} — ${type}`}
              onPress={() => exportCsv(type)}
              variant="secondary"
            />
          ))}
        </View>

        <View style={{ height: 16 }} />
        <Button title={t("back")} onPress={onDone} variant="secondary" />
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginVertical: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  meta: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 13, fontWeight: "600", color: colors.text },
  summary: { fontSize: 13, fontWeight: "700", color: colors.success, marginTop: 4 },
  csvWrap: { gap: 8 },
});
