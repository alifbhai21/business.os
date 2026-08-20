import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  sales,
  saleItems,
  purchases,
  expenses,
  customers,
  suppliers,
  products,
} from "@/db/schema";
import { sql, and, gte, lte, eq } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    // Today's stats
    const [todaySales] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total_amount), 0)::int`,
        paid: sql<number>`coalesce(sum(paid_amount), 0)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, BUSINESS_ID),
          gte(sales.saleDate, today),
          lte(sales.saleDate, todayEnd)
        )
      );

    const [todayPurchases] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total_amount), 0)::int`,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.businessId, BUSINESS_ID),
          gte(purchases.purchaseDate, today),
          lte(purchases.purchaseDate, todayEnd)
        )
      );

    const [todayExpenses] = await db
      .select({
        total: sql<number>`coalesce(sum(amount), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.businessId, BUSINESS_ID),
          gte(expenses.expenseDate, today),
          lte(expenses.expenseDate, todayEnd)
        )
      );

    // Monthly stats
    const [monthlySales] = await db
      .select({
        total: sql<number>`coalesce(sum(total_amount), 0)::int`,
        paid: sql<number>`coalesce(sum(paid_amount), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, BUSINESS_ID),
          gte(sales.saleDate, monthStart),
          lte(sales.saleDate, monthEnd)
        )
      );

    const [monthlyPurchases] = await db
      .select({
        total: sql<number>`coalesce(sum(total_amount), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.businessId, BUSINESS_ID),
          gte(purchases.purchaseDate, monthStart),
          lte(purchases.purchaseDate, monthEnd)
        )
      );

    const [monthlyExpenses] = await db
      .select({
        total: sql<number>`coalesce(sum(amount), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.businessId, BUSINESS_ID),
          gte(expenses.expenseDate, monthStart),
          lte(expenses.expenseDate, monthEnd)
        )
      );

    // Totals
    const [totalReceivable] = await db
      .select({
        total: sql<number>`coalesce(sum(current_due), 0)::int`,
      })
      .from(customers)
      .where(eq(customers.businessId, BUSINESS_ID));

    const [totalPayable] = await db
      .select({
        total: sql<number>`coalesce(sum(current_payable), 0)::int`,
      })
      .from(suppliers)
      .where(eq(suppliers.businessId, BUSINESS_ID));

    // Stock value
    const [stockValue] = await db
      .select({
        total: sql<number>`coalesce(sum(current_stock * avg_cost), 0)::int`,
        totalItems: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(
        and(eq(products.businessId, BUSINESS_ID), eq(products.isActive, true))
      );

    // Low stock products
    const lowStockProducts = await db
      .select({
        id: products.id,
        name: products.name,
        currentStock: products.currentStock,
        minStock: products.minStock,
        unit: products.unit,
      })
      .from(products)
      .where(
        and(
          eq(products.businessId, BUSINESS_ID),
          eq(products.isActive, true),
          sql`${products.currentStock} <= ${products.minStock}`
        )
      )
      .limit(5);

    // Daily sales for last 7 days
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const dailySales = await db
      .select({
        date: sql<string>`date_trunc('day', sale_date)::date::text`,
        total: sql<number>`coalesce(sum(total_amount), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, BUSINESS_ID),
          gte(sales.saleDate, sevenDaysAgo)
        )
      )
      .groupBy(sql`date_trunc('day', sale_date)`)
      .orderBy(sql`date_trunc('day', sale_date)`);

    // Recent sales
    const recentSales = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        totalAmount: sales.totalAmount,
        paymentStatus: sales.paymentStatus,
        saleDate: sales.saleDate,
      })
      .from(sales)
      .where(eq(sales.businessId, BUSINESS_ID))
      .orderBy(sql`sale_date DESC`)
      .limit(5);

    // Top customers by due
    const topDueCustomers = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        currentDue: customers.currentDue,
      })
      .from(customers)
      .where(
        and(
          eq(customers.businessId, BUSINESS_ID),
          sql`${customers.currentDue} > 0`
        )
      )
      .orderBy(sql`current_due DESC`)
      .limit(5);

    // Calculate profit (gross profit from sale items cost vs revenue)
    const [monthlyProfit] = await db
      .select({
        revenue: sql<number>`coalesce(sum(${saleItems.lineTotal}), 0)::int`,
        cost: sql<number>`coalesce(sum(${saleItems.quantity} * ${saleItems.costPrice}), 0)::int`,
      })
      .from(sales)
      .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
      .where(
        and(
          eq(sales.businessId, BUSINESS_ID),
          gte(sales.saleDate, monthStart),
          lte(sales.saleDate, monthEnd)
        )
      );

    const grossProfit =
      (monthlyProfit?.revenue ?? 0) - (monthlyProfit?.cost ?? 0);
    const netProfit = grossProfit - (monthlyExpenses?.total ?? 0);

    return NextResponse.json({
      success: true,
      data: {
        today: {
          sales: todaySales,
          purchases: todayPurchases,
          expenses: todayExpenses,
        },
        monthly: {
          sales: monthlySales,
          purchases: monthlyPurchases,
          expenses: monthlyExpenses,
          grossProfit,
          netProfit,
        },
        totals: {
          receivable: totalReceivable?.total ?? 0,
          payable: totalPayable?.total ?? 0,
          stockValue: stockValue?.total ?? 0,
          totalProducts: stockValue?.totalItems ?? 0,
        },
        charts: {
          dailySales,
        },
        lists: {
          lowStockProducts,
          recentSales,
          topDueCustomers,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
