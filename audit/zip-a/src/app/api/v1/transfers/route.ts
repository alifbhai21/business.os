import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stockTransfers, products, inventoryMovements, businesses, shops } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function GET(req: NextRequest) {
  try {
    let bizList = await db.select().from(businesses).limit(1);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses).limit(1);
    }
    const bizId = bizList[0].id;

    const transferList = await db
      .select()
      .from(stockTransfers)
      .where(eq(stockTransfers.businessId, bizId))
      .orderBy(desc(stockTransfers.createdAt));

    return NextResponse.json({
      success: true,
      data: transferList,
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

    const [transfer] = await db
      .insert(stockTransfers)
      .values({
        businessId: bizId,
        sourceShopId: body.sourceShopId,
        destShopId: body.destShopId,
        productId: body.productId,
        quantity: body.quantity,
        status: "received", // Auto received for MVP
        notes: body.notes || "Branch stock transfer",
        createdBy: body.createdBy || "Owner",
      })
      .returning();

    // Log inventory movement
    const [prod] = await db.select().from(products).where(eq(products.id, body.productId));
    if (prod) {
      await db.insert(inventoryMovements).values([
        {
          businessId: bizId,
          shopId: body.sourceShopId,
          productId: body.productId,
          type: "transfer_out",
          quantityChange: -body.quantity,
          previousStock: prod.currentStock,
          newStock: Math.max(0, prod.currentStock - body.quantity),
          referenceId: transfer.id,
          note: `Transfer Out to Branch`,
        },
        {
          businessId: bizId,
          shopId: body.destShopId,
          productId: body.productId,
          type: "transfer_in",
          quantityChange: body.quantity,
          previousStock: prod.currentStock,
          newStock: prod.currentStock + body.quantity,
          referenceId: transfer.id,
          note: `Transfer In from Branch`,
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      data: transfer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
