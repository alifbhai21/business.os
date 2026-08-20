"use client";

import React, { useState } from "react";
import { ShoppingBag, Plus, Search, DollarSign, Truck, X, Save, CheckCircle } from "lucide-react";
import { SupplierDTO, ProductDTO, AccountDTO } from "@/lib/types";
import { Language, translations } from "@/lib/i18n";
import { formatTaka, takaToPaisa } from "@/lib/currency";

interface PurchasesViewProps {
  lang: Language;
  suppliers: SupplierDTO[];
  products: ProductDTO[];
  accounts: AccountDTO[];
  activeShopId: string;
  onRefreshData: () => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  lang,
  suppliers,
  products,
  accounts,
  activeShopId,
  onRefreshData,
}) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState<SupplierDTO | null>(null);

  // Supplier Form
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supCompany, setSupCompany] = useState("");
  const [supOpeningPayableTaka, setSupOpeningPayableTaka] = useState("0");

  // Purchase Form
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [purchaseQty, setPurchaseQty] = useState("10");
  const [unitCostTaka, setUnitCostTaka] = useState("");
  const [paidAmountTaka, setPaidAmountTaka] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("Main Cash Box");
  const [loading, setLoading] = useState(false);

  // Settlement Form
  const [settleTaka, setSettleTaka] = useState("");

  const totalPayablePaisa = suppliers.reduce((sum, s) => sum + s.currentPayablePaisa, 0);

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/v1/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: activeShopId,
          name: supName,
          phone: supPhone,
          company: supCompany,
          openingBalancePaisa: takaToPaisa(supOpeningPayableTaka),
        }),
      });

      setShowAddSupplierModal(false);
      setSupName("");
      setSupPhone("");
      setSupCompany("");
      onRefreshData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const qty = parseInt(purchaseQty) || 1;
    const unitPricePaisa = takaToPaisa(unitCostTaka);
    const totalPaisa = qty * unitPricePaisa;
    const paidPaisa = paidAmountTaka !== "" ? takaToPaisa(paidAmountTaka) : totalPaisa;
    const duePaisa = Math.max(0, totalPaisa - paidPaisa);

    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    const prod = products.find((p) => p.id === selectedProductId);

    try {
      await fetch("/api/v1/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: activeShopId,
          supplierId: selectedSupplierId || null,
          supplierName: sup ? sup.name : "Direct Market Supplier",
          totalPaisa,
          paidPaisa,
          duePaisa,
          paymentAccount,
          items: prod
            ? [
                {
                  productId: prod.id,
                  productName: prod.name,
                  quantity: qty,
                  unitPricePaisa,
                  totalPaisa,
                },
              ]
            : [],
        }),
      });

      setShowNewPurchaseModal(false);
      setPurchaseQty("10");
      setUnitCostTaka("");
      setPaidAmountTaka("");
      onRefreshData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSettlePayable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPaymentModal) return;
    setLoading(true);

    try {
      await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: activeShopId,
          type: "supplier_payment",
          supplierId: showPaymentModal.id,
          amountPaisa: takaToPaisa(settleTaka),
          account: paymentAccount,
          note: "Supplier Debt Settlement",
        }),
      });

      setShowPaymentModal(null);
      setSettleTaka("");
      onRefreshData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs text-slate-400 font-medium">{t.totalPayables}</span>
          <p className="text-2xl font-extrabold text-rose-400 font-mono mt-0.5">
            {formatTaka(totalPayablePaisa, isBn)}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowAddSupplierModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition border border-slate-700"
          >
            <Plus className="w-4 h-4" />
            <span>{t.addSupplier}</span>
          </button>

          <button
            onClick={() => setShowNewPurchaseModal(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl transition shadow shadow-emerald-600/20"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{t.newPurchase}</span>
          </button>
        </div>
      </div>

      {/* Supplier List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
        {suppliers.map((s) => (
          <div
            key={s.id}
            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/40 transition"
          >
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-200 text-xs">{s.name}</h4>
                {s.company && (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    {s.company}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Phone: {s.phone}</p>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3">
              <div className="text-right">
                <p className="text-[10px] text-slate-400">Total Payable</p>
                <p className="font-bold text-rose-400 font-mono text-xs">
                  {formatTaka(s.currentPayablePaisa, isBn)}
                </p>
              </div>

              <button
                onClick={() => setShowPaymentModal(s)}
                className="p-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition"
              >
                Pay Supplier
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Supplier Modal */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Add New Supplier</h3>
              <button onClick={() => setShowAddSupplierModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSupplier} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Supplier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Berger Paints Bangladesh"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Company / Brand</label>
                <input
                  type="text"
                  placeholder="e.g. Berger / BRB Group"
                  value={supCompany}
                  onChange={(e) => setSupCompany(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 02-9881122"
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Opening Payable Debt (৳)</label>
                <input
                  type="number"
                  value={supOpeningPayableTaka}
                  onChange={(e) => setSupOpeningPayableTaka(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
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

      {/* New Purchase Modal */}
      {showNewPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Record Stock Purchase</h3>
              <button onClick={() => setShowNewPurchaseModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePurchase} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Select Supplier</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="">-- Direct Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.company})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Select Product</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const prod = products.find((p) => p.id === e.target.value);
                    if (prod) {
                      setUnitCostTaka((prod.purchasePricePaisa / 100).toString());
                    }
                  }}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current Stock: {p.currentStock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Unit Cost (৳)</label>
                  <input
                    type="number"
                    value={unitCostTaka}
                    onChange={(e) => setUnitCostTaka(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Paid Amount (৳)</label>
                  <input
                    type="number"
                    placeholder="Full paid if empty"
                    value={paidAmountTaka}
                    onChange={(e) => setPaidAmountTaka(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Account</label>
                  <select
                    value={paymentAccount}
                    onChange={(e) => setPaymentAccount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewPurchaseModal(false)}
                  className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition"
                >
                  {loading ? "Saving..." : "Record Purchase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Supplier Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                Pay Supplier: {showPaymentModal.name}
              </h3>
              <button onClick={() => setShowPaymentModal(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSettlePayable} className="p-5 space-y-3 text-xs">
              <div className="bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl flex justify-between font-medium">
                <span className="text-rose-300">Total Outstanding Debt:</span>
                <span className="text-rose-400 font-mono font-bold">
                  {formatTaka(showPaymentModal.currentPayablePaisa, isBn)}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Paid Amount (৳)</label>
                <input
                  type="number"
                  required
                  value={settleTaka}
                  onChange={(e) => setSettleTaka(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Payment Account</label>
                <select
                  value={paymentAccount}
                  onChange={(e) => setPaymentAccount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(null)}
                  className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition"
                >
                  {loading ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
