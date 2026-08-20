import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, ErrorBanner, FormModal } from "../src/components/ui";
import { emptyShopForm, ShopFormFields, ShopFormState } from "../src/components/shopForm";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth";
import { ApiError, authRequest } from "../src/api";
import { ShopPublic } from "../src/auth";

export function ShopManagementScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const { activeBusinessId, shops, loadShops, setActiveShop } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ShopFormState>(emptyShopForm);
  const [editing, setEditing] = useState<ShopPublic | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyStatusId, setBusyStatusId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeBusinessId) return;
    setError(null);
    const ok = await loadShops(activeBusinessId);
    if (!ok) setError(t("errorLoading"));
  }, [activeBusinessId, loadShops, t]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch(() => setError(t("network")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyShopForm());
    setModalOpen(true);
  };

  const openEdit = (shop: ShopPublic) => {
    setEditing(shop);
    setForm({
      name: shop.name,
      branchCode: shop.branchCode,
      address: shop.address ?? "",
      phone: shop.phone ?? "",
      manager: shop.manager ?? "",
      isWarehouse: shop.isWarehouse,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const save = async () => {
    if (!activeBusinessId) return;
    setError(null);
    if (!form.name.trim()) return setError(t("shopNameRequired"));
    if (!form.branchCode.trim()) return setError(t("branchCodeRequired"));
    setSaving(true);
    try {
      if (editing) {
        await authRequest<{ data: ShopPublic }>(`/api/v1/shops/${editing.id}`, {
          method: "PUT",
          body: {
            businessId: activeBusinessId,
            name: form.name.trim(),
            branchCode: form.branchCode.trim(),
            address: form.address.trim() || null,
            phone: form.phone.trim() || null,
            manager: form.manager.trim() || null,
            isWarehouse: form.isWarehouse,
          },
        });
      } else {
        const data = await authRequest<{ data: ShopPublic }>("/api/v1/shops", {
          method: "POST",
          body: {
            businessId: activeBusinessId,
            name: form.name.trim(),
            branchCode: form.branchCode.trim(),
            address: form.address.trim() || undefined,
            phone: form.phone.trim() || undefined,
            manager: form.manager.trim() || undefined,
            isWarehouse: form.isWarehouse,
          },
        });
        setActiveShop(data.data.id);
      }
      closeModal();
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("branchCodeTaken"));
      } else {
        setError(err instanceof Error ? err.message : t("network"));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (shop: ShopPublic) => {
    if (!activeBusinessId) return;
    setBusyStatusId(shop.id);
    setError(null);
    try {
      await authRequest(`/api/v1/shops/${shop.id}/status`, {
        method: "PATCH",
        body: { businessId: activeBusinessId, status: shop.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("network"));
    } finally {
      setBusyStatusId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t("shopManagement")}</Text>
      <ErrorBanner message={error} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Button title={t("addShop")} onPress={openCreate} />
        <Button title={t("refresh")} onPress={refresh} variant="secondary" />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : shops.length === 0 ? (
        <Text style={styles.empty}>{t("noShops")}</Text>
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <Card>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.branchCode}
                {item.manager ? ` · ${t("manager")}: ${item.manager}` : ""}
              </Text>
              <Text style={[styles.badge, item.status === "ACTIVE" ? styles.badgeActive : styles.badgeInactive]}>
                {item.status === "ACTIVE" ? t("active") : t("inactive")}
              </Text>
              <View style={styles.actions}>
                <Button title={t("edit")} onPress={() => openEdit(item)} variant="secondary" />
                <Button
                  title={item.status === "ACTIVE" ? t("deactivate") : t("activate")}
                  onPress={() => toggleStatus(item)}
                  variant={item.status === "ACTIVE" ? "danger" : "primary"}
                  loading={busyStatusId === item.id}
                />
              </View>
            </Card>
          )}
        />
      )}
      <View style={{ height: 12 }} />
      <Button title={t("back")} onPress={onDone} variant="secondary" />

      <FormModal
        visible={modalOpen}
        onClose={closeModal}
        title={editing ? t("edit") : t("addShop")}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ShopFormFields form={form} onChange={setForm} />
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={save} loading={saving} />
        </ScrollView>
      </FormModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 16 },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  badge: { alignSelf: "flex-start", fontSize: 11, fontWeight: "700", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 6, overflow: "hidden" },
  badgeActive: { color: colors.success },
  badgeInactive: { color: colors.danger },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});