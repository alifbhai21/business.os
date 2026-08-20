import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { suppliers, businesses, purchases, payments } from "@/db/schema";
import { eq, desc, ilike, or, and } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("query") || "";
    const supplierId = searchParams.get("id");

    let bizList = await db.select().from(businesses).limit(1);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses).limit(1);
    }
    const bizId = bizList[0].id;

    if (supplierId) {
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, supplierId), eq(suppliers.businessId, bizId)));

      const supplierPurchases = await db
        .select()
        .from(purchases)
        .where(eq(purchases.supplierId, supplierId))
        .orderBy(desc(purchases.createdAt));

      const supplierPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.supplierId, supplierId))
        .orderBy(desc(payments.createdAt));

      return NextResponse.json({
        success: true,
        data: {
          supplier,
          purchases: supplierPurchases,
          payments: supplierPayments,
        },
      });
    }

    const supplierList = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.businessId, bizId),
          query
            ? or(
                ilike(suppliers.name, `%${query}%`),
                ilike(suppliers.phone, `%${query}%`),
                ilike(suppliers.company, `%${query}%`)
              )
            : undefined
        )
      )
      .orderBy(desc(suppliers.currentPayablePaisa));

    return NextResponse.json({
      success: true,
      data: supplierList,
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

    const openingPayablePaisa = body.openingBalancePaisa || 0;

    const [newSup] = await db
      .insert(suppliers)
      .values({
        businessId: bizId,
        shopId: body.shopId || null,
        name: body.name,
        phone: body.phone,
        company: body.company || null,
        address: body.address || null,
        openingBalancePaisa: openingPayablePaisa,
        currentPayablePaisa: openingPayablePaisa,
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: newSup,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
