"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, TrendingUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/constants";

interface Purchase {
  id: number;
  invoiceNumber: string;
  supplierName: string | null;
  supplierPhone: string | null;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  purchaseDate: string;
}

interface Supplier {
  id: number;
  name: string;
  phone: string | null;
}

interface Product {
  id: number;
  name: string;
  purchasePrice: number;
  currentStock: number;
  unit: string;
}

interface CartItem {
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export function PurchasesContent() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Form state
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/purchases?${params}`);
      const json = await res.json();
      if (json.success) setPurchases(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((d) => setSuppliers(d.data ?? []));
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.data ?? []));
  }, []);

  const filteredPurchases = purchases.filter(
    (p) =>
      p.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      p.supplierName?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addToCart = (product: Product) => {
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          quantity: 1,
          unitPrice: product.purchasePrice / 100,
        },
      ]);
    }
    setProductSearch("");
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter((c) => c.productId !== productId));
  };

  const subtotal = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const paidVal = parseFloat(paidAmount) || 0;
  const dueAmount = Math.max(0, subtotal - paidVal);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      setError("Add at least one product");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: 0,
          })),
          discountAmount: 0,
          taxAmount: 0,
          paidAmount: paidVal,
          paymentMethod,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setCart([]);
        setSupplierId(null);
        setPaidAmount("");
        setNotes("");
        fetchPurchases();
      } else {
        setError("Failed to create purchase");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = filteredPurchases.reduce(
    (s, p) => s + p.totalAmount,
    0
  );
  const totalDue = filteredPurchases.reduce((s, p) => s + p.dueAmount, 0);

  const statusVariant = (status: string) => {
    if (status === "paid") return "success";
    if (status === "partial") return "warning";
    return "danger";
  };

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
          <p className="text-xs text-purple-600 font-medium">Total Purchases</p>
          <p className="text-xl font-bold text-purple-700 mt-1">
            {formatCurrency(totalAmount)}
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-xs text-emerald-600 font-medium">Paid</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {formatCurrency(totalAmount - totalDue)}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium">Outstanding Payable</p>
          <p className="text-xl font-bold text-red-700 mt-1">
            {formatCurrency(totalDue)}
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
            placeholder="Search invoice, supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <span className="text-slate-400 text-sm">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <button
          onClick={() => {
            setCart([]);
            setSupplierId(null);
            setPaidAmount("");
            setNotes("");
            setError("");
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Purchase
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Invoice
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Supplier
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Date
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Total
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Paid
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Due
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                    No purchases found
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-purple-600">
                      {p.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {p.supplierName ?? (
                        <span className="text-slate-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(p.purchaseDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {formatCurrency(p.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      {formatCurrency(p.paidAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {p.dueAmount > 0 ? formatCurrency(p.dueAmount) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          statusVariant(p.paymentStatus) as
                            | "success"
                            | "warning"
                            | "danger"
                            | "info"
                            | "neutral"
                            | "purple"
                        }
                      >
                        {p.paymentStatus}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Purchase Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="New Purchase"
        size="xl"
      >
        <div className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">
                Search & Add Products
              </label>
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Search product..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {productSearch && (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-white shadow-lg">
                  {filteredProducts.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="flex justify-between">
                        <p className="text-sm font-medium text-slate-700">
                          {p.name}
                        </p>
                        <p className="text-sm text-blue-600">
                          {formatCurrency(p.purchasePrice)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">
                Supplier
              </label>
              <select
                value={supplierId ?? ""}
                onChange={(e) =>
                  setSupplierId(
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">No supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {cart.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">
                      Product
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-600">
                      Qty
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-600">
                      Price
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-600">
                      Total
                    </th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr
                      key={item.productId}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="px-3 py-2 text-slate-700">
                        {item.productName}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            setCart(
                              cart.map((c) =>
                                c.productId === item.productId
                                  ? {
                                      ...c,
                                      quantity: parseInt(e.target.value) || 1,
                                    }
                                  : c
                              )
                            )
                          }
                          className="w-16 text-right px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) =>
                            setCart(
                              cart.map((c) =>
                                c.productId === item.productId
                                  ? {
                                      ...c,
                                      unitPrice:
                                        parseFloat(e.target.value) || 0,
                                    }
                                  : c
                              )
                            )
                          }
                          className="w-24 text-right px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-700">
                        ৳{(item.quantity * item.unitPrice).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-slate-700">Summary</h3>
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>৳{subtotal.toFixed(2)}</span>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Paid Amount (৳)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Max: ৳${subtotal.toFixed(2)}`}
                />
              </div>
              {dueAmount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex justify-between text-sm">
                  <span className="text-red-600">Due Amount</span>
                  <span className="font-bold text-red-700">
                    ৳{dueAmount.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || cart.length === 0}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Purchase"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
