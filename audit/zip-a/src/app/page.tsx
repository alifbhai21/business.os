"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { DashboardView } from "@/components/DashboardView";
import { POSView } from "@/components/POSView";
import { BakiKhataView } from "@/components/BakiKhataView";
import { ProductsView } from "@/components/ProductsView";
import { PurchasesView } from "@/components/PurchasesView";
import { ExpensesView } from "@/components/ExpensesView";
import { AccountsView } from "@/components/AccountsView";
import { ReportsView } from "@/components/ReportsView";
import { DevicesView } from "@/components/DevicesView";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { InvoiceModal } from "@/components/InvoiceModal";
import { QuickActionModal } from "@/components/QuickActionModal";

import {
  LayoutDashboard,
  ShoppingCart,
  BookOpen,
  Package,
  ShoppingBag,
  Receipt,
  Wallet,
  BarChart3,
  Smartphone,
  Wifi,
  WifiOff,
  Battery,
  Signal,
  X,
  Sparkles,
  ArrowLeftRight,
  ShieldAlert,
} from "lucide-react";

import { Language, translations } from "@/lib/i18n";
import {
  ShopDTO,
  ProductDTO,
  CustomerDTO,
  SupplierDTO,
  AccountDTO,
  SaleDTO,
  ExpenseDTO,
  SummaryReportDTO,
  SyncOperation,
} from "@/lib/types";

export default function HomePage() {
  const [lang, setLang] = useState<Language>("bn");
  const [isMobileView, setIsMobileView] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<SyncOperation[]>([]);
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Data states
  const [businessName, setBusinessName] = useState("Rahman Hardware & Enterprise");
  const [businessType, setBusinessType] = useState("Retail + Wholesale");
  const [shops, setShops] = useState<ShopDTO[]>([]);
  const [activeShopId, setActiveShopId] = useState<string>("");
  const [summary, setSummary] = useState<SummaryReportDTO | null>(null);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [recentSales, setRecentSales] = useState<SaleDTO[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);

  // Modals
  const [showScanner, setShowScanner] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<SaleDTO | null>(null);
  const [quickActionType, setQuickActionType] = useState<
    "sale" | "purchase" | "customer_payment" | "supplier_payment" | "expense" | "transfer" | null
  >(null);

  const t = translations[lang];

  useEffect(() => {
    // Initial data load
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      // 1. Business & Shops
      const bizRes = await fetch("/api/v1/businesses");
      const bizJson = await bizRes.json();
      if (bizJson.success) {
        setBusinessName(bizJson.data.business.name);
        setBusinessType(bizJson.data.business.businessType);
        setShops(bizJson.data.shops);
        if (bizJson.data.shops.length > 0 && !activeShopId) {
          setActiveShopId(bizJson.data.shops[0].id);
        }
      }

      // 2. Summary KPI
      const sumRes = await fetch("/api/v1/reports/summary");
      const sumJson = await sumRes.json();
      if (sumJson.success) setSummary(sumJson.data);

      // 3. Products
      const prodRes = await fetch("/api/v1/products");
      const prodJson = await prodRes.json();
      if (prodJson.success) setProducts(prodJson.data);

      // 4. Customers
      const custRes = await fetch("/api/v1/customers");
      const custJson = await custRes.json();
      if (custJson.success) setCustomers(custJson.data);

      // 5. Suppliers
      const supRes = await fetch("/api/v1/suppliers");
      const supJson = await supRes.json();
      if (supJson.success) setSuppliers(supJson.data);

      // 6. Accounts
      const accRes = await fetch("/api/v1/accounts");
      const accJson = await accRes.json();
      if (accJson.success) setAccounts(accJson.data);

      // 7. Recent Sales
      const salesRes = await fetch("/api/v1/sales");
      const salesJson = await salesRes.json();
      if (salesJson.success) setRecentSales(salesJson.data);

      // 8. Expenses
      const expRes = await fetch("/api/v1/expenses");
      const expJson = await expRes.json();
      if (expJson.success) setExpenses(expJson.data);
    } catch (e) {
      console.error("Data fetch error", e);
    }
  };

  const handleSeedDemo = async () => {
    try {
      await fetch("/api/v1/seed", { method: "POST" });
      fetchAllData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncNow = async () => {
    if (offlineQueue.length === 0) return;
    try {
      const res = await fetch("/api/v1/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: "DEV-ANDROID-001",
          queue: offlineQueue,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setOfflineQueue([]);
        fetchAllData();
      }
    } catch (e) {
      console.error("Sync failed", e);
    }
  };

  const addOfflineOp = (op: SyncOperation) => {
    setOfflineQueue((prev) => [...prev, op]);
  };

  const activeShopObj = shops.find((s) => s.id === activeShopId);

  // Bottom Navigation tabs for Android frame
  const navTabs = [
    { id: "dashboard", label: t.dashboard, icon: LayoutDashboard },
    { id: "sales", label: t.sales, icon: ShoppingCart },
    { id: "baki", label: t.bakiKhata, icon: BookOpen },
    { id: "products", label: t.products, icon: Package },
    { id: "purchases", label: t.purchases, icon: ShoppingBag },
    { id: "expenses", label: t.expenses, icon: Receipt },
    { id: "accounts", label: t.accounts, icon: Wallet },
    { id: "reports", label: t.reports, icon: BarChart3 },
    { id: "devices", label: t.devices, icon: Smartphone },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Universal OS Header */}
      <Navbar
        lang={lang}
        setLang={setLang}
        isMobileView={isMobileView}
        setIsMobileView={setIsMobileView}
        isOffline={isOffline}
        setIsOffline={setIsOffline}
        unsyncedCount={offlineQueue.length}
        onSync={handleSyncNow}
        onSeedDemo={handleSeedDemo}
        shops={shops}
        activeShopId={activeShopId}
        setActiveShopId={setActiveShopId}
        businessName={businessName}
        businessType={businessType}
      />

      {/* Main Content Layout */}
      <main className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full flex justify-center items-start">
        {/* Android Native Phone Mockup Container */}
        {isMobileView ? (
          <div className="w-full max-w-md bg-slate-900 border-4 border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-emerald-950/30 flex flex-col min-h-[780px] my-2 relative">
            {/* Native Android Status Bar */}
            <div className="bg-slate-950 px-5 py-2 text-[11px] font-semibold text-slate-400 flex items-center justify-between border-b border-slate-800/60 select-none">
              <span>10:45 AM</span>
              {/* Camera Notch */}
              <div className="w-16 h-3 bg-slate-900 rounded-full border border-slate-800/80" />
              <div className="flex items-center gap-1.5">
                {isOffline ? (
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <Signal className="w-3.5 h-3.5 text-slate-300" />
                <Battery className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>

            {/* Mobile App Header Title */}
            <div className="p-3 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="font-bold text-xs text-white uppercase tracking-wider">
                  {navTabs.find((tab) => tab.id === activeTab)?.label}
                </h2>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {activeShopObj ? activeShopObj.branchCode : "MAIN"}
              </span>
            </div>

            {/* Mobile Scrollable Screen Content */}
            <div className="flex-1 p-3.5 overflow-y-auto max-h-[640px]">
              {activeTab === "dashboard" && (
                <DashboardView
                  lang={lang}
                  summary={summary}
                  products={products}
                  recentSales={recentSales}
                  onQuickAction={(type) => {
                    if (type === "sale") setActiveTab("sales");
                    else setQuickActionType(type);
                  }}
                  onOpenInvoice={(sale) => setActiveInvoice(sale)}
                  isOffline={isOffline}
                />
              )}

              {activeTab === "sales" && (
                <POSView
                  lang={lang}
                  products={products}
                  customers={customers}
                  accounts={accounts}
                  activeShopId={activeShopId}
                  isOffline={isOffline}
                  onOpenScanner={() => setShowScanner(true)}
                  onSaleComplete={(sale) => {
                    setActiveInvoice(sale);
                    fetchAllData();
                  }}
                  onAddOfflineOp={addOfflineOp}
                />
              )}

              {activeTab === "baki" && (
                <BakiKhataView
                  lang={lang}
                  customers={customers}
                  accounts={accounts}
                  activeShopId={activeShopId}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "products" && (
                <ProductsView
                  lang={lang}
                  products={products}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "purchases" && (
                <PurchasesView
                  lang={lang}
                  suppliers={suppliers}
                  products={products}
                  accounts={accounts}
                  activeShopId={activeShopId}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "expenses" && (
                <ExpensesView
                  lang={lang}
                  expenses={expenses}
                  accounts={accounts}
                  activeShopId={activeShopId}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "accounts" && (
                <AccountsView
                  lang={lang}
                  accounts={accounts}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "reports" && (
                <ReportsView lang={lang} summary={summary} />
              )}

              {activeTab === "devices" && <DevicesView lang={lang} />}
            </div>

            {/* Native Android Bottom Tab Navigation Bar */}
            <nav className="bg-slate-950 border-t border-slate-800/80 px-2 py-2 grid grid-cols-5 gap-1 select-none">
              {navTabs.slice(0, 5).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition ${
                      isActive
                        ? "text-emerald-400 bg-slate-900 font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[9px] mt-0.5 truncate max-w-full">
                      {tab.label.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        ) : (
          /* Desktop / Tablet Full OS View */
          <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Sidebar Navigation */}
            <div className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-1 h-fit sticky top-20">
              <p className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Main Menu
              </p>
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? "bg-emerald-600 text-white shadow shadow-emerald-600/20"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Main Panel Content */}
            <div className="md:col-span-9">
              {activeTab === "dashboard" && (
                <DashboardView
                  lang={lang}
                  summary={summary}
                  products={products}
                  recentSales={recentSales}
                  onQuickAction={(type) => {
                    if (type === "sale") setActiveTab("sales");
                    else setQuickActionType(type);
                  }}
                  onOpenInvoice={(sale) => setActiveInvoice(sale)}
                  isOffline={isOffline}
                />
              )}

              {activeTab === "sales" && (
                <POSView
                  lang={lang}
                  products={products}
                  customers={customers}
                  accounts={accounts}
                  activeShopId={activeShopId}
                  isOffline={isOffline}
                  onOpenScanner={() => setShowScanner(true)}
                  onSaleComplete={(sale) => {
                    setActiveInvoice(sale);
                    fetchAllData();
                  }}
                  onAddOfflineOp={addOfflineOp}
                />
              )}

              {activeTab === "baki" && (
                <BakiKhataView
                  lang={lang}
                  customers={customers}
                  accounts={accounts}
                  activeShopId={activeShopId}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "products" && (
                <ProductsView
                  lang={lang}
                  products={products}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "purchases" && (
                <PurchasesView
                  lang={lang}
                  suppliers={suppliers}
                  products={products}
                  accounts={accounts}
                  activeShopId={activeShopId}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "expenses" && (
                <ExpensesView
                  lang={lang}
                  expenses={expenses}
                  accounts={accounts}
                  activeShopId={activeShopId}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "accounts" && (
                <AccountsView
                  lang={lang}
                  accounts={accounts}
                  onRefreshData={fetchAllData}
                />
              )}

              {activeTab === "reports" && (
                <ReportsView lang={lang} summary={summary} />
              )}

              {activeTab === "devices" && <DevicesView lang={lang} />}
            </div>
          </div>
        )}
      </main>

      {/* Global Modals */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        products={products}
        onScanMatch={(p) => {
          setActiveTab("sales");
        }}
      />

      <InvoiceModal
        isOpen={!!activeInvoice}
        sale={activeInvoice}
        onClose={() => setActiveInvoice(null)}
        lang={lang}
        shopName={activeShopObj?.name}
      />

      <QuickActionModal
        actionType={quickActionType}
        onClose={() => setQuickActionType(null)}
        lang={lang}
        customers={customers}
        suppliers={suppliers}
        accounts={accounts}
        shops={shops}
        products={products}
        activeShopId={activeShopId}
        onRefreshData={fetchAllData}
      />
    </div>
  );
}
