import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, businesses } from "@/db/schema";
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

    const accountList = await db
      .select()
      .from(accounts)
      .where(eq(accounts.businessId, bizId))
      .orderBy(desc(accounts.createdAt));

    return NextResponse.json({
      success: true,
      data: accountList,
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

    const [newAcc] = await db
      .insert(accounts)
      .values({
        businessId: bizId,
        shopId: body.shopId || null,
        name: body.name,
        type: body.type || "cash",
        accountNumber: body.accountNumber || null,
        currentBalancePaisa: body.openingBalancePaisa || 0,
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: newAcc,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
