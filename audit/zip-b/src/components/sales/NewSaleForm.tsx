"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { PAYMENT_METHODS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

interface Product {
  id: number;
  name: string;
  sellingPrice: number;
  currentStock: number;
  unit: string;
  categoryName: string | null;
}

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  currentDue: number;
}

interface CartItem {
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

interface NewSaleFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function NewSaleForm({ onSuccess, onCancel }: NewSaleFormProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.data ?? []));
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.data ?? []));
  }, []);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) &&
      p.currentStock > 0
  );

  const addToCart = (product: Product) => {
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c.productId === product.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          quantity: 1,
          unitPrice: product.sellingPrice / 100,
          discountAmount: 0,
        },
      ]);
    }
    setProductSearch("");
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter((c) => c.productId !== productId));
  };

  const updateCartItem = (
    productId: number,
    field: "quantity" | "unitPrice" | "discountAmount",
    value: number
  ) => {
    setCart(
      cart.map((c) => (c.productId === productId ? { ...c, [field]: value } : c))
    );
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice - item.discountAmount,
    0
  );
  const discountVal = parseFloat(discountAmount) || 0;
  const totalAmount = subtotal - discountVal;
  const paidVal = parseFloat(paidAmount) || 0;
  const dueAmount = Math.max(0, totalAmount - paidVal);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      setError("Add at least one product");
      return;
    }
    if (paidVal < 0) {
      setError("Paid amount cannot be negative");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
          })),
          discountAmount: discountVal,
          taxAmount: 0,
          paidAmount: paidVal,
          paymentMethod,
          notes: notes || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error?.formErrors?.[0] ?? "Failed to create sale");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Product Search */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Search & Add Products
          </label>
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search product name..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {productSearch && (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-white shadow-lg">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  No products found
                </p>
              ) : (
                filteredProducts.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          Stock: {p.currentStock} {p.unit}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-blue-600">
                        {formatCurrency(p.sellingPrice)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Customer */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Customer (optional)
          </label>
          <select
            value={customerId ?? ""}
            onChange={(e) =>
              setCustomerId(e.target.value ? parseInt(e.target.value) : null)
            }
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Walk-in Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-3 py-2 font-semibold text-slate-600">
                  Product
                </th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600">
                  Qty
                </th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600">
                  Price
                </th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600">
                  Disc.
                </th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600">
                  Total
                </th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr
                  key={item.productId}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="px-3 py-2 text-slate-700">{item.productName}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateCartItem(
                          item.productId,
                          "quantity",
                          parseInt(e.target.value) || 1
                        )
                      }
                      className="w-16 text-right px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateCartItem(
                          item.productId,
                          "unitPrice",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-24 text-right px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discountAmount}
                      onChange={(e) =>
                        updateCartItem(
                          item.productId,
                          "discountAmount",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-20 text-right px-2 py-1 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">
                    ৳
                    {(
                      item.quantity * item.unitPrice -
                      item.discountAmount
                    ).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment section */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Overall Discount (৳)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium">৳{subtotal.toFixed(2)}</span>
            </div>
            {discountVal > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discount</span>
                <span>-৳{discountVal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2">
              <span>Total</span>
              <span>৳{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Paid Amount (৳)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder={`Max: ৳${totalAmount.toFixed(2)}`}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {dueAmount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex justify-between text-sm">
              <span className="text-red-600">Due Amount</span>
              <span className="font-bold text-red-700">
                ৳{dueAmount.toFixed(2)}
              </span>
            </div>
          )}
          {paidVal >= totalAmount && totalAmount > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-center text-sm text-emerald-700 font-medium">
              ✓ Fully Paid
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || cart.length === 0}
          className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Creating..." : "Create Sale"}
        </button>
      </div>
    </div>
  );
}
