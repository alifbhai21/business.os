"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  TrendingUp,
  FileText,
  CreditCard,
  BarChart3,
  Settings,
  Boxes,
  Building2,
  ChevronRight,
} from "lucide-react";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Sales",
    href: "/sales",
    icon: ShoppingCart,
  },
  {
    label: "Purchases",
    href: "/purchases",
    icon: TrendingUp,
  },
  {
    label: "Products",
    href: "/products",
    icon: Package,
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Boxes,
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Users,
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Truck,
  },
  {
    label: "Payments",
    href: "/payments",
    icon: CreditCard,
  },
  {
    label: "Expenses",
    href: "/expenses",
    icon: FileText,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 flex flex-col h-screen sticky top-0 shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">
              Universal
            </p>
            <p className="text-blue-400 text-xs font-medium">Business OS</p>
          </div>
        </div>
      </div>

      {/* Business info */}
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="bg-slate-800 rounded-xl px-3 py-2.5">
          <p className="text-slate-300 text-xs font-medium">Current Business</p>
          <p className="text-white text-sm font-semibold mt-0.5">
            Rahman Enterprise
          </p>
          <p className="text-slate-400 text-xs">Main Branch · Dhaka</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Icon
                size={18}
                className={`shrink-0 ${isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"}`}
              />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <ChevronRight size={14} className="text-blue-200 shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">R</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              Rahman Owner
            </p>
            <p className="text-slate-400 text-xs">Owner</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
