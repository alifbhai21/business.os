"use client";

import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  color: "blue" | "green" | "red" | "orange" | "purple" | "teal" | "yellow";
  trend?: { value: number; label: string };
}

const colorMap = {
  blue: {
    bg: "bg-blue-50",
    icon: "bg-blue-100 text-blue-600",
    value: "text-blue-700",
    accent: "border-blue-200",
  },
  green: {
    bg: "bg-emerald-50",
    icon: "bg-emerald-100 text-emerald-600",
    value: "text-emerald-700",
    accent: "border-emerald-200",
  },
  red: {
    bg: "bg-red-50",
    icon: "bg-red-100 text-red-600",
    value: "text-red-700",
    accent: "border-red-200",
  },
  orange: {
    bg: "bg-orange-50",
    icon: "bg-orange-100 text-orange-600",
    value: "text-orange-700",
    accent: "border-orange-200",
  },
  purple: {
    bg: "bg-purple-50",
    icon: "bg-purple-100 text-purple-600",
    value: "text-purple-700",
    accent: "border-purple-200",
  },
  teal: {
    bg: "bg-teal-50",
    icon: "bg-teal-100 text-teal-600",
    value: "text-teal-700",
    accent: "border-teal-200",
  },
  yellow: {
    bg: "bg-yellow-50",
    icon: "bg-yellow-100 text-yellow-600",
    value: "text-yellow-700",
    accent: "border-yellow-200",
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  trend,
}: StatCardProps) {
  const c = colorMap[color];
  return (
    <div
      className={`rounded-2xl border ${c.accent} ${c.bg} p-5 flex flex-col gap-3`}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${c.icon}`}>{icon}</div>
        {trend && (
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              trend.value >= 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-600"
            }`}
          >
            {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%{" "}
            {trend.label}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className={`text-2xl font-bold mt-0.5 ${c.value}`}>{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
