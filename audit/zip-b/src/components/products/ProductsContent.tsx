"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Edit, Package, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/format";
import { UNITS } from "@/lib/constants";

interface Product {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  wholesalePrice: number;
  avgCost: number;
  currentStock: number;
  minStock: number;
  maxStock: number;
  isActive: boolean;
  categoryId: number | null;
  categoryName: string | null;
}

interface Category {
  id: number;
  name: string;
}

interface ProductForm {
  name: string;
  categoryId: string;
  sku: string;
  barcode: string;
  brand: string;
  unit: string;
  purchasePrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  currentStock: string;
  minStock: string;
  maxStock: string;
  description: string;
}

const defaultForm: ProductForm = {
  name: "",
  categoryId: "",
  sku: "",
  barcode: "",
  brand: "",
  unit: "piece",
  purchasePrice: "",
  sellingPrice: "",
  wholesalePrice: "",
  currentStock: "0",
  minStock: "0",
  maxStock: "0",
  description: "",
};

export function ProductsContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterCategory) params.set("categoryId", filterCategory);
      if (showLowStock) params.set("lowStock", "true");
      const res = await fetch(`/api/products?${params}`);
      const json = await res.json();
      if (json.success) setProducts(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory, showLowStock]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.data ?? []));
  }, []);

  const openCreate = () => {
    setEditProduct(null);
    setForm(defaultForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setForm({
      name: p.name,
      categoryId: p.categoryId?.toString() ?? "",
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      brand: p.brand ?? "",
      unit: p.unit,
      purchasePrice: (p.purchasePrice / 100).toString(),
      sellingPrice: (p.sellingPrice / 100).toString(),
      wholesalePrice: (p.wholesalePrice / 100).toString(),
      currentStock: p.currentStock.toString(),
      minStock: p.minStock.toString(),
      maxStock: p.maxStock.toString(),
      description: "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.sellingPrice) {
      setError("Name and selling price are required");
      return;
    }

    setSubmitting(true);
    setError("");

    const payload = {
      name: form.name,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      sku: form.sku || null,
      barcode: form.barcode || null,
      brand: form.brand || null,
      unit: form.unit,
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      wholesalePrice: parseFloat(form.wholesalePrice) || 0,
      currentStock: parseInt(form.currentStock) || 0,
      minStock: parseInt(form.minStock) || 0,
      maxStock: parseInt(form.maxStock) || 0,
      description: form.description || null,
    };

    try {
      const url = editProduct ? `/api/products/${editProduct.id}` : "/api/products";
      const method = editProduct ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        fetchProducts();
      } else {
        setError("Failed to save product");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const stockStatus = (p: Product) => {
    if (p.currentStock === 0) return "danger";
    if (p.currentStock <= p.minStock) return "warning";
    return "success";
  };

  const totalStockValue = products.reduce(
    (sum, p) => sum + p.currentStock * p.avgCost,
    0
  );

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-600 font-medium">Total Products</p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {products.length}
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-xs text-emerald-600 font-medium">Stock Value</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {formatCurrency(totalStockValue)}
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="text-xs text-orange-600 font-medium">Low Stock</p>
          <p className="text-xl font-bold text-orange-700 mt-1">
            {
              products.filter(
                (p) => p.currentStock <= p.minStock && p.minStock > 0
              ).length
            }
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium">Out of Stock</p>
          <p className="text-xl font-bold text-red-700 mt-1">
            {products.filter((p) => p.currentStock === 0).length}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search products, SKU, barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowLowStock(!showLowStock)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
            showLowStock
              ? "bg-orange-100 text-orange-700 border border-orange-200"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <AlertTriangle size={14} />
          Low Stock
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Product
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Product
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Category
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  SKU
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Buy Price
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Sell Price
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Stock
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Stock Value
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Status
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700">{p.name}</p>
                      {p.brand && (
                        <p className="text-xs text-slate-400">{p.brand}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.categoryName ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {p.sku ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(p.purchasePrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {formatCurrency(p.sellingPrice)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          p.currentStock === 0
                            ? "text-red-600"
                            : p.currentStock <= p.minStock
                              ? "text-orange-600"
                              : "text-slate-700"
                        }`}
                      >
                        {p.currentStock} {p.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(p.currentStock * p.avgCost)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          stockStatus(p) as
                            | "success"
                            | "warning"
                            | "danger"
                            | "info"
                            | "neutral"
                            | "purple"
                        }
                      >
                        {p.currentStock === 0
                          ? "Out of Stock"
                          : p.currentStock <= p.minStock
                            ? "Low Stock"
                            : "In Stock"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <Edit size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editProduct ? "Edit Product" : "Add New Product"}
        size="lg"
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Product Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Samsung 32 LED TV"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Category
              </label>
              <select
                value={form.categoryId}
                onChange={(e) =>
                  setForm({ ...form, categoryId: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Unit
              </label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                SKU
              </label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="PROD-001"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Barcode
              </label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="8801643012345"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Purchase Price (৳) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) =>
                  setForm({ ...form, purchasePrice: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Selling Price (৳) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) =>
                  setForm({ ...form, sellingPrice: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Opening Stock
              </label>
              <input
                type="number"
                min="0"
                value={form.currentStock}
                onChange={(e) =>
                  setForm({ ...form, currentStock: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Min Stock Alert
              </label>
              <input
                type="number"
                min="0"
                value={form.minStock}
                onChange={(e) =>
                  setForm({ ...form, minStock: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : editProduct ? "Update Product" : "Add Product"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
