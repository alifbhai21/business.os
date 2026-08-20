import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { expenses, accounts, auditLogs, businesses, shops } from "@/db/schema";
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

    const expenseList = await db
      .select()
      .from(expenses)
      .where(eq(expenses.businessId, bizId))
      .orderBy(desc(expenses.createdAt))
      .limit(50);

    return NextResponse.json({
      success: true,
      data: expenseList,
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

    let shopId = body.shopId;
    if (!shopId) {
      const shopList = await db.select().from(shops).where(eq(shops.businessId, bizId)).limit(1);
      shopId = shopList[0].id;
    }

    const amountPaisa = body.amountPaisa;

    const [newExpense] = await db
      .insert(expenses)
      .values({
        localId: body.localId || null,
        businessId: bizId,
        shopId,
        category: body.category || "Other",
        amountPaisa,
        paymentAccount: body.paymentAccount || "Main Cash Box",
        note: body.note || null,
        receiptUrl: body.receiptUrl || null,
        createdBy: body.createdBy || "Owner",
      })
      .returning();

    // Deduct cash from selected shop account
    const shopAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.businessId, bizId));

    let matchedAcc = shopAccounts.find(
      (a) => a.name.toLowerCase() === (body.paymentAccount || "").toLowerCase()
    ) || shopAccounts[0];

    if (matchedAcc) {
      await db
        .update(accounts)
        .set({
          currentBalancePaisa: Math.max(0, matchedAcc.currentBalancePaisa - amountPaisa),
        })
        .where(eq(accounts.id, matchedAcc.id));
    }

    return NextResponse.json({
      success: true,
      data: newExpense,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
