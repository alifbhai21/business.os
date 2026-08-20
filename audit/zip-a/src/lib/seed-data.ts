import { db } from "@/db";
import {
  users,
  businesses,
  shops,
  accounts,
  categories,
  products,
  customers,
  suppliers,
  sales,
  saleItems,
  expenses,
  devices,
  auditLogs,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedInitialData() {
  // Check if business exists
  const existingBiz = await db.select().from(businesses).limit(1);
  if (existingBiz.length > 0) {
    return existingBiz[0];
  }

  const hashedPassword = await bcrypt.hash("password123", 10);

  // 1. Create User
  const [user] = await db
    .insert(users)
    .values({
      name: "Abdur Rahman",
      email: "owner@rahmanhardware.com",
      phone: "01711000111",
      passwordHash: hashedPassword,
      role: "Owner",
    })
    .returning();

  // 2. Create Business
  const [biz] = await db
    .insert(businesses)
    .values({
      name: "Rahman Hardware & Enterprise",
      businessType: "Retail + Wholesale",
      address: "Shop 14, New Market Super Market, Dhaka",
      phone: "01711000111",
      currency: "BDT ৳",
      taxRate: 0,
      fiscalYear: "1 July - 30 June",
    })
    .returning();

  // 3. Create Shops / Branches
  const [shopMain] = await db
    .insert(shops)
    .values({
      businessId: biz.id,
      name: "Dhaka Main Branch",
      branchCode: "DHK-01",
      address: "New Market, Dhaka",
      phone: "01711000111",
      isWarehouse: false,
    })
    .returning();

  const [shopCtg] = await db
    .insert(shops)
    .values({
      businessId: biz.id,
      name: "Chittagong Agrabad Outlet",
      branchCode: "CTG-01",
      address: "Agrabad C/A, Chittagong",
      phone: "01811000222",
      isWarehouse: false,
    })
    .returning();

  const [warehouse] = await db
    .insert(shops)
    .values({
      businessId: biz.id,
      name: "Gazipur Central Warehouse",
      branchCode: "WH-01",
      address: "Board Bazar, Gazipur",
      phone: "01911000333",
      isWarehouse: true,
    })
    .returning();

  // 4. Accounts (Cash, bKash, Nagad, Bank)
  await db.insert(accounts).values([
    {
      businessId: biz.id,
      shopId: shopMain.id,
      name: "Main Cash Box",
      type: "cash",
      currentBalancePaisa: 6500000, // ৳ 65,000
    },
    {
      businessId: biz.id,
      shopId: shopMain.id,
      name: "bKash Merchant (01711000111)",
      type: "bkash",
      accountNumber: "01711000111",
      currentBalancePaisa: 4250000, // ৳ 42,500
    },
    {
      businessId: biz.id,
      shopId: shopMain.id,
      name: "Nagad Personal (01811000222)",
      type: "nagad",
      accountNumber: "01811000222",
      currentBalancePaisa: 1820000, // ৳ 18,200
    },
    {
      businessId: biz.id,
      shopId: shopMain.id,
      name: "Dutch Bangla Bank Ltd (A/C: 1021204589)",
      type: "bank",
      accountNumber: "1021204589",
      currentBalancePaisa: 15000000, // ৳ 150,000
    },
  ]);

  // 5. Categories
  const [catElectric] = await db
    .insert(categories)
    .values({
      businessId: biz.id,
      name: "Electrical & Lighting",
      description: "Bulbs, cables, switches, sockets",
    })
    .returning();

  const [catSanitary] = await db
    .insert(categories)
    .values({
      businessId: biz.id,
      name: "Sanitary & Pipes",
      description: "PVC pipes, basins, water taps, fittings",
    })
    .returning();

  const [catHardware] = await db
    .insert(categories)
    .values({
      businessId: biz.id,
      name: "Tools & Hardware",
      description: "Drills, screws, grinders, hammers",
    })
    .returning();

  const [catPaints] = await db
    .insert(categories)
    .values({
      businessId: biz.id,
      name: "Paints & Wall Care",
      description: "Emulsions, primers, waterproofing",
    })
    .returning();

  // 6. Products
  const prod1 = await db.insert(products).values({
    businessId: biz.id,
    categoryId: catPaints.id,
    name: "Berger Robbialac Acrylic Emulsion 18L",
    sku: "PRD-PA-001",
    barcode: "890123456001",
    unit: "Piece",
    purchasePricePaisa: 420000, // ৳ 4,200
    sellingPricePaisa: 510000, // ৳ 5,100
    wholesalePricePaisa: 480000,
    minStock: 5,
    currentStock: 24,
  }).returning();

  const prod2 = await db.insert(products).values({
    businessId: biz.id,
    categoryId: catElectric.id,
    name: "BRB Cable 2.5 RM Single Core (100m)",
    sku: "PRD-EL-002",
    barcode: "890123456002",
    unit: "Box",
    purchasePricePaisa: 380000, // ৳ 3,800
    sellingPricePaisa: 450000, // ৳ 4,500
    wholesalePricePaisa: 420000,
    minStock: 10,
    currentStock: 15,
  }).returning();

  const prod3 = await db.insert(products).values({
    businessId: biz.id,
    categoryId: catElectric.id,
    name: "Super Star LED Bulb 15W B22",
    sku: "PRD-EL-003",
    barcode: "890123456003",
    unit: "Piece",
    purchasePricePaisa: 19000, // ৳ 190
    sellingPricePaisa: 26000, // ৳ 260
    wholesalePricePaisa: 23000,
    minStock: 20,
    currentStock: 85,
  }).returning();

  const prod4 = await db.insert(products).values({
    businessId: biz.id,
    categoryId: catSanitary.id,
    name: "RAK Ceramic Wash Basin Standard",
    sku: "PRD-SAN-004",
    barcode: "890123456004",
    unit: "Piece",
    purchasePricePaisa: 240000, // ৳ 2,400
    sellingPricePaisa: 320000, // ৳ 3,200
    wholesalePricePaisa: 290000,
    minStock: 10,
    currentStock: 4, // LOW STOCK ALERT
  }).returning();

  const prod5 = await db.insert(products).values({
    businessId: biz.id,
    categoryId: catSanitary.id,
    name: "PVC Pipe 4 Inch 10ft High Pressure",
    sku: "PRD-SAN-005",
    barcode: "890123456005",
    unit: "Piece",
    purchasePricePaisa: 45000, // ৳ 450
    sellingPricePaisa: 62000, // ৳ 620
    wholesalePricePaisa: 55000,
    minStock: 25,
    currentStock: 120,
  }).returning();

  const prod6 = await db.insert(products).values({
    businessId: biz.id,
    categoryId: catHardware.id,
    name: "Bosch Angle Grinder 4 Inch GWS 750",
    sku: "PRD-HW-006",
    barcode: "890123456006",
    unit: "Piece",
    purchasePricePaisa: 350000, // ৳ 3,500
    sellingPricePaisa: 420000, // ৳ 4,200
    wholesalePricePaisa: 390000,
    minStock: 5,
    currentStock: 3, // LOW STOCK ALERT
  }).returning();

  // 7. Customers
  const [cust1] = await db
    .insert(customers)
    .values({
      businessId: biz.id,
      shopId: shopMain.id,
      name: "Hafizur Rahman",
      phone: "01712001122",
      address: "Mirpur 10, Dhaka",
      openingBalancePaisa: 1250000,
      currentDuePaisa: 1250000, // ৳ 12,500
      creditLimitPaisa: 5000000,
    })
    .returning();

  const [cust2] = await db
    .insert(customers)
    .values({
      businessId: biz.id,
      shopId: shopMain.id,
      name: "Alamgir Hossain (Contractor)",
      phone: "01819334455",
      address: "Dhanmondi, Dhaka",
      openingBalancePaisa: 2840000,
      currentDuePaisa: 2840000, // ৳ 28,400
      creditLimitPaisa: 10000000,
    })
    .returning();

  const [cust3] = await db
    .insert(customers)
    .values({
      businessId: biz.id,
      shopId: shopMain.id,
      name: "Sumon Electric Store",
      phone: "01911445566",
      address: "Uttara Sector 7, Dhaka",
      openingBalancePaisa: 680000,
      currentDuePaisa: 680000, // ৳ 6,800
      creditLimitPaisa: 3000000,
    })
    .returning();

  // 8. Suppliers
  const [sup1] = await db
    .insert(suppliers)
    .values({
      businessId: biz.id,
      shopId: shopMain.id,
      name: "Berger Paints Bangladesh Ltd.",
      phone: "02-9881122",
      company: "Berger Paints BD",
      address: "Uttara, Dhaka",
      openingBalancePaisa: 4500000,
      currentPayablePaisa: 4500000, // ৳ 45,000
    })
    .returning();

  const [sup2] = await db
    .insert(suppliers)
    .values({
      businessId: biz.id,
      shopId: shopMain.id,
      name: "BRB Cable Industries Ltd.",
      phone: "02-9556677",
      company: "BRB Group",
      address: "Kushtia / Dhaka",
      openingBalancePaisa: 3200000,
      currentPayablePaisa: 3200000, // ৳ 32,000
    })
    .returning();

  // 9. Initial Sample Sale
  const [sampleSale] = await db
    .insert(sales)
    .values({
      businessId: biz.id,
      shopId: shopMain.id,
      invoiceNo: "INV-2026-001",
      customerId: cust1.id,
      customerName: cust1.name,
      totalPaisa: 1020000, // ৳ 10,200
      discountPaisa: 20000, // ৳ 200
      taxPaisa: 0,
      paidPaisa: 500000, // ৳ 5,000 cash paid
      duePaisa: 500000, // ৳ 5,000 added to due
      paymentMethod: "Cash",
      paymentAccount: "Main Cash Box",
      notes: "Acrylic emulsion paint & bulbs sale",
      status: "completed",
      createdBy: "Abdur Rahman",
    })
    .returning();

  await db.insert(saleItems).values([
    {
      saleId: sampleSale.id,
      productId: prod1[0].id,
      productName: prod1[0].name,
      quantity: 2,
      unitPricePaisa: 510000,
      totalPaisa: 1020000,
    },
  ]);

  // 10. Sample Expenses
  await db.insert(expenses).values([
    {
      businessId: biz.id,
      shopId: shopMain.id,
      category: "Rent",
      amountPaisa: 2500000, // ৳ 25,000
      paymentAccount: "Main Cash Box",
      note: "Shop Rent - March 2026",
      createdBy: "Abdur Rahman",
    },
    {
      businessId: biz.id,
      shopId: shopMain.id,
      category: "Electricity",
      amountPaisa: 340000, // ৳ 3,400
      paymentAccount: "bKash Merchant (01711000111)",
      note: "DESCO Electricity bill",
      createdBy: "Abdur Rahman",
    },
  ]);

  // 11. Registered Devices
  await db.insert(devices).values([
    {
      businessId: biz.id,
      shopId: shopMain.id,
      deviceName: "Samsung Galaxy A55 5G (Android 14)",
      deviceId: "DEV-ANDROID-001",
      userPhone: "01711000111",
      appVersion: "1.0.0-MVP",
      status: "active",
    },
    {
      businessId: biz.id,
      shopId: shopCtg.id,
      deviceName: "Redmi Note 13 Pro (Android 13)",
      deviceId: "DEV-ANDROID-002",
      userPhone: "01811000222",
      appVersion: "1.0.0-MVP",
      status: "active",
    },
  ]);

  // 12. Audit Log
  await db.insert(auditLogs).values([
    {
      businessId: biz.id,
      shopId: shopMain.id,
      action: "BUSINESS_INITIALIZED",
      userPhone: "01711000111",
      details: "Initial business setup & opening stock registered.",
      branch: "Dhaka Main Branch",
    },
  ]);

  return biz;
}
