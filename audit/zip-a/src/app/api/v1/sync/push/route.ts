import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  sales,
  saleItems,
  payments,
  expenses,
  products,
  customers,
  suppliers,
  accounts,
  syncEvents,
  businesses,
  shops,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceId, queue } = body; // queue is array of SyncOperation

    let bizList = await db.select().from(businesses).limit(1);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses).limit(1);
    }
    const bizId = bizList[0].id;
    const shopList = await db.select().from(shops).where(eq(shops.businessId, bizId));
    const defaultShopId = shopList[0].id;

    const syncedResults: any[] = [];

    if (Array.isArray(queue)) {
      for (const op of queue) {
        const { localId, type, payload } = op;

        if (type === "sale") {
          // Check if already processed
          const existing = await db
            .select()
            .from(sales)
            .where(eq(sales.localId, localId));

          if (existing.length > 0) {
            syncedResults.push({ localId, serverId: existing[0].id, status: "SYNCED" });
            continue;
          }

          const countRes = await db.select().from(sales).where(eq(sales.businessId, bizId));
          const invoiceNo = `INV-2026-${(countRes.length + 1).toString().padStart(3, "0")}`;

          const [newSale] = await db
            .insert(sales)
            .values({
              localId,
              businessId: bizId,
              shopId: payload.shopId || defaultShopId,
              invoiceNo,
              customerId: payload.customerId || null,
              customerName: payload.customerName || "Walk-in Customer",
              totalPaisa: payload.totalPaisa,
              discountPaisa: payload.discountPaisa || 0,
              paidPaisa: payload.paidPaisa,
              duePaisa: payload.duePaisa || 0,
              paymentMethod: payload.paymentMethod || "Cash",
              paymentAccount: payload.paymentAccount || "Main Cash Box",
              createdBy: payload.createdBy || "Offline Mobile",
            })
            .returning();

          if (payload.items && Array.isArray(payload.items)) {
            for (const item of payload.items) {
              await db.insert(saleItems).values({
                saleId: newSale.id,
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPricePaisa: item.unitPricePaisa,
                totalPaisa: item.totalPaisa,
              });

              // Reduce stock
              const [p] = await db.select().from(products).where(eq(products.id, item.productId));
              if (p) {
                await db
                  .update(products)
                  .set({ currentStock: Math.max(0, p.currentStock - item.quantity) })
                  .where(eq(products.id, item.productId));
              }
            }
          }

          // Update customer due if credit
          if (payload.customerId && payload.duePaisa > 0) {
            const [c] = await db.select().from(customers).where(eq(customers.id, payload.customerId));
            if (c) {
              await db
                .update(customers)
                .set({ currentDuePaisa: c.currentDuePaisa + payload.duePaisa })
                .where(eq(customers.id, payload.customerId));
            }
          }

          syncedResults.push({ localId, serverId: newSale.id, status: "SYNCED" });
        } else if (type === "expense") {
          const [newExp] = await db
            .insert(expenses)
            .values({
              localId,
              businessId: bizId,
              shopId: payload.shopId || defaultShopId,
              category: payload.category || "Other",
              amountPaisa: payload.amountPaisa,
              paymentAccount: payload.paymentAccount || "Main Cash Box",
              note: payload.note || "Offline Expense",
              createdBy: payload.createdBy || "Offline Mobile",
            })
            .returning();

          syncedResults.push({ localId, serverId: newExp.id, status: "SYNCED" });
        } else if (type === "payment") {
          const [newPay] = await db
            .insert(payments)
            .values({
              localId,
              businessId: bizId,
              shopId: payload.shopId || defaultShopId,
              type: payload.type,
              customerId: payload.customerId || null,
              supplierId: payload.supplierId || null,
              amountPaisa: payload.amountPaisa,
              method: payload.method || "Cash",
              account: payload.account || "Main Cash Box",
              note: payload.note || "Offline Payment",
              createdBy: payload.createdBy || "Offline Mobile",
            })
            .returning();

          syncedResults.push({ localId, serverId: newPay.id, status: "SYNCED" });
        }
      }
    }

    // Log Sync Event
    await db.insert(syncEvents).values({
      businessId: bizId,
      deviceId: deviceId || "DEV-MOBILE-001",
      action: "push",
      recordsProcessed: syncedResults.length,
      status: "success",
    });

    return NextResponse.json({
      success: true,
      data: {
        syncedCount: syncedResults.length,
        results: syncedResults,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
