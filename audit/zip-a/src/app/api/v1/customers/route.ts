import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, businesses, sales, payments } from "@/db/schema";
import { eq, desc, ilike, or, and } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("query") || "";
    const customerId = searchParams.get("id");

    let bizList = await db.select().from(businesses).limit(1);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses).limit(1);
    }
    const bizId = bizList[0].id;

    if (customerId) {
      const [customer] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.businessId, bizId)));

      const customerSales = await db
        .select()
        .from(sales)
        .where(eq(sales.customerId, customerId))
        .orderBy(desc(sales.createdAt));

      const customerPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.customerId, customerId))
        .orderBy(desc(payments.createdAt));

      return NextResponse.json({
        success: true,
        data: {
          customer,
          sales: customerSales,
          payments: customerPayments,
        },
      });
    }

    const customerList = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.businessId, bizId),
          query
            ? or(
                ilike(customers.name, `%${query}%`),
                ilike(customers.phone, `%${query}%`)
              )
            : undefined
        )
      )
      .orderBy(desc(customers.currentDuePaisa));

    return NextResponse.json({
      success: true,
      data: customerList,
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

    const openingDuePaisa = body.openingBalancePaisa || 0;

    const [newCust] = await db
      .insert(customers)
      .values({
        businessId: bizId,
        shopId: body.shopId || null,
        name: body.name,
        phone: body.phone,
        address: body.address || null,
        openingBalancePaisa: openingDuePaisa,
        currentDuePaisa: openingDuePaisa,
        creditLimitPaisa: body.creditLimitPaisa || 5000000, // default ৳50,000
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: newCust,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
