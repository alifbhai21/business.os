import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  sales,
  saleItems,
  purchases,
  expenses,
  products,
  customers,
  suppliers,
} from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "profit";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const now = new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    if (type === "profit") {
      // Sales summary
      const [salesSummary] = await db
        .select({
          totalRevenue: sql<number>`coalesce(sum(total_amount), 0)::int`,
          totalReceived: sql<number>`coalesce(sum(paid_amount), 0)::int`,
          totalDue: sql<number>`coalesce(sum(due_amount), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, BUSINESS_ID),
            gte(sales.saleDate, fromDate),
            lte(sales.saleDate, toDate)
          )
        );

      // Cost of goods sold
      const [cogsSummary] = await db
        .select({
          totalCogs: sql<number>`coalesce(sum(${saleItems.quantity} * ${saleItems.costPrice}), 0)::int`,
        })
        .from(sales)
        .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
        .where(
          and(
            eq(sales.businessId, BUSINESS_ID),
            gte(sales.saleDate, fromDate),
            lte(sales.saleDate, toDate)
          )
        );

      // Expenses summary
      const [expensesSummary] = await db
        .select({
          total: sql<number>`coalesce(sum(amount), 0)::int`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.businessId, BUSINESS_ID),
            gte(expenses.expenseDate, fromDate),
            lte(expenses.expenseDate, toDate)
          )
        );

      // Expenses by category
      const expensesByCategory = await db
        .select({
          category: expenses.category,
          total: sql<number>`coalesce(sum(amount), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.businessId, BUSINESS_ID),
            gte(expenses.expenseDate, fromDate),
            lte(expenses.expenseDate, toDate)
          )
        )
        .groupBy(expenses.category)
        .orderBy(sql`sum(amount) DESC`);

      // Purchases summary
      const [purchasesSummary] = await db
        .select({
          total: sql<number>`coalesce(sum(total_amount), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(purchases)
        .where(
          and(
            eq(purchases.businessId, BUSINESS_ID),
            gte(purchases.purchaseDate, fromDate),
            lte(purchases.purchaseDate, toDate)
          )
        );

      const grossProfit =
        (salesSummary?.totalRevenue ?? 0) - (cogsSummary?.totalCogs ?? 0);
      const netProfit = grossProfit - (expensesSummary?.total ?? 0);

      return NextResponse.json({
        success: true,
        data: {
          period: { from: fromDate, to: toDate },
          sales: salesSummary,
          cogs: cogsSummary,
          expenses: { ...expensesSummary, byCategory: expensesByCategory },
          purchases: purchasesSummary,
          grossProfit,
          netProfit,
          grossMargin:
            salesSummary?.totalRevenue
              ? Math.round((grossProfit / salesSummary.totalRevenue) * 100)
              : 0,
          netMargin:
            salesSummary?.totalRevenue
              ? Math.round((netProfit / salesSummary.totalRevenue) * 100)
              : 0,
        },
      });
    }

    if (type === "sales") {
      // Daily sales breakdown
      const dailySales = await db
        .select({
          date: sql<string>`date_trunc('day', sale_date)::date::text`,
          total: sql<number>`coalesce(sum(total_amount), 0)::int`,
          paid: sql<number>`coalesce(sum(paid_amount), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, BUSINESS_ID),
            gte(sales.saleDate, fromDate),
            lte(sales.saleDate, toDate)
          )
        )
        .groupBy(sql`date_trunc('day', sale_date)`)
        .orderBy(sql`date_trunc('day', sale_date)`);

      // Top products by revenue
      const topProducts = await db
        .select({
          productId: saleItems.productId,
          productName: products.name,
          totalQty: sql<number>`coalesce(sum(${saleItems.quantity}), 0)::int`,
          totalRevenue: sql<number>`coalesce(sum(${saleItems.lineTotal}), 0)::int`,
        })
        .from(saleItems)
        .leftJoin(sales, eq(saleItems.saleId, sales.id))
        .leftJoin(products, eq(saleItems.productId, products.id))
        .where(
          and(
            eq(sales.businessId, BUSINESS_ID),
            gte(sales.saleDate, fromDate),
            lte(sales.saleDate, toDate)
          )
        )
        .groupBy(saleItems.productId, products.name)
        .orderBy(sql`sum(${saleItems.lineTotal}) DESC`)
        .limit(10);

      // Top customers by purchase
      const topCustomers = await db
        .select({
          customerId: sales.customerId,
          customerName: customers.name,
          totalAmount: sql<number>`coalesce(sum(total_amount), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(
          and(
            eq(sales.businessId, BUSINESS_ID),
            gte(sales.saleDate, fromDate),
            lte(sales.saleDate, toDate),
            sql`${sales.customerId} IS NOT NULL`
          )
        )
        .groupBy(sales.customerId, customers.name)
        .orderBy(sql`sum(total_amount) DESC`)
        .limit(10);

      return NextResponse.json({
        success: true,
        data: {
          period: { from: fromDate, to: toDate },
          daily: dailySales,
          topProducts,
          topCustomers,
        },
      });
    }

    if (type === "inventory") {
      // Current stock with value
      const inventory = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          unit: products.unit,
          currentStock: products.currentStock,
          minStock: products.minStock,
          avgCost: products.avgCost,
          sellingPrice: products.sellingPrice,
          stockValue: sql<number>`(${products.currentStock} * ${products.avgCost})::int`,
          potentialRevenue: sql<number>`(${products.currentStock} * ${products.sellingPrice})::int`,
        })
        .from(products)
        .where(
          and(eq(products.businessId, BUSINESS_ID), eq(products.isActive, true))
        )
        .orderBy(products.name);

      const [summary] = await db
        .select({
          totalProducts: sql<number>`count(*)::int`,
          totalStockValue: sql<number>`coalesce(sum(current_stock * avg_cost), 0)::int`,
          lowStockCount: sql<number>`count(*) filter (where current_stock <= min_stock and min_stock > 0)::int`,
          outOfStockCount: sql<number>`count(*) filter (where current_stock = 0)::int`,
        })
        .from(products)
        .where(
          and(eq(products.businessId, BUSINESS_ID), eq(products.isActive, true))
        );

      return NextResponse.json({
        success: true,
        data: { inventory, summary },
      });
    }

    if (type === "receivables") {
      const receivables = await db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          totalPurchases: customers.totalPurchases,
          totalPaid: customers.totalPaid,
          currentDue: customers.currentDue,
          openingBalance: customers.openingBalance,
        })
        .from(customers)
        .where(
          and(
            eq(customers.businessId, BUSINESS_ID),
            eq(customers.isActive, true),
            sql`${customers.currentDue} > 0`
          )
        )
        .orderBy(sql`current_due DESC`);

      const [summary] = await db
        .select({
          totalDue: sql<number>`coalesce(sum(current_due), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(customers)
        .where(
          and(
            eq(customers.businessId, BUSINESS_ID),
            sql`${customers.currentDue} > 0`
          )
        );

      return NextResponse.json({
        success: true,
        data: { receivables, summary },
      });
    }

    if (type === "payables") {
      const payables = await db
        .select({
          id: suppliers.id,
          name: suppliers.name,
          phone: suppliers.phone,
          company: suppliers.company,
          totalPurchases: suppliers.totalPurchases,
          totalPaid: suppliers.totalPaid,
          currentPayable: suppliers.currentPayable,
        })
        .from(suppliers)
        .where(
          and(
            eq(suppliers.businessId, BUSINESS_ID),
            eq(suppliers.isActive, true),
            sql`${suppliers.currentPayable} > 0`
          )
        )
        .orderBy(sql`current_payable DESC`);

      const [summary] = await db
        .select({
          totalPayable: sql<number>`coalesce(sum(current_payable), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(suppliers)
        .where(
          and(
            eq(suppliers.businessId, BUSINESS_ID),
            sql`${suppliers.currentPayable} > 0`
          )
        );

      return NextResponse.json({
        success: true,
        data: { payables, summary },
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown report type" },
      { status: 400 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
