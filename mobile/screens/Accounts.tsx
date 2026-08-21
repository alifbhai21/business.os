import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Button, ErrorBanner, FormModal, Input } from "../src/components/ui";
import { ApiError, authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka } from "../src/money";

interface Account {
  id: string;
  name: string;
  type: string;
  accountNumber: string | null;
  currentBalance: number;
}

const ACCOUNT_TYPES = ["CASH", "BANK", "MOBILE_MONEY", "CARD"] as const;
const typeKey: Record<string, string> = {
  CASH: "cash",
  BANK: "bank",
  MOBILE_MONEY: "bkash",
  CARD: "card",
};

export function AccountsScreen() {
  const { t } = useI18n();
  const { activeBusinessId, activeShopId } = useAuth();
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("CASH");
  const [accountNumber, setAccountNumber] = useState("");

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
      const res = await authRequest<{ data: Account[] }>(
        `/api/v1/accounts?businessId=${encodeURIComponent(bizId)}&shopId=${encodeURIComponent(shopId)}`
      );
      setItems(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, shopId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // The client never sends a balance — the server is authoritative.
      await authRequest("/api/v1/accounts", {
        method: "POST",
        body: {
          businessId: bizId,
          shopId,
          name: name.trim(),
          type,
          accountNumber: accountNumber.trim() || null,
        },
      });
      setModalOpen(false);
      setName("");
      setAccountNumber("");
      setType("CASH");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button title={`+ ${t("addAccount")}`} onPress={() => setModalOpen(true)} />
      </View>
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("noAccounts")}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {t(typeKey[item.type] ?? item.type)}
                  {item.accountNumber ? ` · ${item.accountNumber}` : ""}
                </Text>
              </View>
              <Text style={styles.rowBalance}>{formatTaka(item.currentBalance)}</Text>
            </View>
          )}
        />
      )}
      <FormModal visible={modalOpen} onClose={() => setModalOpen(false)} title={t("addAccount")}>
        <ErrorBanner message={error} />
        <Input value={name} onChangeText={setName} placeholder={t("accountName")} autoCapitalize="words" />
        <View style={{ height: 8 }} />
        <View style={styles.typeWrap}>
          {ACCOUNT_TYPES.map((at) => (
            <Button
              key={at}
              title={t(typeKey[at])}
              variant={type === at ? "primary" : "secondary"}
              onPress={() => setType(at)}
            />
          ))}
        </View>
        <View style={{ height: 8 }} />
        <Input value={accountNumber} onChangeText={setAccountNumber} placeholder={t("accountNumber")} />
        <View style={{ height: 16 }} />
        <Button title={t("save")} onPress={submit} loading={saving} />
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
  typeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  rowBalance: { fontSize: 14, fontWeight: "700", color: colors.primary },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});