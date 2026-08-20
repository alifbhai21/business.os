export const BUSINESS_ID = 1; // Single business for MVP demo
export const SHOP_ID = 1; // Default shop

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "rocket", label: "Rocket" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "rent", label: "Rent" },
  { value: "salary", label: "Salary" },
  { value: "electricity", label: "Electricity" },
  { value: "internet", label: "Internet" },
  { value: "transport", label: "Transport" },
  { value: "maintenance", label: "Maintenance" },
  { value: "marketing", label: "Marketing" },
  { value: "packaging", label: "Packaging" },
  { value: "office", label: "Office Expense" },
  { value: "other", label: "Other" },
] as const;

export const UNITS = [
  { value: "piece", label: "Piece" },
  { value: "box", label: "Box" },
  { value: "packet", label: "Packet" },
  { value: "kg", label: "Kg" },
  { value: "gram", label: "Gram" },
  { value: "liter", label: "Liter" },
  { value: "meter", label: "Meter" },
  { value: "feet", label: "Feet" },
  { value: "dozen", label: "Dozen" },
] as const;

export const BUSINESS_TYPES = [
  { value: "retail", label: "Retail" },
  { value: "wholesale", label: "Wholesale" },
  { value: "retail_wholesale", label: "Retail + Wholesale" },
  { value: "service", label: "Service" },
  { value: "distribution", label: "Distribution" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "restaurant", label: "Restaurant" },
  { value: "online", label: "Online Business" },
  { value: "construction", label: "Construction" },
  { value: "other", label: "Other" },
] as const;
