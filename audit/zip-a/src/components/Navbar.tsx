"use client";

import React from "react";
import {
  Smartphone,
  Monitor,
  Wifi,
  WifiOff,
  RefreshCw,
  Store,
  Languages,
  Database,
  Sparkles,
} from "lucide-react";
import { translations, Language } from "@/lib/i18n";
import { ShopDTO } from "@/lib/types";

interface NavbarProps {
  lang: Language;
  setLang: (lang: Language) => void;
  isMobileView: boolean;
  setIsMobileView: (val: boolean) => void;
  isOffline: boolean;
  setIsOffline: (val: boolean) => void;
  unsyncedCount: number;
  onSync: () => void;
  onSeedDemo: () => void;
  shops: ShopDTO[];
  activeShopId: string;
  setActiveShopId: (id: string) => void;
  businessName: string;
  businessType: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  lang,
  setLang,
  isMobileView,
  setIsMobileView,
  isOffline,
  setIsOffline,
  unsyncedCount,
  onSync,
  onSeedDemo,
  shops,
  activeShopId,
  setActiveShopId,
  businessName,
  businessType,
}) => {
  const t = translations[lang];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      {/* Offline Alert Strip if offline */}
      {isOffline && (
        <div className="bg-amber-500/20 text-amber-300 text-xs px-4 py-1.5 flex items-center justify-between border-b border-amber-500/30">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 animate-pulse text-amber-400" />
            <span>{t.offlineNotice}</span>
          </div>
          <span className="font-semibold px-2 py-0.5 bg-amber-500/30 rounded text-[11px]">
            {t.offlineMode}
          </span>
        </div>
      )}

      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Brand & Shop Switcher */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-900 text-lg shadow-md shadow-emerald-500/20">
            ৳
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm sm:text-base leading-tight">
                {businessName || t.appName}
              </h1>
              <span className="hidden sm:inline-block text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-emerald-500/20">
                {businessType}
              </span>
            </div>

            {/* Shop dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={activeShopId}
                onChange={(e) => setActiveShopId(e.target.value)}
                className="bg-transparent text-slate-300 font-medium hover:text-white cursor-pointer focus:outline-none"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                    {s.name} ({s.branchCode})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Seed Demo Preset Button */}
          <button
            onClick={onSeedDemo}
            className="hidden md:flex items-center gap-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg transition"
            title="Load Bangladeshi Business Demo Preset"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.seedDemoData}</span>
          </button>

          {/* Sync Status Badge */}
          {unsyncedCount > 0 && (
            <button
              onClick={onSync}
              className="flex items-center gap-1.5 bg-amber-500 text-slate-950 font-semibold text-xs px-2.5 py-1.5 rounded-lg shadow hover:bg-amber-400 transition animate-pulse"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {unsyncedCount} {t.unsyncedCount}
              </span>
            </button>
          )}

          {/* Online / Offline Simulator Toggle */}
          <button
            onClick={() => setIsOffline(!isOffline)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              isOffline
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
            }`}
            title="Toggle Offline/Online Mode Simulator"
          >
            {isOffline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{t.offlineMode}</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">{t.onlineMode}</span>
              </>
            )}
          </button>

          {/* Language Selector */}
          <button
            onClick={() => setLang(lang === "bn" ? "en" : "bn")}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
          >
            <Languages className="w-3.5 h-3.5 text-slate-400" />
            <span>{lang === "bn" ? "English" : "বাংলা"}</span>
          </button>

          {/* Platform Frame Switcher (Android Mobile / Desktop) */}
          <button
            onClick={() => setIsMobileView(!isMobileView)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
            title="Toggle Android Mobile Frame / Desktop View"
          >
            {isMobileView ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden lg:inline">Desktop View</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Android Mobile</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
