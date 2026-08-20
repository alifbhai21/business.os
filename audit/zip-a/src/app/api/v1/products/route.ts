import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products, categories, businesses } from "@/db/schema";
import { eq, desc, ilike, or, and, sql } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("query") || "";
    const barcode = searchParams.get("barcode");
    const lowStock = searchParams.get("lowStock");

    let bizList = await db.select().from(businesses).limit(1);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses).limit(1);
    }
    const bizId = bizList[0].id;

    let productQuery = db
      .select({
        id: products.id,
        businessId: products.businessId,
        categoryId: products.categoryId,
        categoryName: categories.name,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        unit: products.unit,
        purchasePricePaisa: products.purchasePricePaisa,
        sellingPricePaisa: products.sellingPricePaisa,
        wholesalePricePaisa: products.wholesalePricePaisa,
        minStock: products.minStock,
        currentStock: products.currentStock,
        imageUrl: products.imageUrl,
        isActive: products.isActive,
        createdAt: products.createdAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.businessId, bizId),
          eq(products.isActive, true),
          barcode ? eq(products.barcode, barcode) : undefined,
          query
            ? or(
                ilike(products.name, `%${query}%`),
                ilike(products.sku, `%${query}%`),
                ilike(products.barcode, `%${query}%`)
              )
            : undefined,
          lowStock === "true"
            ? sql`${products.currentStock} <= ${products.minStock}`
            : undefined
        )
      )
      .orderBy(desc(products.createdAt));

    const result = await productQuery;

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let bizList = await db.select().from(businesses).limit(1);
    const bizId = bizList[0].id;

    const [newProduct] = await db
      .insert(products)
      .values({
        businessId: bizId,
        categoryId: body.categoryId || null,
        name: body.name,
        sku: body.sku || `SKU-${Date.now().toString().slice(-6)}`,
        barcode: body.barcode || null,
        unit: body.unit || "Piece",
        purchasePricePaisa: body.purchasePricePaisa || 0,
        sellingPricePaisa: body.sellingPricePaisa || 0,
        wholesalePricePaisa: body.wholesalePricePaisa || body.sellingPricePaisa || 0,
        minStock: body.minStock || 5,
        currentStock: body.currentStock || 0,
        imageUrl: body.imageUrl || null,
        isActive: true,
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: newProduct,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
