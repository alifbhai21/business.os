"use client";

import {
  Building2,
  Store,
  Users,
  Shield,
  Database,
  Bell,
  Globe,
} from "lucide-react";
import { BUSINESS_TYPES, PAYMENT_METHODS } from "@/lib/constants";

export function SettingsContent() {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Business Profile */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-blue-100 rounded-xl">
                <Building2 size={20} className="text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">
                Business Profile
              </h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    defaultValue="Rahman Enterprise"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Business Type
                  </label>
                  <select
                    defaultValue="retail_wholesale"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    defaultValue="+880 1711-123456"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    defaultValue="rahman@enterprise.bd"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Address
                </label>
                <textarea
                  defaultValue="123 Main Market, Dhaka, Bangladesh"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Currency
                  </label>
                  <select
                    defaultValue="BDT"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="BDT">BDT (৳) — Bangladeshi Taka</option>
                    <option value="USD">USD ($) — US Dollar</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    defaultValue="0"
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors">
                Save Changes
              </button>
            </div>
          </div>

          {/* Shop Settings */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-emerald-100 rounded-xl">
                <Store size={20} className="text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">
                Shop / Branch Settings
              </h2>
            </div>
            <div className="space-y-3">
              {[
                {
                  name: "Main Branch",
                  code: "MB-001",
                  address: "123 Main Market, Dhaka",
                },
                {
                  name: "Warehouse",
                  code: "WH-001",
                  address: "45 Industrial Area, Dhaka",
                },
              ].map((shop) => (
                <div
                  key={shop.code}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-700">{shop.name}</p>
                    <p className="text-xs text-slate-400">
                      {shop.code} · {shop.address}
                    </p>
                  </div>
                  <button className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-100">
                    Edit
                  </button>
                </div>
              ))}
              <button className="w-full py-2.5 border border-dashed border-slate-300 text-slate-500 rounded-xl text-sm hover:border-blue-400 hover:text-blue-600 transition-colors">
                + Add New Branch
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          {/* Business Modules */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Globe size={18} className="text-blue-600" />
              <h3 className="font-semibold text-slate-800">
                Active Modules
              </h3>
            </div>
            <div className="space-y-2">
              {[
                { name: "Sales & Invoicing", enabled: true },
                { name: "Purchase Management", enabled: true },
                { name: "Inventory Tracking", enabled: true },
                { name: "Customer Dues (Baki)", enabled: true },
                { name: "Supplier Dues", enabled: true },
                { name: "Expense Tracking", enabled: true },
                { name: "Basic Reports", enabled: true },
                { name: "Multi-Branch", enabled: true },
                { name: "Service Jobs", enabled: false },
                { name: "Manufacturing", enabled: false },
              ].map((module) => (
                <div
                  key={module.name}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="text-sm text-slate-700">{module.name}</span>
                  <div
                    className={`w-9 h-5 rounded-full transition-colors ${
                      module.enabled ? "bg-blue-600" : "bg-slate-200"
                    } flex items-center px-0.5`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        module.enabled ? "translate-x-4" : ""
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Users & Roles */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-purple-600" />
              <h3 className="font-semibold text-slate-800">Users & Roles</h3>
            </div>
            <div className="space-y-2">
              {[
                { name: "Rahman Owner", role: "Owner", active: true },
                { name: "Kamal Manager", role: "Manager", active: true },
                { name: "Rina Sales", role: "Salesperson", active: true },
              ].map((user) => (
                <div
                  key={user.name}
                  className="flex items-center gap-3 py-1.5"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">
                      {user.name[0]}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">
                      {user.name}
                    </p>
                    <p className="text-xs text-slate-400">{user.role}</p>
                  </div>
                  <div
                    className={`w-2 h-2 rounded-full ${user.active ? "bg-emerald-400" : "bg-slate-300"}`}
                  />
                </div>
              ))}
            </div>
            <button className="w-full mt-3 py-2 border border-dashed border-slate-300 text-slate-500 rounded-xl text-xs hover:border-blue-400 hover:text-blue-600 transition-colors">
              + Add User
            </button>
          </div>

          {/* Security */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={18} className="text-red-500" />
              <h3 className="font-semibold text-slate-800">Security</h3>
            </div>
            <div className="space-y-2 text-sm">
              {[
                "JWT Authentication (15min)",
                "Role-Based Access Control",
                "Audit Logging Active",
                "Soft-Delete (No data loss)",
                "Average Cost Method",
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <span className="text-emerald-600 text-xs">✓</span>
                  </div>
                  <span className="text-slate-600">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database size={18} className="text-teal-600" />
              <h3 className="font-semibold text-slate-800">Data</h3>
            </div>
            <div className="space-y-2">
              <button className="w-full py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-100 transition-colors">
                Export CSV (Coming Soon)
              </button>
              <button className="w-full py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-100 transition-colors">
                Export PDF (Coming Soon)
              </button>
              <button className="w-full py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm hover:bg-blue-100 transition-colors font-medium">
                Cloud Backup: Active ✓
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
