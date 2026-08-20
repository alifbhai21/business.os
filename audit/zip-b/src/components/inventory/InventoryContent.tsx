"use client";

import { useEffect, useState } from "react";
import { Boxes, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/format";

interface InventoryItem {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  currentStock: number;
  minStock: number;
  avgCost: number;
  sellingPrice: number;
  stockValue: number;
  potentialRevenue: number;
}

interface Summary {
  totalProducts: number;
  totalStockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export function InventoryContent() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");

  useEffect(() => {
    const fetchInventory = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/reports?type=inventory");
        const json = await res.json();
        if (json.success) {
          setInventory(json.data.inventory);
          setSummary(json.data.summary);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchInventory();
  }, []);

  const filtered = inventory.filter((item) => {
    if (filter === "low")
      return item.currentStock <= item.minStock && item.minStock > 0;
    if (filter === "out") return item.currentStock === 0;
    return true;
  });

  const totalPotential = filtered.reduce(
    (sum, i) => sum + i.potentialRevenue,
    0
  );
  const totalValue = filtered.reduce((sum, i) => sum + i.stockValue, 0);

  const stockStatus = (item: InventoryItem) => {
    if (item.currentStock === 0) return "danger";
    if (item.minStock > 0 && item.currentStock <= item.minStock)
      return "warning";
    return "success";
  };

  return (
    <div className="p-6 space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-600 font-medium">Total Products</p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {summary?.totalProducts ?? 0}
          </p>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
          <p className="text-xs text-teal-600 font-medium">Stock Value (Cost)</p>
          <p className="text-xl font-bold text-teal-700 mt-1">
            {formatCurrency(summary?.totalStockValue ?? 0)}
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="text-xs text-orange-600 font-medium">Low Stock</p>
          <p className="text-xl font-bold text-orange-700 mt-1">
            {summary?.lowStockCount ?? 0} items
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium">Out of Stock</p>
          <p className="text-xl font-bold text-red-700 mt-1">
            {summary?.outOfStockCount ?? 0} items
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white">
          {[
            { label: "All Products", value: "all" as const },
            {
              label: `Low Stock (${summary?.lowStockCount ?? 0})`,
              value: "low" as const,
            },
            {
              label: `Out of Stock (${summary?.outOfStockCount ?? 0})`,
              value: "out" as const,
            },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                filter === tab.value
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.value === "low" && (
                <AlertTriangle
                  size={13}
                  className={
                    filter === tab.value ? "text-white" : "text-orange-500"
                  }
                />
              )}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="text-sm text-slate-500">
          Stock Value:{" "}
          <span className="font-semibold text-slate-700">
            {formatCurrency(totalValue)}
          </span>
          {" · "}Retail Value:{" "}
          <span className="font-semibold text-emerald-700">
            {formatCurrency(totalPotential)}
          </span>
        </div>
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
                  SKU
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  In Stock
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Min Stock
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Avg Cost
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Sell Price
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Stock Value
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Potential Revenue
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <Boxes size={32} className="mx-auto mb-2 opacity-30" />
                    No items found
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                      item.currentStock === 0 ? "bg-red-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                      {item.sku ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-bold ${
                          item.currentStock === 0
                            ? "text-red-600"
                            : item.currentStock <= item.minStock
                              ? "text-orange-600"
                              : "text-slate-700"
                        }`}
                      >
                        {item.currentStock} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {item.minStock > 0 ? `${item.minStock} ${item.unit}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(item.avgCost)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(item.sellingPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {formatCurrency(item.stockValue)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                      {formatCurrency(item.potentialRevenue)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          stockStatus(item) as
                            | "success"
                            | "warning"
                            | "danger"
                            | "info"
                            | "neutral"
                            | "purple"
                        }
                      >
                        {item.currentStock === 0
                          ? "Out of Stock"
                          : item.minStock > 0 &&
                              item.currentStock <= item.minStock
                            ? "Low Stock"
                            : "In Stock"}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
