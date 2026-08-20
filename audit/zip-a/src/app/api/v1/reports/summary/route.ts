import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  sales,
  saleItems,
  expenses,
  customers,
  suppliers,
  accounts,
  products,
  businesses,
} from "@/db/schema";
import { eq, sql, gte, lte } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function GET(req: NextRequest) {
  try {
    let bizList = await db.select().from(businesses).limit(1);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses).limit(1);
    }
    const bizId = bizList[0].id;

    const allSales = await db.select().from(sales).where(eq(sales.businessId, bizId));
    const allExpenses = await db.select().from(expenses).where(eq(expenses.businessId, bizId));
    const allCustomers = await db.select().from(customers).where(eq(customers.businessId, bizId));
    const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.businessId, bizId));
    const allAccounts = await db.select().from(accounts).where(eq(accounts.businessId, bizId));
    const allProducts = await db.select().from(products).where(eq(products.businessId, bizId));

    // Calculate Today's Sales
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySalesList = allSales.filter((s) => new Date(s.createdAt) >= today);
    const todaySalesPaisa = todaySalesList.reduce((acc, s) => acc + s.totalPaisa, 0);
    const todaySalesCount = todaySalesList.length;

    // Calculate Total Customer Receivables
    const totalReceivablesPaisa = allCustomers.reduce((acc, c) => acc + c.currentDuePaisa, 0);

    // Calculate Total Supplier Payables
    const totalPayablesPaisa = allSuppliers.reduce((acc, s) => acc + s.currentPayablePaisa, 0);

    // Calculate Cash Balance
    const totalCashPaisa = allAccounts.reduce((acc, a) => acc + a.currentBalancePaisa, 0);

    // Calculate Stock Value & Low Stock Count
    let totalStockValuePaisa = 0;
    let lowStockCount = 0;
    for (const p of allProducts) {
      totalStockValuePaisa += p.currentStock * p.purchasePricePaisa;
      if (p.currentStock <= p.minStock) {
        lowStockCount++;
      }
    }

    // Estimate Profit: Estimated Margin (~22%) - Today Expenses
    const todayExpenses = allExpenses
      .filter((e) => new Date(e.createdAt) >= today)
      .reduce((acc, e) => acc + e.amountPaisa, 0);

    const todayProfitPaisa = Math.max(0, Math.round(todaySalesPaisa * 0.22) - todayExpenses);

    // Build 7-day Sales Trend
    const salesTrend: { date: string; sales: number; profit: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);

      const daySales = allSales
        .filter((s) => {
          const t = new Date(s.createdAt);
          return t >= dayStart && t <= dayEnd;
        })
        .reduce((acc, s) => acc + s.totalPaisa / 100, 0);

      salesTrend.push({
        date: dateStr,
        sales: daySales,
        profit: Math.round(daySales * 0.22),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        todaySalesPaisa,
        todaySalesCount,
        todayProfitPaisa,
        totalReceivablesPaisa,
        totalPayablesPaisa,
        totalCashPaisa,
        totalStockValuePaisa,
        lowStockCount,
        salesTrend,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
