export type BusinessType =
  | "Retail"
  | "Wholesale"
  | "Retail + Wholesale"
  | "Service"
  | "Distribution"
  | "Construction"
  | "Manufacturing"
  | "Other";

export type Role =
  | "Owner"
  | "Admin"
  | "Manager"
  | "Accountant"
  | "Salesperson"
  | "Inventory Manager"
  | "Viewer";

export type UnitType =
  | "Piece"
  | "Kg"
  | "Gram"
  | "Box"
  | "Liter"
  | "Meter"
  | "Feet"
  | "Dozen"
  | "Packet";

export type PaymentMethod =
  | "Cash"
  | "bKash"
  | "Nagad"
  | "Rocket"
  | "Bank"
  | "Card"
  | "Credit/Baki";

export type ExpenseCategory =
  | "Rent"
  | "Salary"
  | "Electricity"
  | "Internet"
  | "Transport"
  | "Maintenance"
  | "Marketing"
  | "Packaging"
  | "Office expense"
  | "Other";

export interface SyncOperation {
  localId: string;
  type: "sale" | "purchase" | "payment" | "expense" | "transfer";
  payload: any;
  createdAt: string;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
}

export interface BusinessDTO {
  id: string;
  name: string;
  businessType: BusinessType;
  address: string | null;
  phone: string | null;
  currency: string;
  taxRate: number;
  fiscalYear: string;
}

export interface ShopDTO {
  id: string;
  businessId: string;
  name: string;
  branchCode: string;
  address: string | null;
  phone: string | null;
  isWarehouse: boolean;
}

export interface ProductDTO {
  id: string;
  businessId: string;
  categoryId: string | null;
  name: string;
  sku: string;
  barcode: string | null;
  unit: UnitType;
  purchasePricePaisa: number;
  sellingPricePaisa: number;
  wholesalePricePaisa: number;
  minStock: number;
  currentStock: number;
  imageUrl?: string | null;
  isActive: boolean;
  categoryName?: string;
}

export interface CustomerDTO {
  id: string;
  businessId: string;
  shopId: string | null;
  name: string;
  phone: string;
  address: string | null;
  openingBalancePaisa: number;
  currentDuePaisa: number;
  creditLimitPaisa: number;
}

export interface SupplierDTO {
  id: string;
  businessId: string;
  shopId: string | null;
  name: string;
  phone: string;
  company: string | null;
  address: string | null;
  openingBalancePaisa: number;
  currentPayablePaisa: number;
}

export interface SaleItemInput {
  productId: string;
  productName: string;
  quantity: number;
  unitPricePaisa: number;
  totalPaisa: number;
}

export interface SaleDTO {
  id: string;
  localId?: string | null;
  businessId: string;
  shopId: string;
  invoiceNo: string;
  customerId?: string | null;
  customerName?: string | null;
  totalPaisa: number;
  discountPaisa: number;
  taxPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  paymentMethod: PaymentMethod;
  paymentAccount: string;
  notes?: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  items?: SaleItemInput[];
}

export interface ExpenseDTO {
  id: string;
  localId?: string | null;
  businessId: string;
  shopId: string;
  category: ExpenseCategory;
  amountPaisa: number;
  paymentAccount: string;
  note?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AccountDTO {
  id: string;
  businessId: string;
  shopId: string | null;
  name: string;
  type: "cash" | "bank" | "bkash" | "nagad" | "rocket";
  accountNumber: string | null;
  currentBalancePaisa: number;
}

export interface SummaryReportDTO {
  todaySalesPaisa: number;
  todaySalesCount: number;
  todayProfitPaisa: number;
  totalReceivablesPaisa: number;
  totalPayablesPaisa: number;
  totalCashPaisa: number;
  totalStockValuePaisa: number;
  lowStockCount: number;
  salesTrend: { date: string; sales: number; profit: number }[];
}
