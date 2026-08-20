import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, ErrorBanner, Input, SectionTitle } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth";

export function RegisterScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!phone.trim()) return setError(t("phoneRequired"));
    if (password.length < 4) return setError(t("passwordShort"));
    setLoading(true);
    try {
      await register({
        name: name.trim(),
        // Backend (Phase 02) authenticates by email. The account is registered with
        // email = {phone}@placeholder.local, so derive the identifier from the phone field.
        email: `${phone.trim()}@placeholder.local`,
        phone: phone.trim(),
        password,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("network"));
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t("register")}</Text>
          <Text style={styles.stepBadge}>{t("account")}</Text>
          <ErrorBanner message={error} />

          <SectionTitle>{t("name")}</SectionTitle>
          <Input value={name} onChangeText={setName} placeholder={t("name")} autoCapitalize="words" />

          <SectionTitle>{t("phone")}</SectionTitle>
          <Input value={phone} onChangeText={setPhone} placeholder={t("phone")} keyboardType="phone-pad" />

          <SectionTitle>{t("password")}</SectionTitle>
          <Input value={password} onChangeText={setPassword} placeholder={t("password")} secureTextEntry />

          <View style={{ height: 20 }} />
          <Button title={t("register")} onPress={submit} loading={loading} />

          <Text style={styles.back} onPress={onBack}>
            ← {t("goToLogin")}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginTop: 24,
    marginBottom: 4,
  },
  stepBadge: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 16,
  },
  back: {
    marginTop: 24,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 30,
  },
});