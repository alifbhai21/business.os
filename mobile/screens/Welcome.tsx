import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";

export function WelcomeScreen({ onLogin, onRegister }: { onLogin: () => void; onRegister: () => void }) {
  const { t } = useI18n();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>ব</Text>
        </View>
        <Text style={styles.title}>{t("appName")}</Text>
        <Text style={styles.subtitle}>{t("tagline")}</Text>
        <Text style={styles.subtitle2}>{t("welcomeSub")}</Text>
      </View>
      <View style={styles.actions}>
        <Button title={t("signIn")} onPress={onLogin} />
        <View style={{ height: 12 }} />
        <Button title={t("createBusiness")} onPress={onRegister} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoText: {
    fontSize: 40,
    color: "#FFF",
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: "center",
  },
  subtitle2: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  actions: {
    marginBottom: 24,
  },
});