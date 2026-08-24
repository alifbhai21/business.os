import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Chip, ErrorBanner, FormModal, InfoBanner, Input } from "../src/components/ui";
import { ApiError, authRequest } from "../src/api";
import { authMutation } from "../src/offline/mutate";
import { loadCachedCustomers, loadCachedSuppliers } from "../src/offline/readCache";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka, takaToPaisa } from "../src/money";

interface Party {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  company: string | null;
  customerCode: string | null;
  openingBalance: number;
  creditLimit: number;
  currentDue: number;
  currentPayable: number;
  status: string;
}

interface PartyListResponse {
  data: {
    items: Party[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

type Tab = "customers" | "suppliers";

const PAGE_SIZE = 50;

interface PartyForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  company: string;
  customerCode: string;
  openingBalance: string;
  creditLimit: string;
}

const EMPTY_FORM: PartyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  company: "",
  customerCode: "",
  openingBalance: "",
  creditLimit: "",
};

export function PartiesScreen() {
  const { t } = useI18n();
  const { activeBusinessId, user } = useAuth();
  const [tab, setTab] = useState<Tab>("customers");
  const [items, setItems] = useState<Party[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PartyForm>(EMPTY_FORM);

  const bizId = activeBusinessId ?? "";
  const path = tab === "customers" ? "customers" : "suppliers";
  const addLabel = tab === "customers" ? t("addCustomer") : t("addSupplier");
  const editLabel = tab === "customers" ? t("editCustomer") : t("editSupplier");

  const load = useCallback(
    async (page = 1, append = false) => {
      if (!bizId) {
        setItems([]);
        setLoading(false);
        return;
      }
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const qs: string[] = [`businessId=${encodeURIComponent(bizId)}`, `page=${page}`, `limit=${PAGE_SIZE}`];
        if (search.trim()) qs.push(`search=${encodeURIComponent(search.trim())}`);
        const res = await authRequest<PartyListResponse>(`/api/v1/${path}?${qs.join("&")}`);
        const { items: newItems, pagination } = res.data;
        setItems((prev) => (append ? [...prev, ...newItems] : newItems));
        setHasMore(page < pagination.totalPages);
      } catch (e) {
        // Phase 10 — offline fallback: serve the pulled cache read-only.
        if (e instanceof ApiError && e.status === 0 && page === 1) {
          const cached = await (tab === "customers"
            ? loadCachedCustomers(bizId)
            : loadCachedSuppliers(bizId));
          if (cached.length > 0) {
            setItems(cached.map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone ?? null,
              email: null,
              address: null,
              company: null,
              customerCode: null,
              openingBalance: 0,
              creditLimit: 0,
              currentDue: c.currentDue ?? 0,
              currentPayable: c.currentPayable ?? 0,
              status: c.status,
            })) as Party[]);
            setHasMore(false);
            setInfo(t("offlineCacheBanner"));
            return;
          }
        }
        setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [bizId, path, search, t]
  );

  useEffect(() => {
    const timer = setTimeout(() => load(1, false), 300);
    return () => clearTimeout(timer);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (p: Party) => {
    setEditing(p);
    setForm({
      name: p.name,
      phone: p.phone ?? "",
      email: p.email ?? "",
      address: p.address ?? "",
      company: p.company ?? "",
      customerCode: p.customerCode ?? "",
      openingBalance: String(p.openingBalance / 100),
      creditLimit: String(p.creditLimit / 100),
    });
    setModalOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    const body: Record<string, unknown> = {
      businessId: bizId,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      openingBalance: takaToPaisa(form.openingBalance),
    };
    if (tab === "customers") {
      body.customerCode = form.customerCode.trim() || null;
      body.creditLimit = takaToPaisa(form.creditLimit);
    } else {
      body.company = form.company.trim() || null;
    }
    try {
      if (editing) {
        await authRequest(`/api/v1/${path}/${editing.id}`, { method: "PATCH", body });
      } else {
        // Phase 10 — offline-capable create (customer/supplier): a network
        // failure queues the identical payload for /sync/push.
        const result = await authMutation(user?.id ?? "", path === "customers" ? "customer" : "supplier", `/api/v1/${path}`, body);
        if (result.queued) setInfo(t("queuedOffline"));
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await load(1, false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(t("categoryExists"));
      } else {
        setError(e instanceof Error ? e.message : t("genericError"));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (p: Party) => {
    try {
      await authRequest(`/api/v1/${path}/${p.id}/status`, {
        method: "PATCH",
        body: { businessId: bizId, status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
      });
      await load(1, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    }
  };

  const renderItem = ({ item }: { item: Party }) => {
    const balanceLabel = tab === "customers" ? t("currentDue") : t("currentPayable");
    const balance = tab === "customers" ? item.currentDue : item.currentPayable;
    return (
      <Pressable style={styles.row} onPress={() => openEdit(item)}>
        <View style={styles.rowMain}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowMeta}>
            {[item.phone, tab === "suppliers" ? item.company : item.customerCode]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {balance > 0 ? (
            <Text style={styles.rowBalance}>
              {balanceLabel}: {formatTaka(balance)}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Input value={search} onChangeText={setSearch} placeholder={t("search")} />
        <View style={{ height: 8 }} />
        <View style={styles.chipsRow}>
          <Chip label={t("customers")} active={tab === "customers"} onPress={() => setTab("customers")} />
          <Chip label={t("suppliers")} active={tab === "suppliers"} onPress={() => setTab("suppliers")} />
          <View style={{ flex: 1 }} />
          <Button title={`+ ${addLabel}`} onPress={openCreate} />
        </View>
      </View>

      <InfoBanner message={info} />
      <ErrorBanner message={error} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("noData")}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          onEndReached={() => {
            if (hasMore && !loadingMore) load(Math.ceil(items.length / PAGE_SIZE) + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null
          }
        />
      )}

      <FormModal visible={modalOpen} onClose={() => setModalOpen(false)} title={editing ? editLabel : addLabel}>
        <ScrollView>
          <ErrorBanner message={error} />
          <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder={t("name")} autoCapitalize="words" />
          <View style={{ height: 8 }} />
          <Input value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder={t("phone")} keyboardType="phone-pad" />
          <View style={{ height: 8 }} />
          <Input value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} placeholder={t("email")} keyboardType="email-address" />
          <View style={{ height: 8 }} />
          <Input value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholder={t("address")} />
          <View style={{ height: 8 }} />
          {tab === "customers" ? (
            <>
              <Input value={form.customerCode} onChangeText={(v) => setForm({ ...form, customerCode: v })} placeholder={t("customerCode")} />
              <View style={{ height: 8 }} />
              <Input value={form.creditLimit} onChangeText={(v) => setForm({ ...form, creditLimit: v })} placeholder={t("creditLimit")} keyboardType="decimal-pad" />
            </>
          ) : (
            <Input value={form.company} onChangeText={(v) => setForm({ ...form, company: v })} placeholder={t("company")} />
          )}
          <View style={{ height: 8 }} />
          <Input
            value={form.openingBalance}
            onChangeText={(v) => setForm({ ...form, openingBalance: v })}
            placeholder={t("openingBalance")}
            keyboardType="decimal-pad"
          />
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={submit} loading={saving} />
          {editing && (
            <>
              <View style={{ height: 8 }} />
              <Button
                title={editing.status === "ACTIVE" ? t("deactivate") : t("activate")}
                variant={editing.status === "ACTIVE" ? "danger" : "primary"}
                onPress={() => {
                  setModalOpen(false);
                  toggleStatus(editing);
                }}
              />
            </>
          )}
        </ScrollView>
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
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  rowMain: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  rowMeta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowBalance: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.danger,
    marginTop: 2,
  },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    marginTop: 60,
    fontSize: 15,
  },
});