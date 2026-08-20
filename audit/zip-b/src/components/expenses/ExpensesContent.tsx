"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, FileText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/format";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/constants";

interface Expense {
  id: number;
  category: string;
  amount: number;
  paymentMethod: string;
  description: string | null;
  expenseDate: string;
}

export function ExpensesContent() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);

  const [form, setForm] = useState({
    category: "other",
    amount: "",
    paymentMethod: "cash",
    description: "",
    expenseDate: new Date().toISOString().split("T")[0],
  });

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/expenses?${params}`);
      const json = await res.json();
      if (json.success) {
        setExpenses(json.data);
        setTotalAmount(json.meta?.totalAmount ?? 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError("Amount is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          amount: parseFloat(form.amount),
          paymentMethod: form.paymentMethod,
          description: form.description || null,
          expenseDate: form.expenseDate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setForm({
          category: "other",
          amount: "",
          paymentMethod: "cash",
          description: "",
          expenseDate: new Date().toISOString().split("T")[0],
        });
        fetchExpenses();
      } else {
        setError("Failed to record expense");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // Group by category for summary
  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  const getCategoryLabel = (val: string) =>
    EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val;

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
          <p className="text-xs text-yellow-700 font-medium">Total Expenses</p>
          <p className="text-xl font-bold text-yellow-700 mt-1">
            {formatCurrency(totalAmount)}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-600 font-medium">Transactions</p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {expenses.length}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 col-span-2">
          <p className="text-xs text-purple-600 font-medium mb-2">
            Top Categories
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byCategory)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([cat, amt]) => (
                <span
                  key={cat}
                  className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-lg font-medium"
                >
                  {getCategoryLabel(cat)}: {formatCurrency(amt)}
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
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
        <div className="flex-1" />
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Expense
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Date
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Category
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Description
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Payment
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    No expenses recorded
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(e.expenseDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium capitalize">
                        {getCategoryLabel(e.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {e.description ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">
                      {e.paymentMethod}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {formatCurrency(e.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td
                    colSpan={4}
                    className="px-4 py-3 font-semibold text-slate-700"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">
                    {formatCurrency(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add Expense"
        size="sm"
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Category *
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Amount (৳) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Date
            </label>
            <input
              type="date"
              value={form.expenseDate}
              onChange={(e) =>
                setForm({ ...form, expenseDate: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Payment Method
            </label>
            <select
              value={form.paymentMethod}
              onChange={(e) =>
                setForm({ ...form, paymentMethod: e.target.value })
              }
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
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="e.g. Monthly shop rent"
            />
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
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Add Expense"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
