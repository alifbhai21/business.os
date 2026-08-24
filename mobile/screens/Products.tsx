import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Chip, ErrorBanner, FormModal, InfoBanner, Input } from "../src/components/ui";
import { ApiError, authRequest } from "../src/api";
import { authMutation } from "../src/offline/mutate";
import { loadCachedProducts } from "../src/offline/readCache";
import { useAuth } from "../src/auth";
import { useI18n } from "../src/i18n";
import { colors } from "../src/theme";
import { formatTaka, takaToPaisa } from "../src/money";

interface Category {
  id: string;
  name: string;
  status: string;
}

interface SupplierLite {
  id: string;
  name: string;
}

interface Unit {
  value: string;
  label: string;
  labelBn: string;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  categoryId: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  wholesalePrice: number;
  minPrice: number;
  taxRate: number;
  currentStock: number;
  minStock: number;
  maxStock: number;
  preferredSupplierId: string | null;
  description: string | null;
  imageUrl: string | null;
  status: string;
}

interface ProductListResponse {
  data: {
    items: Product[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

interface CategoryListResponse {
  data: {
    items: Category[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

const PAGE_SIZE = 50;

type ViewMode = "products" | "categories";

interface ProductForm {
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  categoryId: string;
  unit: string;
  purchasePrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  minPrice: string;
  taxRate: string;
  currentStock: string;
  minStock: string;
  maxStock: string;
  preferredSupplierId: string;
  description: string;
  imageUrl: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  sku: "",
  barcode: "",
  brand: "",
  categoryId: "",
  unit: "",
  purchasePrice: "",
  sellingPrice: "",
  wholesalePrice: "",
  minPrice: "",
  taxRate: "",
  currentStock: "",
  minStock: "",
  maxStock: "",
  preferredSupplierId: "",
  description: "",
  imageUrl: "",
};

export function ProductsScreen() {
  const { t, lang } = useI18n();
  const { activeBusinessId, user } = useAuth();
  const [mode, setMode] = useState<ViewMode>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const bizId = activeBusinessId ?? "";

  const unitLabel = useCallback(
    (value: string) => {
      const u = units.find((x) => x.value === value);
      if (!u) return value;
      return lang === "bn" ? u.labelBn : u.label;
    },
    [units, lang]
  );

  const loadUnits = useCallback(async () => {
    try {
      const res = await authRequest<{ data: Unit[] }>("/api/v1/units");
      setUnits(res.data);
    } catch {
      setUnits([]);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    if (!bizId) {
      setCategories([]);
      return;
    }
    try {
      const res = await authRequest<CategoryListResponse>(
        `/api/v1/categories?businessId=${encodeURIComponent(bizId)}&limit=100`
      );
      setCategories(res.data.items);
    } catch {
      setCategories([]);
    }
  }, [bizId]);

  const loadSuppliers = useCallback(async () => {
    if (!bizId) {
      setSuppliers([]);
      return;
    }
    try {
      const res = await authRequest<{ data: { items: SupplierLite[] } }>(
        `/api/v1/suppliers?businessId=${encodeURIComponent(bizId)}&limit=100`
      );
      setSuppliers(res.data.items);
    } catch {
      setSuppliers([]);
    }
  }, [bizId]);

  const loadProducts = useCallback(
    async (page = 1, append = false) => {
      if (!bizId) {
        setProducts([]);
        setLoading(false);
        return;
      }
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const qs: string[] = [`businessId=${encodeURIComponent(bizId)}`, `page=${page}`, `limit=${PAGE_SIZE}`];
        if (search.trim()) qs.push(`search=${encodeURIComponent(search.trim())}`);
        if (lowStockOnly) qs.push("lowStock=true");
        if (categoryFilter) qs.push(`categoryId=${encodeURIComponent(categoryFilter)}`);
        const res = await authRequest<ProductListResponse>(`/api/v1/products?${qs.join("&")}`);
        const { items, pagination } = res.data;
        setProducts((prev) => (append ? [...prev, ...items] : items));
        setHasMore(page < pagination.totalPages);
      } catch (e) {
        // Phase 10 — offline fallback: serve the pulled cache read-only.
        if (e instanceof ApiError && e.status === 0 && page === 1) {
          const cached = await loadCachedProducts(bizId);
          if (cached.length > 0) {
            setProducts(cached.map((c) => ({
              id: c.id,
              name: c.name,
              sku: c.sku,
              barcode: c.barcode,
              brand: null,
              categoryId: null,
              unit: c.unit,
              purchasePrice: c.purchasePrice,
              sellingPrice: c.sellingPrice,
              wholesalePrice: 0,
              minPrice: 0,
              taxRate: c.taxRate,
              currentStock: c.currentStock,
              minStock: c.minStock,
              maxStock: 0,
              preferredSupplierId: null,
              description: null,
              imageUrl: null,
              status: c.status,
            })));
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
    [bizId, search, lowStockOnly, categoryFilter, t]
  );

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    loadCategories();
    loadSuppliers();
  }, [loadCategories, loadSuppliers]);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(1, false), 300);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, unit: units.length > 0 ? units[0].value : "piece" });
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      brand: p.brand ?? "",
      categoryId: p.categoryId ?? "",
      unit: p.unit,
      purchasePrice: String(p.purchasePrice / 100),
      sellingPrice: String(p.sellingPrice / 100),
      wholesalePrice: String(p.wholesalePrice / 100),
      minPrice: String(p.minPrice / 100),
      taxRate: String(p.taxRate),
      currentStock: String(p.currentStock),
      minStock: String(p.minStock),
      maxStock: String(p.maxStock),
      preferredSupplierId: p.preferredSupplierId ?? "",
      description: p.description ?? "",
      imageUrl: p.imageUrl ?? "",
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
    const body = {
      businessId: bizId,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      brand: form.brand.trim() || null,
      categoryId: form.categoryId || null,
      unit: form.unit,
      purchasePrice: takaToPaisa(form.purchasePrice),
      sellingPrice: takaToPaisa(form.sellingPrice),
      wholesalePrice: takaToPaisa(form.wholesalePrice),
      minPrice: takaToPaisa(form.minPrice),
      taxRate: Number(form.taxRate) || 0,
      currentStock: Number(form.currentStock) || 0,
      minStock: Number(form.minStock) || 0,
      maxStock: Number(form.maxStock) || 0,
      preferredSupplierId: form.preferredSupplierId || null,
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
    };
    try {
      if (editing) {
        await authRequest(`/api/v1/products/${editing.id}`, { method: "PATCH", body });
      } else {
        // Phase 10 — offline-capable create: network failures queue the
        // identical payload for /sync/push.
        const result = await authMutation(user?.id ?? "", "product", "/api/v1/products", body);
        if (result.queued) setInfo(t("queuedOffline"));
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await loadProducts(1, false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(t("barcodeTaken"));
      } else {
        setError(e instanceof Error ? e.message : t("genericError"));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (p: Product) => {
    setSaving(true);
    try {
      await authRequest(`/api/v1/products/${p.id}/status`, {
        method: "PATCH",
        body: { businessId: bizId, status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
      });
      await loadProducts(1, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  // ---- Category manager ----
  const openCatCreate = () => {
    setEditingCat(null);
    setCatForm("");
    setCatError(null);
    setCatModalOpen(true);
  };

  const openCatEdit = (c: Category) => {
    setEditingCat(c);
    setCatForm(c.name);
    setCatError(null);
    setCatModalOpen(true);
  };

  const submitCategory = async () => {
    if (!catForm.trim()) {
      setCatError(t("nameRequired"));
      return;
    }
    setCatSaving(true);
    try {
      if (editingCat) {
        await authRequest(`/api/v1/categories/${editingCat.id}`, {
          method: "PATCH",
          body: { businessId: bizId, name: catForm.trim() },
        });
      } else {
        await authRequest("/api/v1/categories", {
          method: "POST",
          body: { businessId: bizId, name: catForm.trim() },
        });
      }
      setCatModalOpen(false);
      setCatForm("");
      await loadCategories();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setCatError(t("categoryExists"));
      } else {
        setCatError(e instanceof Error ? e.message : t("genericError"));
      }
    } finally {
      setCatSaving(false);
    }
  };

  const toggleCategoryStatus = async (c: Category) => {
    try {
      await authRequest(`/api/v1/categories/${c.id}/status`, {
        method: "PATCH",
        body: { businessId: bizId, status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
      });
      await loadCategories();
    } catch {
      // ignore
    }
  };

  const activeCategoryOptions = useMemo(() => categories.filter((c) => c.status === "ACTIVE"), [categories]);

  const renderProduct = ({ item }: { item: Product }) => {
    const low = item.minStock > 0 && item.currentStock <= item.minStock;
    const catName = activeCategoryOptions.find((c) => c.id === item.categoryId)?.name;
    return (
      <Pressable style={styles.row} onPress={() => openEdit(item)}>
        <View style={styles.rowMain}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowMeta}>
            {item.sku || item.barcode ? `${item.sku || item.barcode} · ` : ""}
            {catName ? `${catName} · ` : ""}
            {unitLabel(item.unit)}
          </Text>
          <Text style={styles.rowPrice}>{formatTaka(item.sellingPrice)}</Text>
        </View>
        <View style={[styles.stockBadge, low && styles.stockBadgeLow]}>
          <Text style={[styles.stockText, low && { color: colors.danger }]}>
            {t("stock")}: {item.currentStock}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <Pressable style={styles.row} onPress={() => openCatEdit(item)}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowMeta}>{item.status === "ACTIVE" ? t("active") : t("inactive")}</Text>
      </View>
      <Button
        title={item.status === "ACTIVE" ? t("deactivate") : t("activate")}
        variant={item.status === "ACTIVE" ? "secondary" : "primary"}
        onPress={() => toggleCategoryStatus(item)}
      />
    </Pressable>
  );

  const optionChips = (options: { value: string; label: string }[], selected: string, onSelect: (v: string) => void) => (
    <View style={styles.optionWrap}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} active={selected === o.value} onPress={() => onSelect(o.value)} />
      ))}
    </View>
  );

  if (mode === "categories") {
    return (
      <View style={styles.container}>
        <View style={styles.toolbar}>
          <View style={styles.chipsRow}>
            <Button title={`← ${t("products")}`} variant="secondary" onPress={() => setMode("products")} />
            <View style={{ flex: 1 }} />
            <Button title={`+ ${t("addCategory")}`} onPress={openCatCreate} />
          </View>
        </View>
        {categories.length === 0 ? (
          <Text style={styles.empty}>{t("noCategory")}</Text>
        ) : (
          <FlatList data={categories} keyExtractor={(c) => c.id} renderItem={renderCategory} />
        )}
        <FormModal visible={catModalOpen} onClose={() => setCatModalOpen(false)} title={t("categoryName")}>
          <ErrorBanner message={catError} />
          <Input
            value={catForm}
            onChangeText={setCatForm}
            placeholder={t("categoryName")}
            autoCapitalize="words"
          />
          <View style={{ height: 16 }} />
          <Button title={t("save")} onPress={submitCategory} loading={catSaving} />
        </FormModal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Input value={search} onChangeText={setSearch} placeholder={t("search")} />
        <View style={{ height: 8 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label={t("allStock")} active={!lowStockOnly} onPress={() => setLowStockOnly(false)} />
          <Chip label={t("lowStock")} active={lowStockOnly} onPress={() => setLowStockOnly(true)} />
          {activeCategoryOptions.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={categoryFilter === c.id}
              onPress={() => setCategoryFilter(categoryFilter === c.id ? "" : c.id)}
            />
          ))}
        </ScrollView>
        <View style={{ height: 8 }} />
        <View style={styles.chipsRow}>
          <Button title={t("manageCategories")} variant="secondary" onPress={() => setMode("categories")} />
          <View style={{ flex: 1 }} />
          <Button title={`+ ${t("addProduct")}`} onPress={openCreate} />
        </View>
      </View>

      <InfoBanner message={info} />
      <ErrorBanner message={error} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : products.length === 0 ? (
        <Text style={styles.empty}>{t("noData")}</Text>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={renderProduct}
          onEndReached={() => {
            if (hasMore && !loadingMore) loadProducts(Math.ceil(products.length / PAGE_SIZE) + 1, true);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} /> : null
          }
        />
      )}

      <FormModal visible={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t("editProduct") : t("addProduct")}>
        <ScrollView>
          <ErrorBanner message={error} />
          <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder={t("productName")} autoCapitalize="words" />
          <View style={{ height: 8 }} />
          <Input value={form.sku} onChangeText={(v) => setForm({ ...form, sku: v })} placeholder={t("sku")} />
          <View style={{ height: 8 }} />
          <Input value={form.barcode} onChangeText={(v) => setForm({ ...form, barcode: v })} placeholder={t("barcode")} />
          <View style={{ height: 8 }} />
          <Input value={form.brand} onChangeText={(v) => setForm({ ...form, brand: v })} placeholder={t("brand")} />
          <View style={{ height: 8 }} />
          <Text style={styles.fieldLabel}>{t("category")}</Text>
          <View style={styles.optionWrap}>
            <Chip label={t("none")} active={!form.categoryId} onPress={() => setForm({ ...form, categoryId: "" })} />
            {activeCategoryOptions.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                active={form.categoryId === c.id}
                onPress={() => setForm({ ...form, categoryId: c.id })}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Text style={styles.fieldLabel}>{t("unit")}</Text>
          <View style={styles.optionWrap}>
            {units.map((u) => (
              <Chip
                key={u.value}
                label={lang === "bn" ? u.labelBn : u.label}
                active={form.unit === u.value}
                onPress={() => setForm({ ...form, unit: u.value })}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Input value={form.purchasePrice} onChangeText={(v) => setForm({ ...form, purchasePrice: v })} placeholder={t("purchasePrice")} keyboardType="decimal-pad" />
            </View>
            <View style={{ width: 8 }} />
            <View style={{ flex: 1 }}>
              <Input value={form.sellingPrice} onChangeText={(v) => setForm({ ...form, sellingPrice: v })} placeholder={t("sellingPrice")} keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={{ height: 8 }} />
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Input value={form.wholesalePrice} onChangeText={(v) => setForm({ ...form, wholesalePrice: v })} placeholder={t("wholesalePrice")} keyboardType="decimal-pad" />
            </View>
            <View style={{ width: 8 }} />
            <View style={{ flex: 1 }}>
              <Input value={form.minPrice} onChangeText={(v) => setForm({ ...form, minPrice: v })} placeholder={t("minPrice")} keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={{ height: 8 }} />
          <Input value={form.taxRate} onChangeText={(v) => setForm({ ...form, taxRate: v })} placeholder={t("taxRate")} keyboardType="numeric" />
          <View style={{ height: 8 }} />
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Input value={form.currentStock} onChangeText={(v) => setForm({ ...form, currentStock: v })} placeholder={t("stock")} keyboardType="numeric" />
            </View>
            <View style={{ width: 8 }} />
            <View style={{ flex: 1 }}>
              <Input value={form.minStock} onChangeText={(v) => setForm({ ...form, minStock: v })} placeholder={t("minStock")} keyboardType="numeric" />
            </View>
          </View>
          <View style={{ height: 8 }} />
          <Input value={form.maxStock} onChangeText={(v) => setForm({ ...form, maxStock: v })} placeholder={t("maxStock")} keyboardType="numeric" />
          <View style={{ height: 8 }} />
          <Text style={styles.fieldLabel}>{t("preferredSupplier")}</Text>
          <View style={styles.optionWrap}>
            <Chip label={t("none")} active={!form.preferredSupplierId} onPress={() => setForm({ ...form, preferredSupplierId: "" })} />
            {suppliers.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                active={form.preferredSupplierId === s.id}
                onPress={() => setForm({ ...form, preferredSupplierId: s.id })}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Input value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder={t("description")} />
          <View style={{ height: 8 }} />
          <Input value={form.imageUrl} onChangeText={(v) => setForm({ ...form, imageUrl: v })} placeholder={t("imageUrl")} />
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
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 6,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
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
  rowPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 2,
  },
  stockBadge: {
    backgroundColor: colors.chipBg,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stockBadgeLow: {
    backgroundColor: "#FEE2E2",
  },
  stockText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    marginTop: 60,
    fontSize: 15,
  },
  formRow: {
    flexDirection: "row",
  },
});