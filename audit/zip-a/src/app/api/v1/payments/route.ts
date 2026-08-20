import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  payments,
  customers,
  suppliers,
  accounts,
  journalEntries,
  journalLines,
  auditLogs,
  businesses,
  shops,
} from "@/db/schema";
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

    const paymentList = await db
      .select()
      .from(payments)
      .where(eq(payments.businessId, bizId))
      .orderBy(desc(payments.createdAt))
      .limit(50);

    return NextResponse.json({
      success: true,
      data: paymentList,
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
    const type = body.type; // customer_payment | supplier_payment

    const [newPayment] = await db
      .insert(payments)
      .values({
        localId: body.localId || null,
        businessId: bizId,
        shopId,
        type,
        customerId: body.customerId || null,
        supplierId: body.supplierId || null,
        amountPaisa,
        method: body.method || "Cash",
        account: body.account || "Main Cash Box",
        note: body.note || null,
        createdBy: body.createdBy || "Owner",
      })
      .returning();

    const shopAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.businessId, bizId));

    let matchedAcc = shopAccounts.find(
      (a) => a.name.toLowerCase() === (body.account || "").toLowerCase()
    ) || shopAccounts[0];

    if (type === "customer_payment") {
      // 1. Reduce Customer Due
      if (body.customerId) {
        const [cust] = await db
          .select()
          .from(customers)
          .where(eq(customers.id, body.customerId));

        if (cust) {
          const newDue = Math.max(0, cust.currentDuePaisa - amountPaisa);
          await db
            .update(customers)
            .set({ currentDuePaisa: newDue })
            .where(eq(customers.id, body.customerId));
        }
      }
      // 2. Add cash to account
      if (matchedAcc) {
        await db
          .update(accounts)
          .set({
            currentBalancePaisa: matchedAcc.currentBalancePaisa + amountPaisa,
          })
          .where(eq(accounts.id, matchedAcc.id));
      }
    } else if (type === "supplier_payment") {
      // 1. Reduce Supplier Payable
      if (body.supplierId) {
        const [sup] = await db
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, body.supplierId));

        if (sup) {
          const newPayable = Math.max(0, sup.currentPayablePaisa - amountPaisa);
          await db
            .update(suppliers)
            .set({ currentPayablePaisa: newPayable })
            .where(eq(suppliers.id, body.supplierId));
        }
      }
      // 2. Deduct cash from account
      if (matchedAcc) {
        await db
          .update(accounts)
          .set({
            currentBalancePaisa: Math.max(0, matchedAcc.currentBalancePaisa - amountPaisa),
          })
          .where(eq(accounts.id, matchedAcc.id));
      }
    }

    return NextResponse.json({
      success: true,
      data: newPayment,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
