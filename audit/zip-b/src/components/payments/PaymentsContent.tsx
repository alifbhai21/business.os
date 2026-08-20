"use client";

import { useEffect, useState, useCallback } from "react";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface Payment {
  id: number;
  type: string;
  customerId: number | null;
  customerName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  amount: number;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  paymentDate: string;
}

export function PaymentsContent() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/payments?${params}`);
      const json = await res.json();
      if (json.success) setPayments(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const totalIn = payments
    .filter((p) => p.type === "customer_payment")
    .reduce((s, p) => s + p.amount, 0);
  const totalOut = payments
    .filter((p) => p.type === "supplier_payment")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-xs text-emerald-600 font-medium">
            Customer Payments Received
          </p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {formatCurrency(totalIn)}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium">
            Supplier Payments Made
          </p>
          <p className="text-xl font-bold text-red-700 mt-1">
            {formatCurrency(totalOut)}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-600 font-medium">
            Total Transactions
          </p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {payments.length}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white">
          {[
            { label: "All", value: "" },
            { label: "Customer", value: "customer_payment" },
            { label: "Supplier", value: "supplier_payment" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setTypeFilter(tab.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                typeFilter === tab.value
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
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
                  Type
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Party
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Method
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Reference
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Notes
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">
                  Amount
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
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <CreditCard size={32} className="mx-auto mb-2 opacity-30" />
                    No payments found
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(p.paymentDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          p.type === "customer_payment" ? "success" : "info"
                        }
                      >
                        {p.type === "customer_payment"
                          ? "Customer"
                          : "Supplier"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {p.customerName ?? p.supplierName ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">
                      {p.paymentMethod}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.reference ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.notes ?? "-"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${
                        p.type === "customer_payment"
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {p.type === "customer_payment" ? "+" : "-"}
                      {formatCurrency(p.amount)}
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
