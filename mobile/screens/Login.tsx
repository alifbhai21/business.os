import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, ErrorBanner, Input } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { useAuth } from "../src/auth";

export function LoginScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (phone.trim().length < 5) return setError(t("phoneRequired"));
    if (password.length < 4) return setError(t("passwordShort"));
    setLoading(true);
    try {
      // Backend (Phase 02) authenticates by email. The account is registered with
      // email = {phone}@placeholder.local, so derive the identifier from the phone field.
      const email = `${phone.trim()}@placeholder.local`;
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("network"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Text style={styles.title}>{t("signIn")}</Text>
        <ErrorBanner message={error} />
        <View style={styles.form}>
          <Input value={phone} onChangeText={setPhone} placeholder={t("phone")} keyboardType="phone-pad" />
          <View style={{ height: 12 }} />
          <Input value={password} onChangeText={setPassword} placeholder={t("password")} secureTextEntry />
          <View style={{ height: 20 }} />
          <Button title={t("login")} onPress={submit} loading={loading} />
        </View>
        <Text style={styles.back} onPress={onBack}>
          ← {t("goToRegister")}
        </Text>
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
    marginTop: 32,
    marginBottom: 20,
  },
  form: {
    marginTop: 8,
  },
  back: {
    marginTop: 24,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14,
  },
});