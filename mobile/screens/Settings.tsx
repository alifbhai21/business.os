import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { Button, Card, Chip, SectionTitle } from "../src/components/ui";
import { useI18n } from "../src/i18n";
import { colors, typeLabels } from "../src/theme";
import { useAuth } from "../src/auth";

export type SettingsRoute = "businessSwitcher" | "shopSwitcher" | "businessSettings" | "shopManagement";

export function SettingsScreen({ onNavigate }: { onNavigate?: (route: SettingsRoute) => void }) {
  const { t, lang, setLang } = useI18n();
  const { business, user, logout } = useAuth();
  const [saved, setSaved] = useState(false);

  const switchLang = (l: "bn" | "en") => {
    setLang(l);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("settings")}</Text>

        <SectionTitle>{t("language")}</SectionTitle>
        <View style={styles.chips}>
          <Chip label="বাংলা" active={lang === "bn"} onPress={() => switchLang("bn")} />
          <Chip label="English" active={lang === "en"} onPress={() => switchLang("en")} />
        </View>
        {saved && <Text style={styles.saved}>✓</Text>}

        <SectionTitle>{t("businessInfo")}</SectionTitle>
        <Card>
          <Text style={styles.bizName}>{business?.name}</Text>
          <Text style={styles.meta}>
            {business ? typeLabels[business.type as keyof typeof typeLabels][lang] : t("noBusiness")}
          </Text>
          <Text style={styles.meta}>{business?.currency ?? ""}</Text>
        </Card>

        {onNavigate && (
          <>
            <SectionTitle>{t("businessSettings")}</SectionTitle>
            <View style={styles.navButtons}>
              <Button title={t("businessSwitcher")} onPress={() => onNavigate("businessSwitcher")} variant="secondary" />
              <Button title={t("shopSwitcher")} onPress={() => onNavigate("shopSwitcher")} variant="secondary" />
              <Button title={t("businessSettings")} onPress={() => onNavigate("businessSettings")} variant="secondary" />
              <Button title={t("shopManagement")} onPress={() => onNavigate("shopManagement")} variant="secondary" />
            </View>
          </>
        )}

        <SectionTitle>{t("account")}</SectionTitle>
        <Card>
          <Text style={styles.meta}>{user?.name}</Text>
          <Text style={styles.meta}>{user?.phone}</Text>
          <Text style={styles.roleBadge}>{user?.role}</Text>
        </Card>

        <View style={{ height: 16 }} />
        <Button title={t("logout")} onPress={logout} variant="danger" />
        <View style={{ height: 40 }} />
      </ScrollView>
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
    marginTop: 16,
    marginBottom: 8,
  },
  chips: {
    flexDirection: "row",
  },
  navButtons: {
    gap: 8,
  },
  saved: {
    color: colors.success,
    fontWeight: "700",
    marginTop: 6,
  },
  bizName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  meta: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.chipBg,
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
    overflow: "hidden",
  },
});