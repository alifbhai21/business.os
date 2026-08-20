import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.number().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  unit: z.string().optional(),
  purchasePrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  wholesalePrice: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  maxStock: z.number().min(0).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.brand !== undefined) updateData.brand = data.brand;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.purchasePrice !== undefined) {
      updateData.purchasePrice = Math.round(data.purchasePrice * 100);
      updateData.avgCost = Math.round(data.purchasePrice * 100);
    }
    if (data.sellingPrice !== undefined)
      updateData.sellingPrice = Math.round(data.sellingPrice * 100);
    if (data.wholesalePrice !== undefined)
      updateData.wholesalePrice = Math.round(data.wholesalePrice * 100);
    if (data.minStock !== undefined) updateData.minStock = data.minStock;
    if (data.maxStock !== undefined) updateData.maxStock = data.maxStock;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(
        and(eq(products.id, parseInt(id)), eq(products.businessId, BUSINESS_ID))
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to update product" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Soft delete
    const [updated] = await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(eq(products.id, parseInt(id)), eq(products.businessId, BUSINESS_ID))
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to delete product" },
      { status: 500 }
    );
  }
}
