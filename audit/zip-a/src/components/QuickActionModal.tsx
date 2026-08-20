"use client";

import React, { useState } from "react";
import {
  X,
  ShoppingCart,
  ShoppingBag,
  UserCheck,
  Truck,
  Receipt,
  ArrowLeftRight,
  PlusCircle,
  Save,
} from "lucide-react";
import { Language, translations } from "@/lib/i18n";
import { CustomerDTO, SupplierDTO, AccountDTO, ShopDTO, ProductDTO } from "@/lib/types";
import { takaToPaisa } from "@/lib/currency";

interface QuickActionModalProps {
  actionType: "sale" | "purchase" | "customer_payment" | "supplier_payment" | "expense" | "transfer" | null;
  onClose: () => void;
  lang: Language;
  customers: CustomerDTO[];
  suppliers: SupplierDTO[];
  accounts: AccountDTO[];
  shops: ShopDTO[];
  products: ProductDTO[];
  activeShopId: string;
  onRefreshData: () => void;
}

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
  actionType,
  onClose,
  lang,
  customers,
  suppliers,
  accounts,
  shops,
  products,
  activeShopId,
  onRefreshData,
}) => {
  if (!actionType) return null;
  const t = translations[lang];

  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [amountTaka, setAmountTaka] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("Main Cash Box");
  const [expenseCategory, setExpenseCategory] = useState("Rent");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // Transfer states
  const [selectedProductId, setSelectedProductId] = useState("");
  const [destShopId, setDestShopId] = useState("");
  const [transferQty, setTransferQty] = useState("1");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (actionType === "customer_payment") {
        await fetch("/api/v1/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId: activeShopId,
            type: "customer_payment",
            customerId: selectedCustomerId,
            amountPaisa: takaToPaisa(amountTaka),
            account: paymentAccount,
            note: notes || "Quick Due Collection",
          }),
        });
      } else if (actionType === "supplier_payment") {
        await fetch("/api/v1/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId: activeShopId,
            type: "supplier_payment",
            supplierId: selectedSupplierId,
            amountPaisa: takaToPaisa(amountTaka),
            account: paymentAccount,
            note: notes || "Quick Supplier Payment",
          }),
        });
      } else if (actionType === "expense") {
        await fetch("/api/v1/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId: activeShopId,
            category: expenseCategory,
            amountPaisa: takaToPaisa(amountTaka),
            paymentAccount,
            note: notes,
          }),
        });
      } else if (actionType === "transfer") {
        await fetch("/api/v1/transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceShopId: activeShopId,
            destShopId,
            productId: selectedProductId,
            quantity: parseInt(transferQty) || 1,
            notes,
          }),
        });
      }

      onRefreshData();
      onClose();
    } catch (err) {
      console.error("Quick action error", err);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (actionType) {
      case "customer_payment":
        return t.customerPayment;
      case "supplier_payment":
        return t.supplierPayment;
      case "expense":
        return t.addExpense;
      case "transfer":
        return t.stockTransfer;
      default:
        return "Quick Entry";
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <PlusCircle className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm">{getTitle()}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {actionType === "customer_payment" && (
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Select Customer</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              >
                <option value="">-- Choose Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Due: ৳{(c.currentDuePaisa / 100).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {actionType === "supplier_payment" && (
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Select Supplier</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.company}) - Debt: ৳{(s.currentPayablePaisa / 100).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {actionType === "expense" && (
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Expense Category</label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              >
                {["Rent", "Salary", "Electricity", "Internet", "Transport", "Maintenance", "Marketing", "Packaging", "Office expense", "Other"].map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {actionType === "transfer" && (
            <>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Select Product</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="">-- Select Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Available Stock: {p.currentStock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Destination Branch</label>
                <select
                  value={destShopId}
                  onChange={(e) => setDestShopId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="">-- Select Branch --</option>
                  {shops
                    .filter((s) => s.id !== activeShopId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.branchCode})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium"
                />
              </div>
            </>
          )}

          {actionType !== "transfer" && (
            <>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Amount in Taka (৳)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={amountTaka}
                  onChange={(e) => setAmountTaka(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-semibold text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Payment Account</label>
                <select
                  value={paymentAccount}
                  onChange={(e) => setPaymentAccount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name} (Bal: ৳{(a.currentBalancePaisa / 100).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Notes / Details</label>
            <input
              type="text"
              placeholder="e.g. Received via bKash / DESCO bill..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
            />
          </div>

          <div className="pt-3 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 rounded-xl transition"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition shadow flex items-center justify-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? "Saving..." : t.save}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
