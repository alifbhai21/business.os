import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, Chip, ErrorBanner, Input, SectionTitle } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { businessTypes, colors, typeLabels } from "../src/theme";
import { useAuth } from "../src/auth";
import { authRequest } from "../src/api";
import type { Lang } from "../src/i18n/dictionaries";

export function BusinessSetupScreen({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n();
  const { register, loadBusinesses, setActiveBusiness } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<string>("retail");
  const [currency, setCurrency] = useState("BDT");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!businessName.trim()) return setError(t("businessNameRequired"));
    setLoading(true);
    try {
      const data = await authRequest<{ data: { id: string } }>("/api/v1/businesses", {
        method: "POST",
        body: {
          name: businessName.trim(),
          type: businessType,
          currency,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        },
      });
      setActiveBusiness(data.data.id);
      await loadBusinesses();
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
          <Text style={styles.title}>{t("businessSetup")}</Text>
          <ErrorBanner message={error} />

          <SectionTitle>{t("businessType")}</SectionTitle>
          <View style={styles.chips}>
            {(businessTypes as readonly string[]).map((bt) => (
              <Chip
                key={bt}
                label={typeLabels[bt]?.[lang as Lang] ?? bt}
                active={businessType === bt}
                onPress={() => setBusinessType(bt)}
              />
            ))}
          </View>

          <SectionTitle>{t("businessName")}</SectionTitle>
          <Input
            value={businessName}
            onChangeText={setBusinessName}
            placeholder={t("businessName")}
            autoCapitalize="words"
          />

          <SectionTitle>{t("currency")}</SectionTitle>
          <Input value={currency} onChangeText={setCurrency} placeholder="BDT" autoCapitalize="words" />

          <SectionTitle>{t("phone")}</SectionTitle>
          <Input value={phone} onChangeText={setPhone} placeholder={t("phone")} keyboardType="phone-pad" />

          <SectionTitle>{t("address")}</SectionTitle>
          <Input value={address} onChangeText={setAddress} placeholder={t("address")} />

          <View style={{ height: 20 }} />
          <Button title={t("createBusiness")} onPress={submit} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 24, marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap" },
});