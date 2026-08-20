"use client";

import React from "react";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  ShoppingBag,
  UserCheck,
  Truck,
  Receipt,
  ArrowLeftRight,
  AlertTriangle,
  ChevronRight,
  CheckCircle,
  Clock,
  Sparkles,
  Zap,
} from "lucide-react";
import { SummaryReportDTO, ProductDTO, SaleDTO } from "@/lib/types";
import { Language, translations } from "@/lib/i18n";
import { formatTaka } from "@/lib/currency";

interface DashboardViewProps {
  lang: Language;
  summary: SummaryReportDTO | null;
  products: ProductDTO[];
  recentSales: SaleDTO[];
  onQuickAction: (type: "sale" | "purchase" | "customer_payment" | "supplier_payment" | "expense" | "transfer") => void;
  onOpenInvoice: (sale: SaleDTO) => void;
  isOffline: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lang,
  summary,
  products,
  recentSales,
  onQuickAction,
  onOpenInvoice,
  isOffline,
}) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  const lowStockItems = products.filter((p) => p.currentStock <= p.minStock);

  return (
    <div className="space-y-4">
      {/* Quick Action Floaters / Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.quickActions}</span>
          </span>
          {isOffline && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-medium flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              Offline Saved
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            onClick={() => onQuickAction("sale")}
            className="flex items-center justify-center gap-1.5 p-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition"
          >
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            <span>{t.newSale}</span>
          </button>

          <button
            onClick={() => onQuickAction("purchase")}
            className="flex items-center justify-center gap-1.5 p-2.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-semibold transition"
          >
            <ShoppingBag className="w-4 h-4 text-sky-400" />
            <span>{t.newPurchase}</span>
          </button>

          <button
            onClick={() => onQuickAction("customer_payment")}
            className="flex items-center justify-center gap-1.5 p-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition"
          >
            <UserCheck className="w-4 h-4 text-amber-400" />
            <span>{t.customerPayment}</span>
          </button>

          <button
            onClick={() => onQuickAction("supplier_payment")}
            className="flex items-center justify-center gap-1.5 p-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition"
          >
            <Truck className="w-4 h-4 text-rose-400" />
            <span>{t.supplierPayment}</span>
          </button>

          <button
            onClick={() => onQuickAction("expense")}
            className="flex items-center justify-center gap-1.5 p-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold transition"
          >
            <Receipt className="w-4 h-4 text-purple-400" />
            <span>{t.addExpense}</span>
          </button>

          <button
            onClick={() => onQuickAction("transfer")}
            className="flex items-center justify-center gap-1.5 p-2.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 rounded-xl text-xs font-semibold transition"
          >
            <ArrowLeftRight className="w-4 h-4 text-teal-400" />
            <span>{t.stockTransfer}</span>
          </button>
        </div>
      </div>

      {/* Primary Key Metric Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">{t.todaySales}</span>
            <p className="text-xl font-extrabold text-emerald-400 font-mono">
              {formatTaka(summary.todaySalesPaisa, isBn)}
            </p>
            <p className="text-[10px] text-slate-500">{summary.todaySalesCount} sales count</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">{t.todayProfit}</span>
            <p className="text-xl font-extrabold text-teal-300 font-mono">
              {formatTaka(summary.todayProfitPaisa, isBn)}
            </p>
            <p className="text-[10px] text-teal-400/80">Net Est. Profit</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">{t.cashBalance}</span>
            <p className="text-xl font-extrabold text-emerald-400 font-mono">
              {formatTaka(summary.totalCashPaisa, isBn)}
            </p>
            <p className="text-[10px] text-slate-500">Cash + MFS Accounts</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">{t.totalReceivables}</span>
            <p className="text-xl font-extrabold text-amber-400 font-mono">
              {formatTaka(summary.totalReceivablesPaisa, isBn)}
            </p>
            <p className="text-[10px] text-amber-400/80">Pending Customer Dues</p>
          </div>
        </div>
      )}

      {/* Low Stock Warnings */}
      {lowStockItems.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>{t.lowStockAlerts} ({lowStockItems.length})</span>
            </div>
            <span className="text-[10px] text-rose-300 font-medium">Action Needed</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {lowStockItems.map((p) => (
              <div
                key={p.id}
                className="bg-slate-950/80 border border-rose-500/20 rounded-xl p-2.5 flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-200">{p.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Stock: {p.currentStock} {p.unit} (Min: {p.minStock})
                  </p>
                </div>
                <button
                  onClick={() => onQuickAction("purchase")}
                  className="bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-[10px]"
                >
                  Reorder
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sales Activity */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="font-bold text-xs text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>{t.recentSales}</span>
          </h3>
        </div>

        <div className="divide-y divide-slate-800/80">
          {recentSales.map((s) => (
            <div
              key={s.id}
              onClick={() => onOpenInvoice(s)}
              className="py-2.5 flex items-center justify-between hover:bg-slate-800/40 p-1.5 rounded-xl cursor-pointer transition text-xs"
            >
              <div>
                <p className="font-bold text-slate-200">
                  #{s.invoiceNo} — {s.customerName || "Walk-in Customer"}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {new Date(s.createdAt).toLocaleTimeString()} • {s.paymentMethod}
                </p>
              </div>

              <div className="text-right font-mono">
                <p className="font-bold text-emerald-400">
                  {formatTaka(s.totalPaisa, isBn)}
                </p>
                {s.duePaisa > 0 && (
                  <p className="text-[10px] text-amber-400 font-semibold">
                    Due: {formatTaka(s.duePaisa, isBn)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
