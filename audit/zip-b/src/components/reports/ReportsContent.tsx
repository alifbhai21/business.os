"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { formatCurrency, paisaToBDT } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

type ReportTab = "profit" | "sales" | "receivables" | "payables";

interface ProfitData {
  period: { from: string; to: string };
  sales: {
    totalRevenue: number;
    totalReceived: number;
    totalDue: number;
    count: number;
  };
  cogs: { totalCogs: number };
  expenses: {
    total: number;
    byCategory: Array<{
      category: string;
      total: number;
      count: number;
    }>;
  };
  purchases: { total: number; count: number };
  grossProfit: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
}

interface SalesData {
  period: { from: string; to: string };
  daily: Array<{ date: string; total: number; count: number }>;
  topProducts: Array<{
    productId: number;
    productName: string;
    totalQty: number;
    totalRevenue: number;
  }>;
  topCustomers: Array<{
    customerId: number;
    customerName: string;
    totalAmount: number;
    count: number;
  }>;
}

interface ReceivablesData {
  receivables: Array<{
    id: number;
    name: string;
    phone: string;
    currentDue: number;
    totalPurchases: number;
  }>;
  summary: { totalDue: number; count: number };
}

interface PayablesData {
  payables: Array<{
    id: number;
    name: string;
    phone: string;
    company: string;
    currentPayable: number;
    totalPurchases: number;
  }>;
  summary: { totalPayable: number; count: number };
}

const PIE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

export function ReportsContent() {
  const [tab, setTab] = useState<ReportTab>("profit");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const [profitData, setProfitData] = useState<ProfitData | null>(null);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [receivablesData, setReceivablesData] =
    useState<ReceivablesData | null>(null);
  const [payablesData, setPayablesData] = useState<PayablesData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async (reportType: ReportTab) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: reportType,
        from: dateFrom,
        to: dateTo,
      });
      const res = await fetch(`/api/reports?${params}`);
      const json = await res.json();
      if (json.success) {
        if (reportType === "profit") setProfitData(json.data);
        if (reportType === "sales") setSalesData(json.data);
        if (reportType === "receivables") setReceivablesData(json.data);
        if (reportType === "payables") setPayablesData(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(tab);
  }, [tab, dateFrom, dateTo]);

  const getCatLabel = (val: string) =>
    EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val;

  return (
    <div className="p-6 space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white">
          {(
            [
              { label: "Profit & Loss", value: "profit" },
              { label: "Sales", value: "sales" },
              { label: "Receivables", value: "receivables" },
              { label: "Payables", value: "payables" },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.value
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(tab === "profit" || tab === "sales") && (
          <>
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
          </>
        )}
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-400">
          Loading report...
        </div>
      )}

      {/* Profit & Loss Report */}
      {!loading && tab === "profit" && profitData && (
        <div className="space-y-5">
          {/* P&L Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <p className="text-xs text-blue-600 font-medium">
                Total Revenue
              </p>
              <p className="text-2xl font-bold text-blue-700 mt-1">
                {formatCurrency(profitData.sales.totalRevenue)}
              </p>
              <p className="text-xs text-blue-500 mt-1">
                {profitData.sales.count} sales
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <p className="text-xs text-orange-600 font-medium">
                Cost of Goods Sold
              </p>
              <p className="text-2xl font-bold text-orange-700 mt-1">
                {formatCurrency(profitData.cogs.totalCogs)}
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
              <p className="text-xs text-emerald-600 font-medium">
                Gross Profit
              </p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                {formatCurrency(profitData.grossProfit)}
              </p>
              <p className="text-xs text-emerald-500 mt-1">
                {profitData.grossMargin}% margin
              </p>
            </div>
            <div
              className={`border rounded-2xl p-5 ${
                profitData.netProfit >= 0
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <p
                className={`text-xs font-medium ${
                  profitData.netProfit >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                Net Profit
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  profitData.netProfit >= 0
                    ? "text-green-700"
                    : "text-red-700"
                }`}
              >
                {formatCurrency(profitData.netProfit)}
              </p>
              <p
                className={`text-xs mt-1 ${
                  profitData.netProfit >= 0
                    ? "text-green-500"
                    : "text-red-500"
                }`}
              >
                {profitData.netMargin}% margin
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* P&L Statement */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-800 mb-4">
                P&L Statement
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-700">Sales Revenue</span>
                  <span className="text-blue-600">
                    + {formatCurrency(profitData.sales.totalRevenue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cost of Goods Sold</span>
                  <span className="text-red-500">
                    - {formatCurrency(profitData.cogs.totalCogs)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold border-t border-slate-200 pt-2 mt-2">
                  <span>Gross Profit</span>
                  <span className="text-emerald-600">
                    {formatCurrency(profitData.grossProfit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Operating Expenses</span>
                  <span className="text-red-500">
                    - {formatCurrency(profitData.expenses.total)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2 mt-2">
                  <span>Net Profit</span>
                  <span
                    className={
                      profitData.netProfit >= 0
                        ? "text-emerald-700"
                        : "text-red-700"
                    }
                  >
                    {formatCurrency(profitData.netProfit)}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-2">Cash collected</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Received from Sales</span>
                  <span className="text-emerald-600">
                    {formatCurrency(profitData.sales.totalReceived)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Outstanding Receivable</span>
                  <span className="text-orange-600">
                    {formatCurrency(profitData.sales.totalDue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Expenses by Category */}
            {profitData.expenses.byCategory.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-800 mb-4">
                  Expenses by Category
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={profitData.expenses.byCategory.map((c) => ({
                        name: getCatLabel(c.category),
                        value: paisaToBDT(c.total),
                      }))}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                    >
                      {profitData.expenses.byCategory.map((_, index) => (
                        <Cell
                          key={index}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Legend
                      formatter={(v) => (
                        <span className="text-xs text-slate-600">{v}</span>
                      )}
                    />
                    <Tooltip
                      formatter={(v) => [`৳${Number(v).toLocaleString()}`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales Report */}
      {!loading && tab === "sales" && salesData && (
        <div className="space-y-5">
          {/* Daily chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-4">
              Daily Sales Trend
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={salesData.daily.map((d) => ({
                  date: new Date(d.date).toLocaleDateString("en-BD", {
                    month: "short",
                    day: "numeric",
                  }),
                  sales: paisaToBDT(d.total),
                  count: d.count,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v) => [`৳${Number(v).toLocaleString()}`, "Sales"]}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Bar
                  dataKey="sales"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-800 mb-4">
                Top Products by Revenue
              </h3>
              <div className="space-y-3">
                {salesData.topProducts.slice(0, 8).map((p, i) => (
                  <div key={p.productId} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {p.productName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {p.totalQty} units sold
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 shrink-0">
                      {formatCurrency(p.totalRevenue)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Customers */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-800 mb-4">
                Top Customers by Purchase
              </h3>
              <div className="space-y-3">
                {salesData.topCustomers.slice(0, 8).map((c, i) => (
                  <div key={c.customerId} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {c.customerName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {c.count} orders
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 shrink-0">
                      {formatCurrency(c.totalAmount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receivables */}
      {!loading && tab === "receivables" && receivablesData && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <p className="text-xs text-red-600 font-medium">
                Total Receivable
              </p>
              <p className="text-2xl font-bold text-red-700 mt-1">
                {formatCurrency(receivablesData.summary.totalDue)}
              </p>
              <p className="text-xs text-red-500 mt-1">
                {receivablesData.summary.count} customers with due
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center">
              <p className="text-sm text-slate-500">
                Customer dues sorted by amount. Collect outstanding dues to
                improve cash flow.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
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
                    Due Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {receivablesData.receivables.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-50 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {r.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.phone}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(r.totalPurchases)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      {formatCurrency(r.currentDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payables */}
      {!loading && tab === "payables" && payablesData && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <p className="text-xs text-orange-600 font-medium">
                Total Payable
              </p>
              <p className="text-2xl font-bold text-orange-700 mt-1">
                {formatCurrency(payablesData.summary.totalPayable)}
              </p>
              <p className="text-xs text-orange-500 mt-1">
                {payablesData.summary.count} suppliers with due
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center">
              <p className="text-sm text-slate-500">
                Outstanding amounts owed to suppliers. Pay on time to maintain
                good relationships.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">
                    Supplier
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">
                    Company
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">
                    Phone
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">
                    Total Purchases
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">
                    Payable Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {payablesData.payables.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.company ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.phone}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(p.totalPurchases)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-orange-600">
                      {formatCurrency(p.currentPayable)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
