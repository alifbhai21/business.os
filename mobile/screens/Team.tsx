import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Button,
  Card,
  Chip,
  ErrorBanner,
  FormModal,
  Input,
} from "../src/components/ui";
import { ApiError, authRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";

/**
 * Phase 09 — Employees, Roles & Devices hub.
 *
 * Every value shown comes from the server payload; the app never computes or
 * trusts business figures client-side. Mutations go through the same
 * validated endpoints the tests exercise, so RBAC errors surface verbatim.
 */

type Section = "employees" | "roles" | "devices" | "audit";

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface EmployeeRow {
  id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  shopId: string | null;
  userId: string | null;
}

interface RoleRow {
  name: string;
  permissions: string[];
}

interface DeviceRow {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  status: string;
  lastSyncAt: string | null;
  userPhone: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  userName: string | null;
  details: string | null;
  recordId: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

const ROLE_OPTIONS = [
  "Owner",
  "Admin",
  "Manager",
  "Accountant",
  "Salesperson",
  "Inventory Manager",
  "Viewer",
];

export function TeamScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("employees");

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t("team")}</Text>
      <View style={styles.sectionChips}>
        <Chip label={t("teamEmployees")} active={section === "employees"} onPress={() => setSection("employees")} />
        <Chip label={t("teamRoles")} active={section === "roles"} onPress={() => setSection("roles")} />
        <Chip label={t("teamDevices")} active={section === "devices"} onPress={() => setSection("devices")} />
        <Chip label={t("teamAudit")} active={section === "audit"} onPress={() => setSection("audit")} />
      </View>
      {section === "employees" && <EmployeesSection />}
      {section === "roles" && <RolesSection />}
      {section === "devices" && <DevicesSection />}
      {section === "audit" && <AuditSection />}
      <View style={{ height: 12 }} />
      <Button title={t("back")} onPress={onDone} variant="secondary" />
    </SafeAreaView>
  );
}

// ── Employees ───────────────────────────────────────────────────────────────

function statusStyle(status: string) {
  if (status === "ACTIVE") return styles.badgeActive;
  if (status === "REMOVED") return styles.badgeInactive;
  return styles.badgePending;
}

function statusLabel(status: string, t: (k: string) => string) {
  if (status === "ACTIVE") return t("active");
  if (status === "INVITED") return t("statusInvited");
  if (status === "SUSPENDED") return t("statusSuspended");
  return t("statusRemoved");
}

function EmployeesSection() {
  const { t } = useI18n();
  const { activeBusinessId, shops } = useAuth();
  const bizId = activeBusinessId ?? "";

  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", role: "Salesperson", shopId: "" });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (page = 1, append = false) => {
      if (!bizId) {
        setRows([]);
        setLoading(false);
        return;
      }
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await authRequest<{ data: { data: EmployeeRow[]; pagination: Pagination } }>(
          `/api/v1/employees?businessId=${encodeURIComponent(bizId)}&page=${page}&limit=${PAGE_SIZE}`
        );
        setRows((prev) => (append ? [...prev, ...res.data.data] : res.data.data));
        setHasMore(page < res.data.pagination.totalPages);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [bizId, t]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", phone: "", role: "Salesperson", shopId: "" });
    setModalOpen(true);
  };

  const openEdit = (emp: EmployeeRow) => {
    setEditing(emp);
    setForm({ name: emp.name, phone: emp.phone, role: emp.role, shopId: emp.shopId ?? "" });
    setModalOpen(true);
  };

  const save = async () => {
    if (!bizId) return;
    if (!form.name.trim()) return setError(t("employeeNameRequired"));
    if (!form.phone.trim()) return setError(t("employeePhoneRequired"));
    setSaving(true);
    setError(null);
    try {
      const shopId = form.shopId || undefined;
      if (editing) {
        await authRequest(`/api/v1/employees/${editing.id}`, {
          method: "PUT",
          body: {
            businessId: bizId,
            name: form.name.trim(),
            phone: form.phone.trim(),
            role: form.role,
            ...(editing.shopId || shopId ? { shopId: shopId ?? null } : {}),
          },
        });
      } else {
        await authRequest("/api/v1/employees", {
          method: "POST",
          body: {
            businessId: bizId,
            name: form.name.trim(),
            phone: form.phone.trim(),
            role: form.role,
            ...(shopId ? { shopId } : {}),
          },
        });
      }
      setModalOpen(false);
      setEditing(null);
      await load(1, false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t("employeeDuplicate"));
      else setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (emp: EmployeeRow) => {
    if (!bizId) return;
    setBusyId(emp.id);
    setError(null);
    try {
      await authRequest(`/api/v1/employees/${emp.id}`, {
        method: "DELETE",
        body: { businessId: bizId },
      });
      await load(1, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ErrorBanner message={error} />
      <View style={styles.actionsRow}>
        <Button title={t("addEmployee")} onPress={openCreate} />
        <Button title={t("refresh")} onPress={() => load(1, false)} variant="secondary" />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t("noEmployees")}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(e) => e.id}
          onEndReached={() => {
            if (hasMore && !loadingMore) load(Math.ceil(rows.length / PAGE_SIZE) + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null
          }
          renderItem={({ item }) => (
            <Card>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>{item.phone}</Text>
              <View style={styles.badgeRow}>
                <Text style={styles.chip}>{item.role}</Text>
                <Text style={[styles.badge, statusStyle(item.status)]}>
                  {statusLabel(item.status, t)}
                </Text>
              </View>
              {item.status !== "REMOVED" && (
                <View style={styles.cardActions}>
                  <Button title={t("edit")} onPress={() => openEdit(item)} variant="secondary" />
                  <Button
                    title={t("removeEmployee")}
                    onPress={() => remove(item)}
                    variant="danger"
                    loading={busyId === item.id}
                  />
                </View>
              )}
            </Card>
          )}
        />
      )}

      <FormModal
        visible={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? t("editEmployee") : t("addEmployee")}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>{t("employeeName")}</Text>
          <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder={t("employeeName")} autoCapitalize="words" />
          <Text style={styles.fieldLabel}>{t("employeePhone")}</Text>
          <Input value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder={t("employeePhone")} keyboardType="phone-pad" />
          <Text style={styles.fieldLabel}>{t("employeeRole")}</Text>
          <View style={styles.wrapChips}>
            {ROLE_OPTIONS.filter((r) => r !== "Owner").map((r) => (
              <Chip key={r} label={r} active={form.role === r} onPress={() => setForm({ ...form, role: r })} />
            ))}
          </View>
          <Text style={styles.fieldLabel}>{t("employeeShop")}</Text>
          <View style={styles.wrapChips}>
            <Chip label={t("allShops")} active={form.shopId === ""} onPress={() => setForm({ ...form, shopId: "" })} />
            {shops.map((s) => (
              <Chip key={s.id} label={s.name} active={form.shopId === s.id} onPress={() => setForm({ ...form, shopId: s.id })} />
            ))}
          </View>
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={save} loading={saving} />
        </ScrollView>
      </FormModal>
    </View>
  );
}

// ── Roles ───────────────────────────────────────────────────────────────────

function RolesSection() {
  const { t } = useI18n();
  const { activeBusinessId } = useAuth();
  const bizId = activeBusinessId ?? "";

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [role, setRole] = useState("Viewer");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!bizId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [roleRes, empRes] = await Promise.all([
        authRequest<{ data: RoleRow[] }>("/api/v1/roles"),
        authRequest<{ data: { data: EmployeeRow[] } }>(
          `/api/v1/employees?businessId=${encodeURIComponent(bizId)}&limit=100`
        ),
      ]);
      setRoles(roleRes.data);
      setEmployees(empRes.data.data.filter((e) => e.status === "ACTIVE" && e.role !== "Owner"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }, [bizId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const assign = async () => {
    if (!bizId || !targetId) return;
    setSaving(true);
    setError(null);
    try {
      await authRequest("/api/v1/roles", {
        method: "POST",
        body: { businessId: bizId, employeeId: targetId, role },
      });
      setAssignOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ErrorBanner message={error} />
      <View style={styles.actionsRow}>
        <Button title={t("assignRole")} onPress={() => setAssignOpen(true)} disabled={employees.length === 0} />
        <Button title={t("refresh")} onPress={load} variant="secondary" />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : roles.length === 0 ? (
        <Text style={styles.empty}>{t("noRoles")}</Text>
      ) : (
        <FlatList
          data={roles}
          keyExtractor={(r) => r.name}
          renderItem={({ item }) => (
            <Card>
              <Text style={styles.rowName}>{item.name}</Text>
              <View style={styles.wrapChips}>
                {item.permissions.map((p) => (
                  <Text key={p} style={styles.chip}>
                    {p}
                  </Text>
                ))}
              </View>
            </Card>
          )}
        />
      )}

      <FormModal visible={assignOpen} onClose={() => setAssignOpen(false)} title={t("assignRole")}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>{t("chooseEmployee")}</Text>
          <View style={styles.wrapChips}>
            {employees.map((e) => (
              <Chip key={e.id} label={`${e.name} (${e.role})`} active={targetId === e.id} onPress={() => setTargetId(e.id)} />
            ))}
          </View>
          {targetId !== "" && (
            <>
              <Text style={styles.fieldLabel}>{t("chooseRole")}</Text>
              <View style={styles.wrapChips}>
                {ROLE_OPTIONS.filter((r) => r !== "Owner").map((r) => (
                  <Chip key={r} label={r} active={role === r} onPress={() => setRole(r)} />
                ))}
              </View>
            </>
          )}
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={assign} loading={saving} disabled={!targetId} />
        </ScrollView>
      </FormModal>
    </View>
  );
}

// ── Devices ─────────────────────────────────────────────────────────────────

function DevicesSection() {
  const { t } = useI18n();
  const { activeBusinessId, user } = useAuth();
  const bizId = activeBusinessId ?? "";

  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (page = 1, append = false) => {
      if (!bizId) {
        setRows([]);
        setLoading(false);
        return;
      }
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await authRequest<{ data: { data: DeviceRow[]; pagination: Pagination } }>(
          `/api/v1/devices?businessId=${encodeURIComponent(bizId)}&page=${page}&limit=${PAGE_SIZE}`
        );
        setRows((prev) => (append ? [...prev, ...res.data.data] : res.data.data));
        setHasMore(page < res.data.pagination.totalPages);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [bizId, t]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const revoke = async (device: DeviceRow) => {
    if (!bizId) return;
    setBusyId(device.id);
    setError(null);
    try {
      await authRequest(`/api/v1/devices/${device.id}/revoke`, {
        method: "PUT",
        body: { businessId: bizId },
      });
      await load(1, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusyId(null);
    }
  };

  const heartbeat = async (device: DeviceRow) => {
    if (!bizId) return;
    setBusyId(device.id);
    setError(null);
    try {
      await authRequest(`/api/v1/devices/${device.id}/sync`, {
        method: "PUT",
        body: { businessId: bizId },
      });
      await load(1, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusyId(null);
    }
  };

  const isOwn = (d: DeviceRow) => Boolean(user?.phone) && d.userPhone === user?.phone;

  return (
    <View style={{ flex: 1 }}>
      <ErrorBanner message={error} />
      <View style={styles.actionsRow}>
        <Button title={t("refresh")} onPress={() => load(1, false)} variant="secondary" />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t("noDevices")}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(d) => d.id}
          onEndReached={() => {
            if (hasMore && !loadingMore) load(Math.ceil(rows.length / PAGE_SIZE) + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null
          }
          renderItem={({ item }) => (
            <Card>
              <Text style={styles.rowName}>{item.deviceName}</Text>
              <Text style={styles.rowMeta}>
                {item.platform} · {item.appVersion} · #{item.deviceId.slice(-8)}
              </Text>
              <Text style={styles.rowMeta}>
                {item.userPhone ? `${t("deviceOwner")}: ${item.userPhone}` : ""}
              </Text>
              <Text style={styles.rowMeta}>
                {t("lastSync")}:{" "}
                {item.lastSyncAt ? new Date(item.lastSyncAt).toLocaleString() : t("neverSynced")}
              </Text>
              <View style={styles.badgeRow}>
                <Text style={[styles.badge, item.status === "ACTIVE" ? styles.badgeActive : styles.badgeInactive]}>
                  {item.status === "ACTIVE" ? t("active") : t("statusRevoked")}
                </Text>
              </View>
              <View style={styles.cardActions}>
                {item.status === "ACTIVE" && (
                  <Button
                    title={t("revokeDevice")}
                    onPress={() => revoke(item)}
                    variant="danger"
                    loading={busyId === item.id}
                  />
                )}
                {item.status === "ACTIVE" && isOwn(item) && (
                  <Button
                    title={t("markSynced")}
                    onPress={() => heartbeat(item)}
                    variant="secondary"
                    loading={busyId === item.id}
                  />
                )}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

// ── Audit ───────────────────────────────────────────────────────────────────

function AuditSection() {
  const { t } = useI18n();
  const { activeBusinessId } = useAuth();
  const bizId = activeBusinessId ?? "";

  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");

  const load = useCallback(
    async (page = 1, append = false) => {
      if (!bizId) {
        setRows([]);
        setLoading(false);
        return;
      }
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const filterQ = appliedFilter ? `&action=${encodeURIComponent(appliedFilter)}` : "";
        const res = await authRequest<{ data: { data: AuditEntry[]; pagination: Pagination } }>(
          `/api/v1/audit?businessId=${encodeURIComponent(bizId)}${filterQ}&page=${page}&limit=${PAGE_SIZE}`
        );
        setRows((prev) => (append ? [...prev, ...res.data.data] : res.data.data));
        setHasMore(page < res.data.pagination.totalPages);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("genericError"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [bizId, appliedFilter, t]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <ErrorBanner message={error} />
      <View style={styles.filterRow}>
        <View style={{ flex: 1 }}>
          <Input
            value={actionFilter}
            onChangeText={setActionFilter}
            placeholder={t("auditFilterPlaceholder")}
          />
        </View>
        <Button title={t("applyFilter")} onPress={() => setAppliedFilter(actionFilter.trim())} variant="secondary" />
      </View>
      {appliedFilter !== "" && (
        <Button
          title={t("clearFilter")}
          onPress={() => {
            setActionFilter("");
            setAppliedFilter("");
          }}
          variant="secondary"
        />
      )}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t("noAuditRows")}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(a) => a.id}
          onEndReached={() => {
            if (hasMore && !loadingMore) load(Math.ceil(rows.length / PAGE_SIZE) + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null
          }
          renderItem={({ item }) => (
            <View style={styles.auditRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.action}</Text>
                <Text style={styles.rowMeta}>{item.userName ?? t("unknownUser")}</Text>
                {item.recordId ? <Text style={styles.rowMeta}>#{item.recordId.slice(-8)}</Text> : null}
              </View>
              <Text style={styles.rowMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 10 },
  sectionChips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  actionsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  rowName: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  badgeActive: { color: colors.success },
  badgeInactive: { color: colors.danger },
  badgePending: { color: "#B7791F" },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: colors.chipBg,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 12,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
    marginRight: 6,
    marginBottom: 6,
  },
  wrapChips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginTop: 10, marginBottom: 6 },
  filterRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 },
  auditRow: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 60, fontSize: 15 },
});
