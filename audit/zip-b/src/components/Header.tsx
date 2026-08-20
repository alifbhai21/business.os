"use client";

import { Bell, Search, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const router = useRouter();

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSeeded(true);
        router.refresh();
        setTimeout(() => setSeeded(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setSeeding(false);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Seed button */}
        <button
          onClick={handleSeed}
          disabled={seeding}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            seeded
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 hover:bg-slate-200 text-slate-600"
          }`}
          title="Load sample data"
        >
          <RefreshCw size={13} className={seeding ? "animate-spin" : ""} />
          {seeded ? "Data loaded!" : seeding ? "Loading..." : "Load Sample Data"}
        </button>

        <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}
