import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  purchases,
  purchaseItems,
  suppliers,
  products,
  inventoryMovements,
  payments,
} from "@/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { BUSINESS_ID, SHOP_ID } from "@/lib/constants";
import { z } from "zod";

const purchaseItemSchema = z.object({
  productId: z.number(),
  quantity: z.number().min(1),
  unitPrice: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
});

const purchaseSchema = z.object({
  supplierId: z.number().optional().nullable(),
  items: z.array(purchaseItemSchema).min(1),
  discountAmount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  paidAmount: z.number().min(0),
  paymentMethod: z
    .enum(["cash", "bank", "bkash", "nagad", "rocket", "card", "other"])
    .default("cash"),
  notes: z.string().optional().nullable(),
  purchaseDate: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const conditions = [eq(purchases.businessId, BUSINESS_ID)];

    if (from) conditions.push(gte(purchases.purchaseDate, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59);
      conditions.push(lte(purchases.purchaseDate, toDate));
    }

    const rows = await db
      .select({
        id: purchases.id,
        invoiceNumber: purchases.invoiceNumber,
        supplierId: purchases.supplierId,
        supplierName: suppliers.name,
        supplierPhone: suppliers.phone,
        subtotal: purchases.subtotal,
        discountAmount: purchases.discountAmount,
        taxAmount: purchases.taxAmount,
        totalAmount: purchases.totalAmount,
        paidAmount: purchases.paidAmount,
        dueAmount: purchases.dueAmount,
        paymentMethod: purchases.paymentMethod,
        paymentStatus: purchases.paymentStatus,
        status: purchases.status,
        notes: purchases.notes,
        purchaseDate: purchases.purchaseDate,
      })
      .from(purchases)
      .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .where(and(...conditions))
      .orderBy(desc(purchases.purchaseDate))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(purchases)
      .where(and(...conditions));

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch purchases" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Calculate totals
    let subtotal = 0;
    const itemsProcessed = data.items.map((item) => {
      const lineTotal =
        Math.round(item.unitPrice * 100) * item.quantity -
        Math.round(item.discountAmount * 100);
      subtotal += lineTotal;
      return {
        ...item,
        unitPricePaisa: Math.round(item.unitPrice * 100),
        discountPaisa: Math.round(item.discountAmount * 100),
        lineTotal,
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
      .from(purchases)
      .where(eq(purchases.businessId, BUSINESS_ID));
    const invoiceNumber = `PUR-${String((count as number) + 1).padStart(4, "0")}`;

    const purchaseDate = data.purchaseDate
      ? new Date(data.purchaseDate)
      : new Date();

    // Create purchase
    const [newPurchase] = await db
      .insert(purchases)
      .values({
        businessId: BUSINESS_ID,
        shopId: SHOP_ID,
        supplierId: data.supplierId ?? null,
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
        purchaseDate,
      })
      .returning();

    // Create purchase items and update inventory
    for (const item of itemsProcessed) {
      await db.insert(purchaseItems).values({
        purchaseId: newPurchase.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPricePaisa,
        discountAmount: item.discountPaisa,
        taxAmount: 0,
        lineTotal: item.lineTotal,
      });

      // Increase stock and update average cost
      const [currentProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId));

      if (currentProduct) {
        const currentStockValue =
          currentProduct.currentStock * currentProduct.avgCost;
        const newStockValue = item.quantity * item.unitPricePaisa;
        const newTotalStock = currentProduct.currentStock + item.quantity;
        const newAvgCost =
          newTotalStock > 0
            ? Math.round((currentStockValue + newStockValue) / newTotalStock)
            : item.unitPricePaisa;

        await db
          .update(products)
          .set({
            currentStock: sql`${products.currentStock} + ${item.quantity}`,
            avgCost: newAvgCost,
            purchasePrice: item.unitPricePaisa,
            updatedAt: new Date(),
          })
          .where(eq(products.id, item.productId));
      }

      // Record inventory movement
      await db.insert(inventoryMovements).values({
        businessId: BUSINESS_ID,
        shopId: SHOP_ID,
        productId: item.productId,
        type: "purchase",
        quantity: item.quantity,
        unitCost: item.unitPricePaisa,
        referenceId: newPurchase.id,
        referenceType: "purchase",
      });
    }

    // Update supplier payable
    if (data.supplierId && dueAmount > 0) {
      await db
        .update(suppliers)
        .set({
          totalPurchases: sql`${suppliers.totalPurchases} + ${totalAmount}`,
          totalPaid: sql`${suppliers.totalPaid} + ${paidAmount}`,
          currentPayable: sql`${suppliers.currentPayable} + ${dueAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, data.supplierId));
    } else if (data.supplierId) {
      await db
        .update(suppliers)
        .set({
          totalPurchases: sql`${suppliers.totalPurchases} + ${totalAmount}`,
          totalPaid: sql`${suppliers.totalPaid} + ${paidAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, data.supplierId));
    }

    // Record payment
    if (paidAmount > 0 && data.supplierId) {
      await db.insert(payments).values({
        businessId: BUSINESS_ID,
        shopId: SHOP_ID,
        supplierId: data.supplierId,
        type: "supplier_payment",
        amount: paidAmount,
        paymentMethod: data.paymentMethod,
        reference: invoiceNumber,
        notes: `Payment for purchase ${invoiceNumber}`,
        paymentDate: purchaseDate,
      });
    }

    return NextResponse.json(
      { success: true, data: newPurchase },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to create purchase" },
      { status: 500 }
    );
  }
}
