"use client";

import React, { useState } from "react";
import { Receipt, Plus, Search, DollarSign, X, Save } from "lucide-react";
import { ExpenseDTO, AccountDTO, ExpenseCategory } from "@/lib/types";
import { Language, translations } from "@/lib/i18n";
import { formatTaka, takaToPaisa } from "@/lib/currency";

interface ExpensesViewProps {
  lang: Language;
  expenses: ExpenseDTO[];
  accounts: AccountDTO[];
  activeShopId: string;
  onRefreshData: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  lang,
  expenses,
  accounts,
  activeShopId,
  onRefreshData,
}) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  const [showAddModal, setShowAddModal] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>("Rent");
  const [amountTaka, setAmountTaka] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("Main Cash Box");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const totalExpensePaisa = expenses.reduce((sum, e) => sum + e.amountPaisa, 0);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: activeShopId,
          category,
          amountPaisa: takaToPaisa(amountTaka),
          paymentAccount,
          note,
        }),
      });

      setShowAddModal(false);
      setAmountTaka("");
      setNote("");
      onRefreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs text-slate-400 font-medium">Total Shop Expenses</span>
          <p className="text-2xl font-extrabold text-rose-400 font-mono mt-0.5">
            {formatTaka(totalExpensePaisa, isBn)}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl transition shadow shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>{t.addExpense}</span>
        </button>
      </div>

      {/* Expenses Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
        {expenses.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No expenses recorded yet.
          </div>
        ) : (
          expenses.map((exp) => (
            <div
              key={exp.id}
              className="p-3.5 flex items-center justify-between hover:bg-slate-800/40 transition"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-xs">{exp.category}</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    {exp.paymentAccount}
                  </span>
                </div>
                {exp.note && <p className="text-[11px] text-slate-400 mt-0.5">{exp.note}</p>}
                <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                  {new Date(exp.createdAt).toLocaleString()}
                </p>
              </div>

              <p className="font-bold text-rose-400 font-mono text-xs">
                -{formatTaka(exp.amountPaisa, isBn)}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="font-semibold text-sm">{t.addExpense}</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Expense Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  {["Rent", "Salary", "Electricity", "Internet", "Transport", "Maintenance", "Marketing", "Packaging", "Office expense", "Other"].map(
                    (cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Amount (৳)</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={amountTaka}
                  onChange={(e) => setAmountTaka(e.target.value)}
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

              <div>
                <label className="block text-slate-400 mb-1">Note / Description</label>
                <input
                  type="text"
                  placeholder="e.g. Shop rent for March 2026"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
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
