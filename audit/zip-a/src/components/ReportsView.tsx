"use client";

import React from "react";
import { TrendingUp, BarChart3, PieChart, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { SummaryReportDTO } from "@/lib/types";
import { Language, translations } from "@/lib/i18n";
import { formatTaka } from "@/lib/currency";

interface ReportsViewProps {
  lang: Language;
  summary: SummaryReportDTO | null;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ lang, summary }) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  if (!summary) {
    return <div className="p-8 text-center text-slate-500 text-xs">Loading analytics...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] text-slate-400 font-medium">{t.todaySales}</p>
          <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
            {formatTaka(summary.todaySalesPaisa, isBn)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{summary.todaySalesCount} sales today</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] text-slate-400 font-medium">{t.todayProfit}</p>
          <p className="text-lg font-bold text-teal-300 font-mono mt-0.5">
            {formatTaka(summary.todayProfitPaisa, isBn)}
          </p>
          <p className="text-[10px] text-emerald-400/80 mt-1 flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3" />
            <span>Est. ~22% Gross Margin</span>
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] text-slate-400 font-medium">{t.stockValue}</p>
          <p className="text-lg font-bold text-sky-400 font-mono mt-0.5">
            {formatTaka(summary.totalStockValuePaisa, isBn)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{summary.lowStockCount} items low stock</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] text-slate-400 font-medium">{t.totalReceivables}</p>
          <p className="text-lg font-bold text-amber-400 font-mono mt-0.5">
            {formatTaka(summary.totalReceivablesPaisa, isBn)}
          </p>
          <p className="text-[10px] text-amber-400/80 mt-1">Customer Dues Balance</p>
        </div>
      </div>

      {/* 7-Day Sales Trend Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-xs text-white">7-Day Sales & Profit Performance (BDT ৳)</h3>
          </div>
          <span className="text-[10px] text-slate-400">Live Trend</span>
        </div>

        <div className="h-60 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary.salesTrend}>
              <defs>
                <linearGradient id="salesColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#salesColor)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Profit & Loss Summary Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-xs text-white">Profit & Loss (P&L) Statement Overview</h3>
        <div className="divide-y divide-slate-800 text-xs font-medium space-y-2 pt-1">
          <div className="flex justify-between text-slate-300">
            <span>Gross Sales Revenue:</span>
            <span className="font-mono">{formatTaka(summary.todaySalesPaisa, isBn)}</span>
          </div>
          <div className="flex justify-between text-rose-300 pt-2">
            <span>Estimated Cost of Goods Sold (COGS):</span>
            <span className="font-mono">-{formatTaka(Math.round(summary.todaySalesPaisa * 0.78), isBn)}</span>
          </div>
          <div className="flex justify-between text-teal-300 pt-2 font-bold">
            <span>Estimated Gross Profit:</span>
            <span className="font-mono">{formatTaka(Math.round(summary.todaySalesPaisa * 0.22), isBn)}</span>
          </div>
          <div className="flex justify-between text-emerald-400 font-extrabold text-sm pt-2">
            <span>Net Operating Income:</span>
            <span className="font-mono">{formatTaka(summary.todayProfitPaisa, isBn)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
