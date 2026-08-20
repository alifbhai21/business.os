"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Eye, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/constants";
import { NewSaleForm } from "@/components/sales/NewSaleForm";

interface Sale {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  saleDate: string;
}

interface SaleDetail extends Sale {
  items: Array<{
    id: number;
    productName: string | null;
    productUnit: string | null;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    lineTotal: number;
  }>;
  notes: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  customerAddress: string | null;
}

export function SalesContent() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewSale, setShowNewSale] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/sales?${params}`);
      const json = await res.json();
      if (json.success) setSales(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleViewSale = async (id: number) => {
    try {
      const res = await fetch(`/api/sales/${id}`);
      const json = await res.json();
      if (json.success) {
        setSelectedSale(json.data);
        setShowDetail(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = sales.filter(
    (s) =>
      s.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      s.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      s.customerPhone?.includes(search)
  );

  const paymentStatusVariant = (status: string) => {
    if (status === "paid") return "success";
    if (status === "partial") return "warning";
    return "danger";
  };

  const totalRevenue = filtered.reduce((s, x) => s + x.totalAmount, 0);
  const totalCollected = filtered.reduce((s, x) => s + x.paidAmount, 0);
  const totalDue = filtered.reduce((s, x) => s + x.dueAmount, 0);

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs text-blue-600 font-medium">Total Revenue</p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {formatCurrency(totalRevenue)}
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-xs text-emerald-600 font-medium">Collected</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {formatCurrency(totalCollected)}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium">Due</p>
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
            placeholder="Search invoice, customer..."
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
          onClick={() => setShowNewSale(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Sale
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
                  Customer
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
                <th className="text-left px-4 py-3 font-semibold text-slate-600">
                  Payment
                </th>
                <th className="px-4 py-3"></th>
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
                    <ShoppingCart
                      size={32}
                      className="mx-auto mb-2 opacity-30"
                    />
                    No sales found
                  </td>
                </tr>
              ) : (
                filtered.map((sale) => (
                  <tr
                    key={sale.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-blue-600">
                      {sale.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {sale.customerName ?? (
                        <span className="text-slate-400">Walk-in</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(sale.saleDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {formatCurrency(sale.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      {formatCurrency(sale.paidAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {sale.dueAmount > 0
                        ? formatCurrency(sale.dueAmount)
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          paymentStatusVariant(sale.paymentStatus) as
                            | "success"
                            | "warning"
                            | "danger"
                            | "info"
                            | "neutral"
                            | "purple"
                        }
                      >
                        {sale.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">
                      {sale.paymentMethod}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleViewSale(sale.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Sale Modal */}
      <Modal
        isOpen={showNewSale}
        onClose={() => setShowNewSale(false)}
        title="New Sale"
        size="xl"
      >
        <NewSaleForm
          onSuccess={() => {
            setShowNewSale(false);
            fetchSales();
          }}
          onCancel={() => setShowNewSale(false)}
        />
      </Modal>

      {/* Sale Detail Modal */}
      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={`Invoice: ${selectedSale?.invoiceNumber ?? ""}`}
        size="lg"
      >
        {selectedSale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">Customer</p>
                <p className="font-semibold text-slate-700">
                  {selectedSale.customerName ?? "Walk-in Customer"}
                </p>
                {selectedSale.customerPhone && (
                  <p className="text-sm text-slate-500">
                    {selectedSale.customerPhone}
                  </p>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">Sale Date</p>
                <p className="font-semibold text-slate-700">
                  {formatDateTime(selectedSale.saleDate)}
                </p>
                <p className="text-sm text-slate-500 capitalize">
                  {selectedSale.paymentMethod}
                </p>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
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
                </tr>
              </thead>
              <tbody>
                {selectedSale.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-50 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-700">
                      {item.productName}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {item.quantity} {item.productUnit}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-700">
                      {formatCurrency(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">
                  {formatCurrency(selectedSale.subtotal)}
                </span>
              </div>
              {selectedSale.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Discount</span>
                  <span className="text-red-600">
                    -{formatCurrency(selectedSale.discountAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2 mt-2">
                <span>Total</span>
                <span>{formatCurrency(selectedSale.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Paid</span>
                <span>{formatCurrency(selectedSale.paidAmount)}</span>
              </div>
              {selectedSale.dueAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Due</span>
                  <span>{formatCurrency(selectedSale.dueAmount)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              <Badge
                variant={
                  paymentStatusVariant(selectedSale.paymentStatus) as
                    | "success"
                    | "warning"
                    | "danger"
                    | "info"
                    | "neutral"
                    | "purple"
                }
                size="md"
              >
                {selectedSale.paymentStatus.toUpperCase()}
              </Badge>
              <button
                onClick={() => setShowDetail(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
