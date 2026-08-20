import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  sales,
  saleItems,
  customers,
  products,
  inventoryMovements,
  payments,
} from "@/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { BUSINESS_ID, SHOP_ID } from "@/lib/constants";
import { z } from "zod";

const saleItemSchema = z.object({
  productId: z.number(),
  quantity: z.number().min(1),
  unitPrice: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
});

const saleSchema = z.object({
  customerId: z.number().optional().nullable(),
  items: z.array(saleItemSchema).min(1),
  discountAmount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  paidAmount: z.number().min(0),
  paymentMethod: z
    .enum(["cash", "bank", "bkash", "nagad", "rocket", "card", "other"])
    .default("cash"),
  notes: z.string().optional().nullable(),
  saleDate: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const conditions = [eq(sales.businessId, BUSINESS_ID)];

    if (from) conditions.push(gte(sales.saleDate, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59);
      conditions.push(lte(sales.saleDate, toDate));
    }

    const rows = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        customerId: sales.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        subtotal: sales.subtotal,
        discountAmount: sales.discountAmount,
        taxAmount: sales.taxAmount,
        totalAmount: sales.totalAmount,
        paidAmount: sales.paidAmount,
        dueAmount: sales.dueAmount,
        paymentMethod: sales.paymentMethod,
        paymentStatus: sales.paymentStatus,
        status: sales.status,
        notes: sales.notes,
        saleDate: sales.saleDate,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(sales.saleDate))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(sales)
      .where(and(...conditions));

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sales" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = saleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Fetch products for cost prices
    const productIds = data.items.map((i) => i.productId);
    const productRows = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.businessId, BUSINESS_ID),
          sql`${products.id} = ANY(${productIds})`
        )
      );

    const productMap = new Map(productRows.map((p) => [p.id, p]));

    // Calculate totals (all prices are in BDT from client, convert to paisa)
    let subtotal = 0;
    const itemsWithCost = data.items.map((item) => {
      const product = productMap.get(item.productId);
      const lineTotal =
        Math.round(item.unitPrice * 100) * item.quantity -
        Math.round(item.discountAmount * 100);
      subtotal += lineTotal;
      return {
        ...item,
        unitPricePaisa: Math.round(item.unitPrice * 100),
        discountPaisa: Math.round(item.discountAmount * 100),
        lineTotal,
        costPrice: product?.avgCost ?? 0,
      };
    });

    const discountPaisa = Math.round(data.discountAmount * 100);
    const taxPaisa = Math.round(data.taxAmount * 100);
    const totalAmount = subtotal - discountPaisa + taxPaisa;
    const paidAmount = Math.round(data.paidAmount * 100);
    const dueAmount = Math.max(0, totalAmount - paidAmount);

    // Generate invoice number
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sales)
      .where(eq(sales.businessId, BUSINESS_ID));
    const invoiceNumber = `INV-${String((count as number) + 1).padStart(4, "0")}`;

    const saleDate = data.saleDate ? new Date(data.saleDate) : new Date();

    // Create sale
    const [newSale] = await db
      .insert(sales)
      .values({
        businessId: BUSINESS_ID,
        shopId: SHOP_ID,
        customerId: data.customerId ?? null,
        invoiceNumber,
        subtotal,
        discountAmount: discountPaisa,
        taxAmount: taxPaisa,
        totalAmount,
        paidAmount,
        dueAmount,
        paymentMethod: data.paymentMethod,
        paymentStatus:
          dueAmount === 0 ? "paid" : paidAmount > 0 ? "partial" : "due",
        status: "completed",
        notes: data.notes ?? null,
        saleDate,
      })
      .returning();

    // Create sale items and update inventory
    for (const item of itemsWithCost) {
      await db.insert(saleItems).values({
        saleId: newSale.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPricePaisa,
        costPrice: item.costPrice,
        discountAmount: item.discountPaisa,
        taxAmount: 0,
        lineTotal: item.lineTotal,
      });

      // Decrease stock
      await db
        .update(products)
        .set({
          currentStock: sql`${products.currentStock} - ${item.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, item.productId));

      // Record inventory movement
      await db.insert(inventoryMovements).values({
        businessId: BUSINESS_ID,
        shopId: SHOP_ID,
        productId: item.productId,
        type: "sale",
        quantity: -item.quantity,
        unitCost: item.costPrice,
        referenceId: newSale.id,
        referenceType: "sale",
      });
    }

    // Update customer due if credit sale
    if (data.customerId && dueAmount > 0) {
      await db
        .update(customers)
        .set({
          totalPurchases: sql`${customers.totalPurchases} + ${totalAmount}`,
          totalPaid: sql`${customers.totalPaid} + ${paidAmount}`,
          currentDue: sql`${customers.currentDue} + ${dueAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, data.customerId));
    } else if (data.customerId) {
      await db
        .update(customers)
        .set({
          totalPurchases: sql`${customers.totalPurchases} + ${totalAmount}`,
          totalPaid: sql`${customers.totalPaid} + ${paidAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, data.customerId));
    }

    // Record payment if paid
    if (paidAmount > 0 && data.customerId) {
      await db.insert(payments).values({
        businessId: BUSINESS_ID,
        shopId: SHOP_ID,
        customerId: data.customerId,
        type: "customer_payment",
        amount: paidAmount,
        paymentMethod: data.paymentMethod,
        reference: invoiceNumber,
        notes: `Payment for sale ${invoiceNumber}`,
        paymentDate: saleDate,
      });
    }

    return NextResponse.json({ success: true, data: newSale }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to create sale" },
      { status: 500 }
    );
  }
}
