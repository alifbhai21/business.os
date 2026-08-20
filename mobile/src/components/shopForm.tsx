import React from "react";
import { View } from "react-native";
import { Chip, Input, SectionTitle } from "./ui";
import { useI18n } from "../i18n";

export interface ShopFormState {
  name: string;
  branchCode: string;
  address: string;
  phone: string;
  manager: string;
  isWarehouse: boolean;
}

export const emptyShopForm = (): ShopFormState => ({
  name: "",
  branchCode: "",
  address: "",
  phone: "",
  manager: "",
  isWarehouse: false,
});

export function ShopFormFields({
  form,
  onChange,
}: {
  form: ShopFormState;
  onChange: (next: ShopFormState) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <SectionTitle>{t("shopName")}</SectionTitle>
      <Input
        value={form.name}
        onChangeText={(v) => onChange({ ...form, name: v })}
        placeholder={t("shopName")}
        autoCapitalize="words"
      />
      <SectionTitle>{t("branchCode")}</SectionTitle>
      <Input
        value={form.branchCode}
        onChangeText={(v) => onChange({ ...form, branchCode: v })}
        placeholder={t("branchCode")}
        autoCapitalize="words"
      />
      <SectionTitle>{t("address")}</SectionTitle>
      <Input value={form.address} onChangeText={(v) => onChange({ ...form, address: v })} placeholder={t("address")} />
      <SectionTitle>{t("phone")}</SectionTitle>
      <Input
        value={form.phone}
        onChangeText={(v) => onChange({ ...form, phone: v })}
        placeholder={t("phone")}
        keyboardType="phone-pad"
      />
      <SectionTitle>{t("manager")}</SectionTitle>
      <Input value={form.manager} onChangeText={(v) => onChange({ ...form, manager: v })} placeholder={t("manager")} />
      <View style={{ flexDirection: "row", marginTop: 12 }}>
        <Chip
          label={t("warehouse")}
          active={form.isWarehouse}
          onPress={() => onChange({ ...form, isWarehouse: !form.isWarehouse })}
        />
      </View>
    </>
  );
}