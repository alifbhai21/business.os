import { NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, shops } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function GET() {
  try {
    let bizList = await db.select().from(businesses);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses);
    }

    const currentBiz = bizList[0];
    const shopList = await db
      .select()
      .from(shops)
      .where(eq(shops.businessId, currentBiz.id));

    return NextResponse.json({
      success: true,
      data: {
        business: currentBiz,
        shops: shopList,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
