import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { eq, and, like, sql, desc } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(1),
  categoryId: z.number().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  unit: z.string().default("piece"),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  wholesalePrice: z.number().min(0).optional().default(0),
  minPrice: z.number().min(0).optional().default(0),
  currentStock: z.number().min(0).default(0),
  minStock: z.number().min(0).default(0),
  maxStock: z.number().min(0).default(0),
  description: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const categoryId = searchParams.get("categoryId");
    const lowStock = searchParams.get("lowStock") === "true";

    const conditions = [
      eq(products.businessId, BUSINESS_ID),
      eq(products.isActive, true),
    ];

    if (search) {
      conditions.push(
        sql`(${products.name} ILIKE ${`%${search}%`} OR ${products.sku} ILIKE ${`%${search}%`} OR ${products.barcode} ILIKE ${`%${search}%`})`
      );
    }

    if (categoryId) {
      conditions.push(eq(products.categoryId, parseInt(categoryId)));
    }

    if (lowStock) {
      conditions.push(sql`${products.currentStock} <= ${products.minStock}`);
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        brand: products.brand,
        unit: products.unit,
        purchasePrice: products.purchasePrice,
        sellingPrice: products.sellingPrice,
        wholesalePrice: products.wholesalePrice,
        avgCost: products.avgCost,
        currentStock: products.currentStock,
        minStock: products.minStock,
        maxStock: products.maxStock,
        isActive: products.isActive,
        categoryId: products.categoryId,
        categoryName: categories.name,
        createdAt: products.createdAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(products.createdAt));

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const [product] = await db
      .insert(products)
      .values({
        businessId: BUSINESS_ID,
        name: data.name,
        categoryId: data.categoryId ?? null,
        sku: data.sku ?? null,
        barcode: data.barcode ?? null,
        brand: data.brand ?? null,
        unit: data.unit,
        purchasePrice: Math.round(data.purchasePrice * 100),
        sellingPrice: Math.round(data.sellingPrice * 100),
        wholesalePrice: Math.round((data.wholesalePrice ?? 0) * 100),
        minPrice: Math.round((data.minPrice ?? 0) * 100),
        avgCost: Math.round(data.purchasePrice * 100),
        currentStock: data.currentStock,
        minStock: data.minStock,
        maxStock: data.maxStock,
        description: data.description ?? null,
      })
      .returning();

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to create product" },
      { status: 500 }
    );
  }
}
