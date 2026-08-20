"use client";

import React, { useState } from "react";
import { Wallet, Landmark, Smartphone, Plus, ArrowUpRight, ArrowDownLeft, X } from "lucide-react";
import { AccountDTO } from "@/lib/types";
import { Language, translations } from "@/lib/i18n";
import { formatTaka, takaToPaisa } from "@/lib/currency";

interface AccountsViewProps {
  lang: Language;
  accounts: AccountDTO[];
  onRefreshData: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  lang,
  accounts,
  onRefreshData,
}) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"cash" | "bank" | "bkash" | "nagad" | "rocket">("bkash");
  const [accountNumber, setAccountNumber] = useState("");
  const [openingTaka, setOpeningTaka] = useState("");
  const [loading, setLoading] = useState(false);

  const totalCashPaisa = accounts.reduce((sum, a) => sum + a.currentBalancePaisa, 0);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/v1/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          accountNumber,
          openingBalancePaisa: takaToPaisa(openingTaka),
        }),
      });

      setShowAddModal(false);
      setName("");
      setAccountNumber("");
      setOpeningTaka("");
      onRefreshData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getAccountIcon = (accType: string) => {
    switch (accType) {
      case "bkash":
      case "nagad":
      case "rocket":
        return <Smartphone className="w-5 h-5 text-pink-400" />;
      case "bank":
        return <Landmark className="w-5 h-5 text-sky-400" />;
      default:
        return <Wallet className="w-5 h-5 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs text-slate-400 font-medium">{t.cashBalance}</span>
          <p className="text-2xl font-extrabold text-emerald-400 font-mono mt-0.5">
            {formatTaka(totalCashPaisa, isBn)}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl transition shadow shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Account</span>
        </button>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                  {getAccountIcon(acc.type)}
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-xs">{acc.name}</h4>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                    {acc.type} {acc.accountNumber && `• ${acc.accountNumber}`}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-800 pt-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-medium">Available Balance</span>
              <span className="font-extrabold text-emerald-400 font-mono text-sm">
                {formatTaka(acc.currentBalancePaisa, isBn)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Add New Cash / MFS / Bank Account</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Account Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. bKash Merchant 01711..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="rocket">Rocket</option>
                    <option value="cash">Cash Box</option>
                    <option value="bank">Bank Account</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Account / Mobile No</label>
                  <input
                    type="text"
                    placeholder="e.g. 01711000111"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Opening Balance (৳)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={openingTaka}
                  onChange={(e) => setOpeningTaka(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono font-bold text-sm"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition"
                >
                  {loading ? "Saving..." : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
