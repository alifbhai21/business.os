import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, Chip, ErrorBanner, Input, SectionTitle } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { businessTypes, colors, typeLabels } from "../src/theme";
import { useAuth } from "../src/auth";
import { authRequest } from "../src/api";
import type { Lang } from "../src/i18n/dictionaries";

export function BusinessSettingsScreen({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n();
  const { business, loadBusinesses } = useAuth();
  const [name, setName] = useState(business?.name ?? "");
  const [type, setType] = useState<string>(business?.type ?? "retail");
  const [address, setAddress] = useState(business?.address ?? "");
  const [phone, setPhone] = useState(business?.phone ?? "");
  const [email, setEmail] = useState(business?.email ?? "");
  const [allowNegativeStock, setAllowNegativeStock] = useState(business?.allowNegativeStock ?? false);
  // Phase 12 — custom expense categories (comma-separated input).
  const [customCategories, setCustomCategories] = useState(
    (business?.customExpenseCategories ?? []).join(", ")
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!business) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>{t("businessSettings")}</Text>
        <Text style={styles.empty}>{t("noBusiness")}</Text>
        <Button title={t("back")} onPress={onDone} variant="secondary" />
      </SafeAreaView>
    );
  }

  const submit = async () => {
    setError(null);
    setSaved(false);
    if (!name.trim()) return setError(t("businessNameRequired"));
    setLoading(true);
    try {
      await authRequest(`/api/v1/businesses/${business.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          type,
          address: address.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          allowNegativeStock,
          customExpenseCategories: customCategories
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        },
      });
      await loadBusinesses();
      setSaved(true);
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
          <Text style={styles.title}>{t("businessSettings")}</Text>
          <ErrorBanner message={error} />
          {saved && <Text style={styles.saved}>{t("changesSaved")}</Text>}

          <SectionTitle>{t("businessName")}</SectionTitle>
          <Input value={name} onChangeText={setName} placeholder={t("businessName")} autoCapitalize="words" />

          <SectionTitle>{t("businessType")}</SectionTitle>
          <View style={styles.chips}>
            {(businessTypes as readonly string[]).map((bt) => (
              <Chip
                key={bt}
                label={typeLabels[bt]?.[lang as Lang] ?? bt}
                active={type === bt}
                onPress={() => setType(bt)}
              />
            ))}
          </View>

          <SectionTitle>{t("email")}</SectionTitle>
          <Input value={email} onChangeText={setEmail} placeholder={t("email")} keyboardType="email-address" autoCapitalize="none" />

          <SectionTitle>{t("phone")}</SectionTitle>
          <Input value={phone} onChangeText={setPhone} placeholder={t("phone")} keyboardType="phone-pad" />

          <SectionTitle>{t("address")}</SectionTitle>
          <Input value={address} onChangeText={setAddress} placeholder={t("address")} />

          <SectionTitle>{t("customCategoriesLabel")}</SectionTitle>
          <Input
            value={customCategories}
            onChangeText={setCustomCategories}
            placeholder={`${t("customCategoriesHint")}: Delivery, Marketing Online`}
            autoCapitalize="none"
          />

          <SectionTitle>{t("status")}</SectionTitle>
          <Card>
            <View style={styles.row}>
              <Text style={styles.optLabel}>{t("allowNegativeStock")}</Text>
              <Chip
                label={allowNegativeStock ? t("active") : t("inactive")}
                active={allowNegativeStock}
                onPress={() => setAllowNegativeStock((v) => !v)}
              />
            </View>
          </Card>

          <View style={{ height: 20 }} />
          <Button title={t("saveChanges")} onPress={submit} loading={loading} />
          <View style={{ height: 12 }} />
          <Button title={t("back")} onPress={onDone} variant="secondary" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 24, marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  saved: { color: colors.success, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  empty: { color: colors.textMuted, marginBottom: 16 },
});