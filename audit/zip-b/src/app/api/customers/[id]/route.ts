import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, sales, payments } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, parseInt(id)),
          eq(customers.businessId, BUSINESS_ID)
        )
      );

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    // Get recent transactions
    const recentSales = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        totalAmount: sales.totalAmount,
        paidAmount: sales.paidAmount,
        dueAmount: sales.dueAmount,
        paymentStatus: sales.paymentStatus,
        saleDate: sales.saleDate,
      })
      .from(sales)
      .where(
        and(
          eq(sales.customerId, parseInt(id)),
          eq(sales.businessId, BUSINESS_ID)
        )
      )
      .orderBy(desc(sales.saleDate))
      .limit(10);

    const recentPayments = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.customerId, parseInt(id)),
          eq(payments.businessId, BUSINESS_ID)
        )
      )
      .orderBy(desc(payments.paymentDate))
      .limit(10);

    return NextResponse.json({
      success: true,
      data: { customer, recentSales, recentPayments },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch customer" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const [updated] = await db
      .update(customers)
      .set({
        name: body.name,
        phone: body.phone,
        email: body.email,
        address: body.address,
        creditLimit: body.creditLimit
          ? Math.round(body.creditLimit * 100)
          : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customers.id, parseInt(id)),
          eq(customers.businessId, BUSINESS_ID)
        )
      )
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to update customer" },
      { status: 500 }
    );
  }
}
