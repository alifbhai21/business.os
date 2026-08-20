"use client";

import React from "react";
import { X, Printer, Share2, MessageCircle, CheckCircle, Store, Phone, MapPin } from "lucide-react";
import { SaleDTO, ProductDTO } from "@/lib/types";
import { formatTaka } from "@/lib/currency";
import { Language, translations } from "@/lib/i18n";

interface InvoiceModalProps {
  sale: SaleDTO | null;
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  shopName?: string;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  sale,
  isOpen,
  onClose,
  lang,
  shopName = "Dhaka Main Branch",
}) => {
  if (!isOpen || !sale) return null;
  const isBn = lang === "bn";
  const t = translations[lang];

  const handleWhatsAppShare = () => {
    const text = `🧾 *${shopName} - Invoice #${sale.invoiceNo}*
------------------------------
Customer: ${sale.customerName || "Walk-in"}
Date: ${new Date(sale.createdAt).toLocaleDateString()}
Total Amount: ${formatTaka(sale.totalPaisa, isBn)}
Paid Amount: ${formatTaka(sale.paidPaisa, isBn)}
Due Amount: ${formatTaka(sale.duePaisa, isBn)}
Payment Method: ${sale.paymentMethod}
------------------------------
Thank you for shopping with us!`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <CheckCircle className="w-5 h-5" />
            <span>Sale Completed Successfully</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Invoice Container */}
        <div className="p-5 overflow-y-auto bg-slate-950/60 space-y-4 text-xs">
          {/* Shop Header */}
          <div className="text-center border-b border-slate-800 pb-3">
            <h2 className="font-bold text-base text-white">Rahman Hardware & Enterprise</h2>
            <p className="text-slate-400 flex items-center justify-center gap-1 mt-0.5">
              <Store className="w-3 h-3 text-emerald-400" />
              <span>{shopName}</span>
            </p>
            <p className="text-slate-400 mt-0.5">Shop 14, New Market Super Market, Dhaka</p>
            <p className="text-slate-400">Phone: 01711000111 | bKash: 01711000111</p>
          </div>

          {/* Invoice Meta */}
          <div className="flex justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <p className="text-slate-400">Invoice No:</p>
              <p className="font-mono font-bold text-emerald-400">{sale.invoiceNo}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400">Date & Time:</p>
              <p className="font-medium text-slate-300">
                {new Date(sale.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800/80">
            <p className="text-slate-400">Customer:</p>
            <p className="font-semibold text-white">{sale.customerName || "Walk-in Retail Customer"}</p>
          </div>

          {/* Line Items */}
          <div className="space-y-1">
            <p className="font-semibold text-slate-300 mb-1">Purchased Items:</p>
            {sale.items && sale.items.length > 0 ? (
              <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
                {sale.items.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex justify-between bg-slate-900/60">
                    <div>
                      <p className="font-medium text-slate-200">{item.productName}</p>
                      <p className="text-[10px] text-slate-400">
                        {item.quantity} x {formatTaka(item.unitPricePaisa, isBn)}
                      </p>
                    </div>
                    <p className="font-semibold text-slate-200">
                      {formatTaka(item.totalPaisa, isBn)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-slate-900 rounded-xl text-slate-400 italic text-center">
                Standard items sale
              </div>
            )}
          </div>

          {/* Financial Breakdown */}
          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1.5 font-medium">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal:</span>
              <span>{formatTaka(sale.totalPaisa + (sale.discountPaisa || 0), isBn)}</span>
            </div>
            {sale.discountPaisa > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount:</span>
                <span>-{formatTaka(sale.discountPaisa, isBn)}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-bold text-sm pt-1 border-t border-slate-800">
              <span>Total Payable:</span>
              <span>{formatTaka(sale.totalPaisa, isBn)}</span>
            </div>
            <div className="flex justify-between text-emerald-300 pt-1">
              <span>Paid ({sale.paymentMethod}):</span>
              <span>{formatTaka(sale.paidPaisa, isBn)}</span>
            </div>
            {sale.duePaisa > 0 && (
              <div className="flex justify-between text-amber-400 font-bold">
                <span>Remaining Due (Baki):</span>
                <span>{formatTaka(sale.duePaisa, isBn)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex gap-2">
          <button
            onClick={handleWhatsAppShare}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow"
          >
            <MessageCircle className="w-4 h-4" />
            <span>WhatsApp Share</span>
          </button>
          <button
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition border border-slate-700"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 px-3 rounded-xl text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
