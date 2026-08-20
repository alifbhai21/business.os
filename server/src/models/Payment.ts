import { Schema, model, Document, Types } from "mongoose";
import { PAYMENT_METHODS, PaymentMethod } from "../config/accounts";

export type PaymentType = "customer_payment" | "supplier_payment";

export interface PaymentDocument extends Document {
  businessId: Types.ObjectId;
  shopId: Types.ObjectId;
  type: PaymentType;
  customerId: Types.ObjectId | null;
  supplierId: Types.ObjectId | null;
  saleId: Types.ObjectId | null;
  purchaseId: Types.ObjectId | null;
  amount: number;
  method: PaymentMethod;
  accountId: Types.ObjectId;
  note: string | null;
  idempotencyKey: string;
  paymentDate: Date;
  createdBy: Types.ObjectId;
  localId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    type: { type: String, enum: ["customer_payment", "supplier_payment"], required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    saleId: { type: Schema.Types.ObjectId, ref: "Sale", default: null },
    purchaseId: { type: Schema.Types.ObjectId, ref: "Purchase", default: null },
    amount: { type: Number, required: true },
    method: { type: String, enum: [...PAYMENT_METHODS], required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    note: { type: String, default: null, trim: true, maxlength: 500 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 120 },
    paymentDate: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localId: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { timestamps: true }
);

paymentSchema.index({ businessId: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ businessId: 1, paymentDate: -1 });
paymentSchema.index({ businessId: 1, customerId: 1 });
paymentSchema.index({ businessId: 1, supplierId: 1 });
paymentSchema.index({ businessId: 1, saleId: 1 });
paymentSchema.index({ businessId: 1, purchaseId: 1 });

export const Payment = model<PaymentDocument>("Payment", paymentSchema);
