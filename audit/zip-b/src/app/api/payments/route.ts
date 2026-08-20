import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payments, customers, suppliers } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { BUSINESS_ID, SHOP_ID } from "@/lib/constants";
import { z } from "zod";

const paymentSchema = z.object({
  type: z.enum(["customer_payment", "supplier_payment"]),
  customerId: z.number().optional().nullable(),
  supplierId: z.number().optional().nullable(),
  amount: z.number().min(1),
  paymentMethod: z
    .enum(["cash", "bank", "bkash", "nagad", "rocket", "card", "other"])
    .default("cash"),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paymentDate: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const conditions = [eq(payments.businessId, BUSINESS_ID)];
    if (type) conditions.push(eq(payments.type, type));

    const rows = await db
      .select({
        id: payments.id,
        type: payments.type,
        customerId: payments.customerId,
        customerName: customers.name,
        supplierId: payments.supplierId,
        supplierName: suppliers.name,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        reference: payments.reference,
        notes: payments.notes,
        paymentDate: payments.paymentDate,
      })
      .from(payments)
      .leftJoin(customers, eq(payments.customerId, customers.id))
      .leftJoin(suppliers, eq(payments.supplierId, suppliers.id))
      .where(and(...conditions))
      .orderBy(desc(payments.paymentDate))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch payments" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const amountPaisa = Math.round(data.amount * 100);
    const paymentDate = data.paymentDate
      ? new Date(data.paymentDate)
      : new Date();

    const [payment] = await db
      .insert(payments)
      .values({
        businessId: BUSINESS_ID,
        shopId: SHOP_ID,
        customerId: data.customerId ?? null,
        supplierId: data.supplierId ?? null,
        type: data.type,
        amount: amountPaisa,
        paymentMethod: data.paymentMethod,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        paymentDate,
      })
      .returning();

    // Update customer or supplier balances
    if (data.type === "customer_payment" && data.customerId) {
      await db
        .update(customers)
        .set({
          totalPaid: sql`${customers.totalPaid} + ${amountPaisa}`,
          currentDue: sql`GREATEST(0, ${customers.currentDue} - ${amountPaisa})`,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, data.customerId));
    } else if (data.type === "supplier_payment" && data.supplierId) {
      await db
        .update(suppliers)
        .set({
          totalPaid: sql`${suppliers.totalPaid} + ${amountPaisa}`,
          currentPayable: sql`GREATEST(0, ${suppliers.currentPayable} - ${amountPaisa})`,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, data.supplierId));
    }

    return NextResponse.json({ success: true, data: payment }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to record payment" },
      { status: 500 }
    );
  }
}
