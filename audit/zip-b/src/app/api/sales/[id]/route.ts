import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sales, saleItems, products, customers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [sale] = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        customerId: sales.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerAddress: customers.address,
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
      .where(
        and(eq(sales.id, parseInt(id)), eq(sales.businessId, BUSINESS_ID))
      );

    if (!sale) {
      return NextResponse.json(
        { success: false, error: "Sale not found" },
        { status: 404 }
      );
    }

    const items = await db
      .select({
        id: saleItems.id,
        productId: saleItems.productId,
        productName: products.name,
        productUnit: products.unit,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        costPrice: saleItems.costPrice,
        discountAmount: saleItems.discountAmount,
        taxAmount: saleItems.taxAmount,
        lineTotal: saleItems.lineTotal,
      })
      .from(saleItems)
      .leftJoin(products, eq(saleItems.productId, products.id))
      .where(eq(saleItems.saleId, parseInt(id)));

    return NextResponse.json({ success: true, data: { ...sale, items } });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sale" },
      { status: 500 }
    );
  }
}
