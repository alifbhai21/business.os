"use client";

import React, { useState } from "react";
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  Barcode,
  X,
  Save,
  Tag,
  Boxes,
} from "lucide-react";
import { ProductDTO } from "@/lib/types";
import { Language, translations } from "@/lib/i18n";
import { formatTaka, takaToPaisa } from "@/lib/currency";

interface ProductsViewProps {
  lang: Language;
  products: ProductDTO[];
  onRefreshData: () => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  lang,
  products,
  onRefreshData,
}) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  const [searchQuery, setSearchQuery] = useState("");
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("Piece");
  const [purchasePriceTaka, setPurchasePriceTaka] = useState("");
  const [sellingPriceTaka, setSellingPriceTaka] = useState("");
  const [wholesalePriceTaka, setWholesalePriceTaka] = useState("");
  const [minStock, setMinStock] = useState("5");
  const [currentStock, setCurrentStock] = useState("10");
  const [loading, setLoading] = useState(false);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchQuery));

    if (filterLowStock) {
      return matchesSearch && p.currentStock <= p.minStock;
    }
    return matchesSearch;
  });

  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sku: sku || `SKU-${Date.now().toString().slice(-6)}`,
          barcode: barcode || `890${Math.floor(100000000 + Math.random() * 900000000)}`,
          unit,
          purchasePricePaisa: takaToPaisa(purchasePriceTaka),
          sellingPricePaisa: takaToPaisa(sellingPriceTaka),
          wholesalePricePaisa: takaToPaisa(wholesalePriceTaka || sellingPriceTaka),
          minStock: parseInt(minStock) || 5,
          currentStock: parseInt(currentStock) || 0,
        }),
      });

      setShowAddModal(false);
      setName("");
      setSku("");
      setBarcode("");
      setPurchasePriceTaka("");
      setSellingPriceTaka("");
      onRefreshData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">{t.products}</h3>
            <p className="text-xs text-slate-400">Total {products.length} Products Registered</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lowStockCount > 0 && (
            <button
              onClick={() => setFilterLowStock(!filterLowStock)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                filterLowStock
                  ? "bg-rose-500 text-white border-rose-500"
                  : "bg-rose-500/10 text-rose-300 border-rose-500/30"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                Low Stock ({lowStockCount})
              </span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder={t.searchProduct}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
        />
      </div>

      {/* Product Table / List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
        {filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No products matching criteria.
          </div>
        ) : (
          filteredProducts.map((p) => {
            const isLow = p.currentStock <= p.minStock;
            return (
              <div
                key={p.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/40 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-200 text-xs">{p.name}</h4>
                    {isLow && (
                      <span className="bg-rose-500/20 text-rose-300 text-[9px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 border border-rose-500/30">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Low
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono flex items-center gap-2">
                    <span>SKU: {p.sku}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5 text-slate-300">
                      <Barcode className="w-3 h-3 text-emerald-400" />
                      {p.barcode || "No Barcode"}
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 text-xs font-mono">
                  <div>
                    <p className="text-[10px] text-slate-400">Buy Price</p>
                    <p className="text-slate-300">{formatTaka(p.purchasePricePaisa, isBn)}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-400">Sell Price</p>
                    <p className="font-bold text-emerald-400">
                      {formatTaka(p.sellingPricePaisa, isBn)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">Stock</p>
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        isLow
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-slate-800 text-slate-200"
                      }`}
                    >
                      {p.currentStock} {p.unit}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Add New Product</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BRB Cable 2.5 RM"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Unit</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    {["Piece", "Kg", "Gram", "Box", "Liter", "Meter", "Feet", "Dozen", "Packet"].map(
                      (u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Barcode</label>
                  <input
                    type="text"
                    placeholder="Auto generated if empty"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Purchase Price (৳)</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={purchasePriceTaka}
                    onChange={(e) => setPurchasePriceTaka(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Selling Price (৳)</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={sellingPriceTaka}
                    onChange={(e) => setSellingPriceTaka(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Opening Stock Qty</label>
                  <input
                    type="number"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Min Stock Alert</label>
                  <input
                    type="number"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition"
                >
                  {loading ? "Saving..." : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
