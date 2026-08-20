"use client";

import React, { useState } from "react";
import {
  Camera,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  User,
  CreditCard,
  Tag,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { ProductDTO, CustomerDTO, AccountDTO, SaleDTO, SyncOperation } from "@/lib/types";
import { Language, translations } from "@/lib/i18n";
import { formatTaka, takaToPaisa } from "@/lib/currency";

interface CartItem {
  product: ProductDTO;
  quantity: number;
  unitPricePaisa: number;
}

interface POSViewProps {
  lang: Language;
  products: ProductDTO[];
  customers: CustomerDTO[];
  accounts: AccountDTO[];
  activeShopId: string;
  isOffline: boolean;
  onOpenScanner: () => void;
  onSaleComplete: (sale: SaleDTO) => void;
  onAddOfflineOp: (op: SyncOperation) => void;
}

export const POSView: React.FC<POSViewProps> = ({
  lang,
  products,
  customers,
  accounts,
  activeShopId,
  isOffline,
  onOpenScanner,
  onSaleComplete,
  onAddOfflineOp,
}) => {
  const isBn = lang === "bn";
  const t = translations[lang];

  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentAccount, setPaymentAccount] = useState("Main Cash Box");
  const [discountTaka, setDiscountTaka] = useState("0");
  const [paidTaka, setPaidTaka] = useState("");
  const [loading, setLoading] = useState(false);

  // Filter products by search query
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchQuery))
  );

  const addToCart = (product: ProductDTO) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, unitPricePaisa: product.sellingPricePaisa }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // Calculations
  const subtotalPaisa = cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPricePaisa,
    0
  );
  const discountPaisa = takaToPaisa(discountTaka);
  const totalPaisa = Math.max(0, subtotalPaisa - discountPaisa);
  const paidPaisa = paidTaka !== "" ? takaToPaisa(paidTaka) : totalPaisa;
  const duePaisa = Math.max(0, totalPaisa - paidPaisa);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setLoading(true);

    const localId = `local-sale-${Date.now()}`;
    const salePayload = {
      localId,
      shopId: activeShopId,
      customerId: selectedCustomerId || null,
      customerName: selectedCustomer ? selectedCustomer.name : "Walk-in Retail Customer",
      totalPaisa,
      discountPaisa,
      paidPaisa,
      duePaisa,
      paymentMethod,
      paymentAccount,
      createdBy: "Sales Counter",
      items: cart.map((c) => ({
        productId: c.product.id,
        productName: c.product.name,
        quantity: c.quantity,
        unitPricePaisa: c.unitPricePaisa,
        totalPaisa: c.quantity * c.unitPricePaisa,
      })),
    };

    if (isOffline) {
      // Offline mode: enqueue locally
      const offlineOp: SyncOperation = {
        localId,
        type: "sale",
        payload: salePayload,
        createdAt: new Date().toISOString(),
      };
      onAddOfflineOp(offlineOp);

      const fakeSaleDTO: SaleDTO = {
        id: localId,
        localId,
        businessId: "biz-1",
        shopId: activeShopId,
        invoiceNo: `OFFLINE-${Date.now().toString().slice(-4)}`,
        customerId: selectedCustomerId,
        customerName: selectedCustomer ? selectedCustomer.name : "Walk-in Retail Customer",
        totalPaisa,
        discountPaisa,
        taxPaisa: 0,
        paidPaisa,
        duePaisa,
        paymentMethod: paymentMethod as any,
        paymentAccount,
        status: "completed",
        createdBy: "Offline Counter",
        createdAt: new Date().toISOString(),
        items: salePayload.items,
      };

      onSaleComplete(fakeSaleDTO);
      setCart([]);
      setPaidTaka("");
      setDiscountTaka("0");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salePayload),
      });

      const json = await res.json();
      if (json.success) {
        json.data.items = salePayload.items;
        onSaleComplete(json.data);
        setCart([]);
        setPaidTaka("");
        setDiscountTaka("0");
      }
    } catch (e) {
      console.error("Sale checkout failed", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
      {/* Left Column: Product Search & Catalog */}
      <div className="lg:col-span-7 flex flex-col gap-3">
        {/* Search & Barcode Button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder={t.searchProduct}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <button
            onClick={onOpenScanner}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3.5 py-2.5 rounded-xl text-xs transition shadow shadow-emerald-600/20"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">{t.scanBarcode}</span>
          </button>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {filteredProducts.map((p) => {
            const isLow = p.currentStock <= p.minStock;
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-3 text-left transition flex flex-col justify-between group relative overflow-hidden"
              >
                {isLow && (
                  <span className="absolute top-1.5 right-1.5 bg-rose-500/20 text-rose-300 text-[9px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 border border-rose-500/30">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Low
                  </span>
                )}
                <div>
                  <h4 className="font-semibold text-slate-200 text-xs group-hover:text-emerald-300 line-clamp-2">
                    {p.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1">
                    SKU: {p.sku} | Unit: {p.unit}
                  </p>
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2">
                  <span className="font-bold text-emerald-400 text-xs">
                    {formatTaka(p.sellingPricePaisa, isBn)}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isLow
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    Stock: {p.currentStock}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Column: POS Cart & Checkout */}
      <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <span>{t.posTitle}</span>
              {isOffline && (
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1 border border-amber-500/30">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Offline Queue
                </span>
              )}
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {cart.length} items
            </span>
          </div>

          {/* Customer Selection */}
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white"
            >
              <option value="">-- {t.walkInCustomer} --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone}) - Due: ৳{(c.currentDuePaisa / 100).toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          {/* Cart Item List */}
          <div className="max-h-52 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/60">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                {t.cartEmpty}
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="pt-2 flex items-center justify-between text-xs"
                >
                  <div className="flex-1 pr-2">
                    <p className="font-semibold text-slate-200 line-clamp-1">
                      {item.product.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatTaka(item.unitPricePaisa, isBn)} / {item.product.unit}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-mono font-bold text-white text-xs">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="font-bold text-emerald-400 font-mono w-16 text-right">
                      {formatTaka(item.quantity * item.unitPricePaisa, isBn)}
                    </span>

                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1 text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Totals & Payment Section */}
        <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>{t.subtotal}:</span>
            <span className="font-mono">{formatTaka(subtotalPaisa, isBn)}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">{t.discount} (৳):</span>
            <input
              type="number"
              value={discountTaka}
              onChange={(e) => setDiscountTaka(e.target.value)}
              className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-right font-mono text-white text-xs"
            />
          </div>

          <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-slate-800">
            <span>{t.netTotal}:</span>
            <span className="text-emerald-400 font-mono">{formatTaka(totalPaisa, isBn)}</span>
          </div>

          {/* Payment Account */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-[11px] text-white"
              >
                {["Cash", "bKash", "Nagad", "Bank", "Credit/Baki"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">Received (৳)</label>
              <input
                type="number"
                placeholder={formatTaka(totalPaisa, isBn)}
                value={paidTaka}
                onChange={(e) => setPaidTaka(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-right font-mono text-white text-xs"
              />
            </div>
          </div>

          {duePaisa > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-1.5 rounded-lg text-[11px] text-amber-300 flex justify-between font-medium">
              <span>{t.dueAmount} (Added to Customer Ledger):</span>
              <span className="font-mono font-bold">{formatTaka(duePaisa, isBn)}</span>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition shadow shadow-emerald-600/20 text-xs flex items-center justify-center gap-2 mt-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{loading ? "Processing..." : t.completeSale}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
