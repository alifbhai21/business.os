"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Package,
  Users,
  Truck,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate, paisaToBDT } from "@/lib/format";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";

interface DashboardData {
  today: {
    sales: { count: number; total: number; paid: number };
    purchases: { count: number; total: number };
    expenses: { total: number };
  };
  monthly: {
    sales: { total: number; paid: number; count: number };
    purchases: { total: number; count: number };
    expenses: { total: number };
    grossProfit: number;
    netProfit: number;
  };
  totals: {
    receivable: number;
    payable: number;
    stockValue: number;
    totalProducts: number;
  };
  charts: {
    dailySales: Array<{ date: string; total: number; count: number }>;
  };
  lists: {
    lowStockProducts: Array<{
      id: number;
      name: string;
      currentStock: number;
      minStock: number;
      unit: string;
    }>;
    recentSales: Array<{
      id: number;
      invoiceNumber: string;
      totalAmount: number;
      paymentStatus: string;
      saleDate: string;
    }>;
    topDueCustomers: Array<{
      id: number;
      name: string;
      phone: string;
      currentDue: number;
    }>;
  };
}

export function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
          <p className="text-slate-500 mb-4">
            No data yet. Load sample data to get started.
          </p>
          <button
            onClick={async () => {
              await fetch("/api/seed", { method: "POST" });
              window.location.reload();
            }}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Load Sample Data
          </button>
        </div>
      </div>
    );
  }

  const chartData = data.charts.dailySales.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-BD", {
      month: "short",
      day: "numeric",
    }),
    sales: paisaToBDT(d.total),
    count: d.count,
  }));

  const paymentStatusVariant = (status: string) => {
    if (status === "paid") return "success";
    if (status === "partial") return "warning";
    return "danger";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Sales"
          value={formatCurrency(data.today.sales.total)}
          subtitle={`${data.today.sales.count} transactions`}
          icon={<ShoppingCart size={20} />}
          color="blue"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(data.monthly.sales.total)}
          subtitle={`${data.monthly.sales.count} sales`}
          icon={<TrendingUp size={20} />}
          color="teal"
        />
        <StatCard
          title="Net Profit (Month)"
          value={formatCurrency(data.monthly.netProfit)}
          subtitle={`Gross: ${formatCurrency(data.monthly.grossProfit)}`}
          icon={<DollarSign size={20} />}
          color={data.monthly.netProfit >= 0 ? "green" : "red"}
        />
        <StatCard
          title="Today's Purchases"
          value={formatCurrency(data.today.purchases.total)}
          subtitle={`${data.today.purchases.count} orders`}
          icon={<Package size={20} />}
          color="purple"
        />
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Customer Receivables"
          value={formatCurrency(data.totals.receivable)}
          subtitle="Total outstanding dues"
          icon={<Users size={20} />}
          color="orange"
        />
        <StatCard
          title="Supplier Payables"
          value={formatCurrency(data.totals.payable)}
          subtitle="Total due to suppliers"
          icon={<Truck size={20} />}
          color="red"
        />
        <StatCard
          title="Stock Value"
          value={formatCurrency(data.totals.stockValue)}
          subtitle={`${data.totals.totalProducts} active products`}
          icon={<Boxes size={20} />}
          color="teal"
        />
        <StatCard
          title="Monthly Expenses"
          value={formatCurrency(data.monthly.expenses.total)}
          subtitle="Operating costs"
          icon={<DollarSign size={20} />}
          color="yellow"
        />
      </div>

      {/* Charts & Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">
                Sales (Last 7 Days)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Daily revenue in BDT
              </p>
            </div>
            <Link
              href="/reports"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              View reports <ArrowUpRight size={12} />
            </Link>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                formatter={(value) => [
                  `৳${Number(value).toLocaleString()}`,
                  "Sales",
                ]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fill="url(#salesGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle size={16} className="text-orange-500" />
                Low Stock Alert
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Products below minimum
              </p>
            </div>
            <Link
              href="/inventory"
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {data.lists.lowStockProducts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                All products well stocked ✓
              </p>
            ) : (
              data.lists.lowStockProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {p.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      Min: {p.minStock} {p.unit}
                    </p>
                  </div>
                  <Badge
                    variant={p.currentStock === 0 ? "danger" : "warning"}
                  >
                    {p.currentStock} {p.unit}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">Recent Sales</h3>
            <Link
              href="/sales"
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {data.lists.recentSales.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {s.invoiceNumber}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDate(s.saleDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-700">
                    {formatCurrency(s.totalAmount)}
                  </p>
                  <Badge variant={paymentStatusVariant(s.paymentStatus) as "success" | "warning" | "danger" | "info" | "neutral" | "purple"}>
                    {s.paymentStatus}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Due Customers */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">
              Customers with Due
            </h3>
            <Link
              href="/customers"
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {data.lists.topDueCustomers.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                No outstanding dues ✓
              </p>
            ) : (
              data.lists.topDueCustomers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {c.name}
                    </p>
                    <p className="text-xs text-slate-400">{c.phone}</p>
                  </div>
                  <p className="text-sm font-bold text-red-600">
                    {formatCurrency(c.currentDue)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
