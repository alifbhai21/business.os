"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Truck, Phone, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/constants";

interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  company: string | null;
  openingBalance: number;
  totalPurchases: number;
  totalPaid: number;
  currentPayable: number;
  isActive: boolean;
  createdAt: string;
}

interface SupplierForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  company: string;
  openingBalance: string;
}

const defaultForm: SupplierForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  company: "",
  openingBalance: "0",
};

export function SuppliersContent() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null
  );
  const [form, setForm] = useState<SupplierForm>(defaultForm);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/suppliers?${params}`);
      const json = await res.json();
      if (json.success) setSuppliers(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleCreate = async () => {
    if (!form.name) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          company: form.company || null,
          openingBalance: parseFloat(form.openingBalance) || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        fetchSuppliers();
      } else {
        setError("Failed to create supplier");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedSupplier || !paymentAmount) {
      setError("Amount is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "supplier_payment",
          supplierId: selectedSupplier.id,
          amount: parseFloat(paymentAmount),
          paymentMethod,
          notes: paymentNotes || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowPayment(false);
        setPaymentAmount("");
        setPaymentNotes("");
        fetchSuppliers();
      } else {
        setError("Failed to record payment");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPayable = suppliers.reduce(
    (sum, s) => sum + s.currentPayable,
    0
  );

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-600 font-medium">Total Suppliers</p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {suppliers.length}
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="text-xs text-orange-600 font-medium">
            Suppliers with Due
          </p>
          <p className="text-xl font-bold text-orange-700 mt-1">
            {suppliers.filter((s) => s.currentPayable > 0).length}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium">Total Payable</p>
          <p className="text-xl font-bold text-red-700 mt-1">
            {formatCurrency(totalPayable)}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <button
          onClick={() => {
            setForm(defaultForm);
            setError("");
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Supplier
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Supplier
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Phone
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Company
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Total Purchases
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Total Paid
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Payable
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Added
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <Truck size={32} className="mx-auto mb-2 opacity-30" />
                    No suppliers found
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700">{s.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <span className="flex items-center gap-1.5">
                        {s.phone ? (
                          <>
                            <Phone size={12} />
                            {s.phone}
                          </>
                        ) : (
                          "-"
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {s.company ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(
                        s.totalPurchases + s.openingBalance
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      {formatCurrency(s.totalPaid)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.currentPayable > 0 ? (
                        <span className="font-bold text-red-600">
                          {formatCurrency(s.currentPayable)}
                        </span>
                      ) : (
                        <Badge variant="success">Cleared</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {s.currentPayable > 0 && (
                        <button
                          onClick={() => {
                            setSelectedSupplier(s);
                            setPaymentAmount("");
                            setPaymentNotes("");
                            setError("");
                            setShowPayment(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors"
                        >
                          <CreditCard size={12} />
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Supplier Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add New Supplier"
        size="md"
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Supplier Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Supplier name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+880..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Company
              </label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Company name"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Address
            </label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Opening Balance / Existing Due (৳)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.openingBalance}
              onChange={(e) =>
                setForm({ ...form, openingBalance: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              onClick={handleCreate}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Add Supplier"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        title={`Pay Supplier — ${selectedSupplier?.name ?? ""}`}
        size="sm"
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
          {selectedSupplier && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-xs text-orange-500 font-medium">
                Current Payable
              </p>
              <p className="text-2xl font-bold text-orange-700">
                {formatCurrency(selectedSupplier.currentPayable)}
              </p>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Payment Amount (৳) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
              placeholder="0.00"
            />
          </div>
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
            <input
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowPayment(false)}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePayment}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Record Payment"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
