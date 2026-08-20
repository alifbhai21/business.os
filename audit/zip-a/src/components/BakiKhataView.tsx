"use client";

import React, { useState } from "react";
import {
  Users,
  Search,
  Plus,
  MessageCircle,
  DollarSign,
  FileText,
  Phone,
  MapPin,
  X,
  Save,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { CustomerDTO, AccountDTO } from "@/lib/types";
import { Language, translations } from "@/lib/i18n";
import { formatTaka, takaToPaisa } from "@/lib/currency";

interface BakiKhataViewProps {
  lang: Language;
  customers: CustomerDTO[];
  accounts: AccountDTO[];
  activeShopId: string;
  onRefreshData: () => void;
}

export const BakiKhataView: React.FC<BakiKhataViewProps> = ({
  lang,
  customers,
  accounts,
  activeShopId,
  onRefreshData,
}) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState<CustomerDTO | null>(null);
  const [showLedgerModal, setShowLedgerModal] = useState<any | null>(null);

  // Add Customer Form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openingDueTaka, setOpeningDueTaka] = useState("0");
  const [creditLimitTaka, setCreditLimitTaka] = useState("50000");

  // Payment Form
  const [collectTaka, setCollectTaka] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("Main Cash Box");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  const totalDuePaisa = customers.reduce((acc, c) => acc + c.currentDuePaisa, 0);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/v1/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: activeShopId,
          name,
          phone,
          address,
          openingBalancePaisa: takaToPaisa(openingDueTaka),
          creditLimitPaisa: takaToPaisa(creditLimitTaka),
        }),
      });

      setShowAddCustomerModal(false);
      setName("");
      setPhone("");
      setAddress("");
      setOpeningDueTaka("0");
      onRefreshData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPaymentModal) return;
    setLoading(true);

    try {
      await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: activeShopId,
          type: "customer_payment",
          customerId: showPaymentModal.id,
          amountPaisa: takaToPaisa(collectTaka),
          account: paymentAccount,
          note: notes || "Baki Khata Payment Collection",
        }),
      });

      setShowPaymentModal(null);
      setCollectTaka("");
      setNotes("");
      onRefreshData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openCustomerLedger = async (cust: CustomerDTO) => {
    try {
      const res = await fetch(`/api/v1/customers?id=${cust.id}`);
      const json = await res.json();
      if (json.success) {
        setShowLedgerModal(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendWhatsAppReminder = (cust: CustomerDTO) => {
    const dueFormatted = formatTaka(cust.currentDuePaisa, isBn);
    const msg = `সম্মানিত গ্রাহক ${cust.name} সাহেব, 
রহমান হার্ডওয়্যার-এ আপনার বকেয়া বাকি ৳${dueFormatted}। 
অনুগ্রহ করে bKash Merchant 01711000111-এ পরিশোধ করার অনুরোধ রইল। ধন্যবাদ!`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/88${cust.phone}?text=${encoded}`, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* Header Stat & Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs text-slate-400 font-medium">{t.totalReceivables}</span>
          <p className="text-2xl font-extrabold text-amber-400 font-mono mt-0.5">
            {formatTaka(totalDuePaisa, isBn)}
          </p>
        </div>

        <button
          onClick={() => setShowAddCustomerModal(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl transition shadow shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>{t.addCustomer}</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search customer by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
        />
      </div>

      {/* Customers List / Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
        {filteredCustomers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No customers found. Click "+ Add Customer" to create one.
          </div>
        ) : (
          filteredCustomers.map((cust) => (
            <div
              key={cust.id}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/40 transition"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-200 text-xs">{cust.name}</h4>
                  <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-400" />
                    {cust.phone}
                  </span>
                </div>
                {cust.address && (
                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    {cust.address}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400">Current Due</p>
                  <p className="font-bold text-amber-400 font-mono text-xs">
                    {formatTaka(cust.currentDuePaisa, isBn)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowPaymentModal(cust)}
                    className="p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition"
                    title="Collect Due Payment"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => sendWhatsAppReminder(cust)}
                    className="p-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-medium transition"
                    title="Send WhatsApp Payment Reminder"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => openCustomerLedger(cust)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition"
                    title="View Customer Statement"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="font-semibold text-sm">{t.addCustomer}</h3>
              <button
                onClick={() => setShowAddCustomerModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Customer Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hafizur Rahman"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 01712001122"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Address / Area</label>
                <input
                  type="text"
                  placeholder="e.g. Mirpur 10, Dhaka"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Opening Due (৳)</label>
                  <input
                    type="number"
                    value={openingDueTaka}
                    onChange={(e) => setOpeningDueTaka(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Credit Limit (৳)</label>
                  <input
                    type="number"
                    value={creditLimitTaka}
                    onChange={(e) => setCreditLimitTaka(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
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

      {/* Collect Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                Collect Due: {showPaymentModal.name}
              </h3>
              <button
                onClick={() => setShowPaymentModal(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCollectPayment} className="p-5 space-y-3 text-xs">
              <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl flex justify-between font-medium">
                <span className="text-amber-300">Current Remaining Due:</span>
                <span className="text-amber-400 font-mono font-bold">
                  {formatTaka(showPaymentModal.currentDuePaisa, isBn)}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Collected Amount (৳)</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={collectTaka}
                  onChange={(e) => setCollectTaka(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Payment Method / Account</label>
                <select
                  value={paymentAccount}
                  onChange={(e) => setPaymentAccount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notes / Receipt Ref</label>
                <input
                  type="text"
                  placeholder="e.g. Received via bKash TrxID: 9X82A..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(null)}
                  className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition"
                >
                  {loading ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Ledger Statement Modal */}
      {showLedgerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">{showLedgerModal.customer?.name}</h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {showLedgerModal.customer?.phone}
                </p>
              </div>
              <button
                onClick={() => setShowLedgerModal(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between">
                <div>
                  <p className="text-slate-400">Total Remaining Due</p>
                  <p className="font-bold text-amber-400 font-mono text-sm mt-0.5">
                    {formatTaka(showLedgerModal.customer?.currentDuePaisa || 0, isBn)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400">Credit Limit</p>
                  <p className="font-bold text-slate-300 font-mono text-sm mt-0.5">
                    {formatTaka(showLedgerModal.customer?.creditLimitPaisa || 0, isBn)}
                  </p>
                </div>
              </div>

              <p className="font-semibold text-slate-300">Transaction History:</p>

              <div className="space-y-2">
                {showLedgerModal.sales?.map((s: any) => (
                  <div key={s.id} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex justify-between">
                    <div>
                      <p className="font-semibold text-emerald-400">Sale #{s.invoiceNo}</p>
                      <p className="text-[10px] text-slate-400">{new Date(s.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right font-mono">
                      <p className="text-slate-200">Total: {formatTaka(s.totalPaisa, isBn)}</p>
                      <p className="text-emerald-400">Paid: {formatTaka(s.paidPaisa, isBn)}</p>
                      {s.duePaisa > 0 && <p className="text-amber-400 font-bold">Due: {formatTaka(s.duePaisa, isBn)}</p>}
                    </div>
                  </div>
                ))}

                {showLedgerModal.payments?.map((p: any) => (
                  <div key={p.id} className="p-2.5 bg-slate-950/80 rounded-xl border border-emerald-500/20 flex justify-between">
                    <div>
                      <p className="font-semibold text-teal-300">Due Payment Collected</p>
                      <p className="text-[10px] text-slate-400">{new Date(p.createdAt).toLocaleDateString()} via {p.account}</p>
                    </div>
                    <div className="text-right font-mono font-bold text-emerald-400">
                      -{formatTaka(p.amountPaisa, isBn)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
