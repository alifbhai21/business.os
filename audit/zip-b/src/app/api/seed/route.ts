import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  businesses,
  shops,
  categories,
  products,
  customers,
  suppliers,
  sales,
  saleItems,
  purchases,
  purchaseItems,
  payments,
  expenses,
  inventoryMovements,
} from "@/db/schema";
import { bdtToPaisa } from "@/lib/format";
import { sql } from "drizzle-orm";

export async function POST() {
  try {
    // Check if already seeded
    const existing = await db.select().from(businesses).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ success: true, message: "Already seeded" });
    }

    // Create business
    const [business] = await db
      .insert(businesses)
      .values({
        name: "Rahman Enterprise",
        type: "retail_wholesale",
        phone: "+880 1711-123456",
        email: "rahman@enterprise.bd",
        address: "123 Main Market, Dhaka, Bangladesh",
        currency: "BDT",
        taxRate: 0,
      })
      .returning();

    // Create shops
    const [mainShop, warehouse] = await db
      .insert(shops)
      .values([
        {
          businessId: business.id,
          name: "Main Branch",
          branchCode: "MB-001",
          address: "123 Main Market, Dhaka",
          phone: "+880 1711-123456",
          openingCash: bdtToPaisa(50000),
        },
        {
          businessId: business.id,
          name: "Warehouse",
          branchCode: "WH-001",
          address: "45 Industrial Area, Dhaka",
          phone: "+880 1711-654321",
          openingCash: bdtToPaisa(10000),
        },
      ])
      .returning();

    // Create categories
    const [electronics, clothing, groceries, cosmetics, hardware] = await db
      .insert(categories)
      .values([
        { businessId: business.id, name: "Electronics" },
        { businessId: business.id, name: "Clothing" },
        { businessId: business.id, name: "Groceries" },
        { businessId: business.id, name: "Cosmetics" },
        { businessId: business.id, name: "Hardware" },
      ])
      .returning();

    // Create products
    const [p1, p2, p3, p4, p5, p6, p7, p8] = await db
      .insert(products)
      .values([
        {
          businessId: business.id,
          categoryId: electronics.id,
          name: "Samsung 32\" LED TV",
          sku: "ELEC-001",
          barcode: "8801643012345",
          unit: "piece",
          purchasePrice: bdtToPaisa(18000),
          sellingPrice: bdtToPaisa(22000),
          wholesalePrice: bdtToPaisa(20000),
          avgCost: bdtToPaisa(18000),
          currentStock: 15,
          minStock: 3,
        },
        {
          businessId: business.id,
          categoryId: electronics.id,
          name: "Mobile Charger 65W",
          sku: "ELEC-002",
          barcode: "8801643012346",
          unit: "piece",
          purchasePrice: bdtToPaisa(450),
          sellingPrice: bdtToPaisa(650),
          wholesalePrice: bdtToPaisa(580),
          avgCost: bdtToPaisa(450),
          currentStock: 2,
          minStock: 10,
        },
        {
          businessId: business.id,
          categoryId: clothing.id,
          name: "Men's Polo Shirt",
          sku: "CLO-001",
          barcode: "8801643012347",
          unit: "piece",
          purchasePrice: bdtToPaisa(350),
          sellingPrice: bdtToPaisa(550),
          wholesalePrice: bdtToPaisa(480),
          avgCost: bdtToPaisa(350),
          currentStock: 45,
          minStock: 10,
        },
        {
          businessId: business.id,
          categoryId: groceries.id,
          name: "Basmati Rice (5kg)",
          sku: "GRO-001",
          barcode: "8801643012348",
          unit: "packet",
          purchasePrice: bdtToPaisa(380),
          sellingPrice: bdtToPaisa(450),
          avgCost: bdtToPaisa(380),
          currentStock: 120,
          minStock: 20,
        },
        {
          businessId: business.id,
          categoryId: groceries.id,
          name: "Cooking Oil (1L)",
          sku: "GRO-002",
          barcode: "8801643012349",
          unit: "liter",
          purchasePrice: bdtToPaisa(160),
          sellingPrice: bdtToPaisa(195),
          avgCost: bdtToPaisa(160),
          currentStock: 85,
          minStock: 20,
        },
        {
          businessId: business.id,
          categoryId: cosmetics.id,
          name: "Fair & Lovely Cream",
          sku: "COS-001",
          barcode: "8801643012350",
          unit: "piece",
          purchasePrice: bdtToPaisa(80),
          sellingPrice: bdtToPaisa(120),
          avgCost: bdtToPaisa(80),
          currentStock: 60,
          minStock: 15,
        },
        {
          businessId: business.id,
          categoryId: hardware.id,
          name: "PVC Pipe (10ft)",
          sku: "HRD-001",
          barcode: "8801643012351",
          unit: "piece",
          purchasePrice: bdtToPaisa(120),
          sellingPrice: bdtToPaisa(160),
          wholesalePrice: bdtToPaisa(140),
          avgCost: bdtToPaisa(120),
          currentStock: 0,
          minStock: 20,
        },
        {
          businessId: business.id,
          categoryId: hardware.id,
          name: "Electric Wire (100m)",
          sku: "HRD-002",
          barcode: "8801643012352",
          unit: "piece",
          purchasePrice: bdtToPaisa(850),
          sellingPrice: bdtToPaisa(1100),
          avgCost: bdtToPaisa(850),
          currentStock: 18,
          minStock: 5,
        },
      ])
      .returning();

    // Create customers
    const [c1, c2, c3, c4, c5] = await db
      .insert(customers)
      .values([
        {
          businessId: business.id,
          name: "Karim Brothers Store",
          phone: "+880 1812-111222",
          address: "45 Mirpur Road, Dhaka",
          customerCode: "CUST-001",
          openingBalance: bdtToPaisa(5000),
          currentDue: bdtToPaisa(5000),
        },
        {
          businessId: business.id,
          name: "Rahim Traders",
          phone: "+880 1912-333444",
          address: "12 Gulshan Ave, Dhaka",
          customerCode: "CUST-002",
          openingBalance: 0,
          currentDue: 0,
        },
        {
          businessId: business.id,
          name: "Nasrin Begum",
          phone: "+880 1611-555666",
          address: "78 Banani, Dhaka",
          customerCode: "CUST-003",
          openingBalance: 0,
          currentDue: 0,
        },
        {
          businessId: business.id,
          name: "Hasan Electronics",
          phone: "+880 1711-777888",
          address: "34 New Market, Dhaka",
          customerCode: "CUST-004",
          openingBalance: bdtToPaisa(12000),
          currentDue: bdtToPaisa(12000),
        },
        {
          businessId: business.id,
          name: "Walk-in Customer",
          phone: "",
          customerCode: "WALK-IN",
          openingBalance: 0,
          currentDue: 0,
        },
      ])
      .returning();

    // Create suppliers
    const [s1, s2, s3] = await db
      .insert(suppliers)
      .values([
        {
          businessId: business.id,
          name: "Dhaka Electronics Hub",
          phone: "+880 1811-999000",
          address: "Electronics Market, IDB Bhaban, Dhaka",
          company: "Dhaka Electronics Hub Ltd.",
          openingBalance: 0,
          currentPayable: 0,
        },
        {
          businessId: business.id,
          name: "Aarong Wholesale",
          phone: "+880 1911-000111",
          address: "Tejgaon Industrial Area, Dhaka",
          company: "BRAC Enterprises Ltd.",
          openingBalance: bdtToPaisa(15000),
          currentPayable: bdtToPaisa(15000),
        },
        {
          businessId: business.id,
          name: "City Groceries Supply",
          phone: "+880 1711-222333",
          address: "Karwan Bazar, Dhaka",
          company: "City Trading Co.",
          openingBalance: 0,
          currentPayable: 0,
        },
      ])
      .returning();

    // Helper to generate invoice numbers
    let saleInvoiceCounter = 1;
    let purchaseInvoiceCounter = 1;

    // Create 30 days of sample transactions
    const now = new Date();
    const transactions = [];

    for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
      const txDate = new Date(now);
      txDate.setDate(txDate.getDate() - daysAgo);
      txDate.setHours(10, 0, 0, 0);

      const salesForDay = Math.floor(Math.random() * 4) + 2; // 2-5 sales per day
      transactions.push({ type: "sales", date: txDate, count: salesForDay });
    }

    // Create sales
    for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
      const txDate = new Date(now);
      txDate.setDate(txDate.getDate() - daysAgo);
      txDate.setHours(10 + Math.floor(Math.random() * 8), 0, 0, 0);

      const numSales = Math.floor(Math.random() * 4) + 2;
      for (let s = 0; s < numSales; s++) {
        const isCredit = Math.random() < 0.3;
        const saleCustomer =
          isCredit ? [c1, c2, c4][Math.floor(Math.random() * 3)] : c5;
        const productList = [p1, p2, p3, p4, p5, p6, p8];
        const selectedProduct =
          productList[Math.floor(Math.random() * productList.length)];
        const qty = Math.floor(Math.random() * 3) + 1;
        const lineTotal = selectedProduct.sellingPrice * qty;
        const paidAmt = isCredit
          ? Math.round(lineTotal * (Math.random() * 0.6 + 0.2))
          : lineTotal;
        const dueAmt = lineTotal - paidAmt;

        const invoiceNo = `INV-${String(saleInvoiceCounter++).padStart(4, "0")}`;
        const saleTime = new Date(txDate);
        saleTime.setMinutes(s * 30);

        const [newSale] = await db
          .insert(sales)
          .values({
            businessId: business.id,
            shopId: mainShop.id,
            customerId: saleCustomer.id,
            invoiceNumber: invoiceNo,
            subtotal: lineTotal,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: lineTotal,
            paidAmount: paidAmt,
            dueAmount: dueAmt,
            paymentMethod: "cash",
            paymentStatus:
              dueAmt === 0 ? "paid" : paidAmt > 0 ? "partial" : "due",
            status: "completed",
            saleDate: saleTime,
          })
          .returning();

        await db.insert(saleItems).values({
          saleId: newSale.id,
          productId: selectedProduct.id,
          quantity: qty,
          unitPrice: selectedProduct.sellingPrice,
          costPrice: selectedProduct.avgCost,
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: lineTotal,
        });
      }
    }

    // Create purchases (every 5 days roughly)
    for (let daysAgo = 25; daysAgo >= 0; daysAgo -= 5) {
      const txDate = new Date(now);
      txDate.setDate(txDate.getDate() - daysAgo);
      txDate.setHours(9, 0, 0, 0);

      const invoiceNo = `PUR-${String(purchaseInvoiceCounter++).padStart(4, "0")}`;
      const qty1 = 10 + Math.floor(Math.random() * 20);
      const qty2 = 5 + Math.floor(Math.random() * 10);
      const lineTotal1 = p4.purchasePrice * qty1;
      const lineTotal2 = p5.purchasePrice * qty2;
      const grandTotal = lineTotal1 + lineTotal2;
      const paidAmt = Math.round(grandTotal * 0.8);
      const dueAmt = grandTotal - paidAmt;

      const [newPurchase] = await db
        .insert(purchases)
        .values({
          businessId: business.id,
          shopId: mainShop.id,
          supplierId: s3.id,
          invoiceNumber: invoiceNo,
          subtotal: grandTotal,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: grandTotal,
          paidAmount: paidAmt,
          dueAmount: dueAmt,
          paymentMethod: "cash",
          paymentStatus: dueAmt === 0 ? "paid" : "partial",
          status: "completed",
          purchaseDate: txDate,
        })
        .returning();

      await db.insert(purchaseItems).values([
        {
          purchaseId: newPurchase.id,
          productId: p4.id,
          quantity: qty1,
          unitPrice: p4.purchasePrice,
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: lineTotal1,
        },
        {
          purchaseId: newPurchase.id,
          productId: p5.id,
          quantity: qty2,
          unitPrice: p5.purchasePrice,
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: lineTotal2,
        },
      ]);
    }

    // Create some expenses
    const expenseData = [
      {
        category: "rent" as const,
        amount: bdtToPaisa(15000),
        daysAgo: 1,
        description: "Monthly shop rent",
      },
      {
        category: "electricity" as const,
        amount: bdtToPaisa(3500),
        daysAgo: 3,
        description: "Monthly electricity bill",
      },
      {
        category: "salary" as const,
        amount: bdtToPaisa(12000),
        daysAgo: 5,
        description: "Staff salary",
      },
      {
        category: "internet" as const,
        amount: bdtToPaisa(800),
        daysAgo: 7,
        description: "Internet bill",
      },
      {
        category: "transport" as const,
        amount: bdtToPaisa(1500),
        daysAgo: 10,
        description: "Delivery charges",
      },
      {
        category: "marketing" as const,
        amount: bdtToPaisa(2000),
        daysAgo: 12,
        description: "Facebook ad campaign",
      },
      {
        category: "packaging" as const,
        amount: bdtToPaisa(950),
        daysAgo: 15,
        description: "Packaging materials",
      },
      {
        category: "maintenance" as const,
        amount: bdtToPaisa(1200),
        daysAgo: 20,
        description: "AC servicing",
      },
    ];

    for (const exp of expenseData) {
      const expDate = new Date(now);
      expDate.setDate(expDate.getDate() - exp.daysAgo);
      expDate.setHours(11, 0, 0, 0);

      await db.insert(expenses).values({
        businessId: business.id,
        shopId: mainShop.id,
        category: exp.category,
        amount: exp.amount,
        paymentMethod: "cash",
        description: exp.description,
        expenseDate: expDate,
      });
    }

    // Create some customer payments
    for (const custInfo of [
      { customer: c1, amount: bdtToPaisa(3000), daysAgo: 2 },
      { customer: c4, amount: bdtToPaisa(8000), daysAgo: 4 },
      { customer: c2, amount: bdtToPaisa(5000), daysAgo: 8 },
    ]) {
      const payDate = new Date(now);
      payDate.setDate(payDate.getDate() - custInfo.daysAgo);
      await db.insert(payments).values({
        businessId: business.id,
        shopId: mainShop.id,
        customerId: custInfo.customer.id,
        type: "customer_payment",
        amount: custInfo.amount,
        paymentMethod: "cash",
        notes: "Due payment received",
        paymentDate: payDate,
      });

      // Update customer due
      await db
        .update(customers)
        .set({
          totalPaid: sql`${customers.totalPaid} + ${custInfo.amount}`,
          currentDue: sql`GREATEST(0, ${customers.currentDue} - ${custInfo.amount})`,
        })
        .where(sql`${customers.id} = ${custInfo.customer.id}`);
    }

    // Create inventory movements for opening stock
    await db.insert(inventoryMovements).values([
      {
        businessId: business.id,
        shopId: mainShop.id,
        productId: p1.id,
        type: "opening",
        quantity: 15,
        unitCost: p1.purchasePrice,
        notes: "Opening stock",
      },
      {
        businessId: business.id,
        shopId: mainShop.id,
        productId: p2.id,
        type: "opening",
        quantity: 2,
        unitCost: p2.purchasePrice,
        notes: "Opening stock",
      },
      {
        businessId: business.id,
        shopId: mainShop.id,
        productId: p3.id,
        type: "opening",
        quantity: 45,
        unitCost: p3.purchasePrice,
        notes: "Opening stock",
      },
      {
        businessId: business.id,
        shopId: mainShop.id,
        productId: p4.id,
        type: "opening",
        quantity: 120,
        unitCost: p4.purchasePrice,
        notes: "Opening stock",
      },
      {
        businessId: business.id,
        shopId: mainShop.id,
        productId: p5.id,
        type: "opening",
        quantity: 85,
        unitCost: p5.purchasePrice,
        notes: "Opening stock",
      },
      {
        businessId: business.id,
        shopId: mainShop.id,
        productId: p6.id,
        type: "opening",
        quantity: 60,
        unitCost: p6.purchasePrice,
        notes: "Opening stock",
      },
      {
        businessId: business.id,
        shopId: mainShop.id,
        productId: p7.id,
        type: "opening",
        quantity: 0,
        unitCost: p7.purchasePrice,
        notes: "Opening stock",
      },
      {
        businessId: business.id,
        shopId: mainShop.id,
        productId: p8.id,
        type: "opening",
        quantity: 18,
        unitCost: p8.purchasePrice,
        notes: "Opening stock",
      },
    ]);

    return NextResponse.json({
      success: true,
      message: "Database seeded successfully",
      data: {
        businessId: business.id,
        shopId: mainShop.id,
        warehouseId: warehouse.id,
      },
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
