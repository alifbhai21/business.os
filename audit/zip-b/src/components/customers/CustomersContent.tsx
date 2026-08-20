"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Users, Phone, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/constants";

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  customerCode: string | null;
  openingBalance: number;
  creditLimit: number;
  totalPurchases: number;
  totalPaid: number;
  currentDue: number;
  isActive: boolean;
  createdAt: string;
}

interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  customerCode: string;
  openingBalance: string;
  creditLimit: string;
}

const defaultForm: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  customerCode: "",
  openingBalance: "0",
  creditLimit: "0",
};

export function CustomersContent() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [form, setForm] = useState<CustomerForm>(defaultForm);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (showDueOnly) params.set("withDue", "true");
      const res = await fetch(`/api/customers?${params}`);
      const json = await res.json();
      if (json.success) setCustomers(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, showDueOnly]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleCreate = async () => {
    if (!form.name) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          customerCode: form.customerCode || null,
          openingBalance: parseFloat(form.openingBalance) || 0,
          creditLimit: parseFloat(form.creditLimit) || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        fetchCustomers();
      } else {
        setError("Failed to create customer");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedCustomer || !paymentAmount) {
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
          type: "customer_payment",
          customerId: selectedCustomer.id,
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
        fetchCustomers();
      } else {
        setError("Failed to record payment");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const totalDue = customers.reduce((sum, c) => sum + c.currentDue, 0);
  const totalCustomers = customers.length;
  const customersWithDue = customers.filter((c) => c.currentDue > 0).length;

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-600 font-medium">Total Customers</p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {totalCustomers}
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="text-xs text-orange-600 font-medium">
            Customers with Due
          </p>
          <p className="text-xl font-bold text-orange-700 mt-1">
            {customersWithDue}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium">Total Receivable</p>
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
            placeholder="Search name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <button
          onClick={() => setShowDueOnly(!showDueOnly)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
            showDueOnly
              ? "bg-red-100 text-red-700 border border-red-200"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <CreditCard size={14} />
          With Due Only
        </button>
        <button
          onClick={() => {
            setForm(defaultForm);
            setError("");
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Customer
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Phone
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Total Purchases
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Total Paid
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Due (বাকি)
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Member Since
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    No customers found
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700">{c.name}</p>
                      {c.customerCode && (
                        <p className="text-xs text-slate-400">
                          #{c.customerCode}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <span className="flex items-center gap-1.5">
                        {c.phone ? (
                          <>
                            <Phone size={12} />
                            {c.phone}
                          </>
                        ) : (
                          "-"
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(c.totalPurchases + c.openingBalance)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      {formatCurrency(c.totalPaid)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.currentDue > 0 ? (
                        <span className="font-bold text-red-600">
                          {formatCurrency(c.currentDue)}
                        </span>
                      ) : (
                        <Badge variant="success">Cleared</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {c.currentDue > 0 && (
                        <button
                          onClick={() => {
                            setSelectedCustomer(c);
                            setPaymentAmount("");
                            setPaymentNotes("");
                            setError("");
                            setShowPayment(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium transition-colors"
                        >
                          <CreditCard size={12} />
                          Collect
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

      {/* Add Customer Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add New Customer"
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
              Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Customer name"
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
                Customer Code
              </label>
              <input
                type="text"
                value={form.customerCode}
                onChange={(e) =>
                  setForm({ ...form, customerCode: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="CUST-001"
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Opening Balance (৳)
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
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Credit Limit (৳)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.creditLimit}
                onChange={(e) =>
                  setForm({ ...form, creditLimit: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              onClick={handleCreate}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Add Customer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        title={`Collect Payment — ${selectedCustomer?.name ?? ""}`}
        size="sm"
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
          {selectedCustomer && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-red-500 font-medium">Current Due</p>
              <p className="text-2xl font-bold text-red-700">
                {formatCurrency(selectedCustomer.currentDue)}
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
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Record Payment"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
