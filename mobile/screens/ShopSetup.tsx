import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, ErrorBanner } from "../src/components/ui";
import { emptyShopForm, ShopFormFields } from "../src/components/shopForm";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth";
import { authRequest } from "../src/api";

export function ShopSetupScreen({ onDone, businessId }: { onDone: () => void; businessId: string }) {
  const { t } = useI18n();
  const { loadShops, setActiveShop } = useAuth();
  const [form, setForm] = useState(emptyShopForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) return setError(t("shopNameRequired"));
    if (!form.branchCode.trim()) return setError(t("branchCodeRequired"));
    setLoading(true);
    try {
      const data = await authRequest<{ data: { id: string } }>("/api/v1/shops", {
        method: "POST",
        body: {
          businessId,
          name: form.name.trim(),
          branchCode: form.branchCode.trim(),
          address: form.address.trim() || undefined,
          phone: form.phone.trim() || undefined,
          manager: form.manager.trim() || undefined,
          isWarehouse: form.isWarehouse,
        },
      });
      setActiveShop(data.data.id);
      await loadShops(businessId);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("network"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t("shopSetup")}</Text>
          <ErrorBanner message={error} />
          <ShopFormFields form={form} onChange={setForm} />
          <View style={{ height: 20 }} />
          <Button title={t("createShop")} onPress={submit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 24, marginBottom: 16 },
});