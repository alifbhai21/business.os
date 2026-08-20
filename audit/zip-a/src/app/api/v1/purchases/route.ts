import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  purchases,
  purchaseItems,
  products,
  suppliers,
  accounts,
  inventoryMovements,
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

    const purchaseList = await db
      .select()
      .from(purchases)
      .where(eq(purchases.businessId, bizId))
      .orderBy(desc(purchases.createdAt))
      .limit(50);

    return NextResponse.json({
      success: true,
      data: purchaseList,
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

    const countRes = await db.select().from(purchases).where(eq(purchases.businessId, bizId));
    const invoiceNo = `PUR-2026-${(countRes.length + 1).toString().padStart(3, "0")}`;

    const totalPaisa = body.totalPaisa;
    const paidPaisa = body.paidPaisa || 0;
    const duePaisa = body.duePaisa || Math.max(0, totalPaisa - paidPaisa);

    // 1. Create Purchase
    const [newPur] = await db
      .insert(purchases)
      .values({
        localId: body.localId || null,
        businessId: bizId,
        shopId,
        invoiceNo,
        supplierId: body.supplierId || null,
        supplierName: body.supplierName || "Direct Supplier",
        totalPaisa,
        discountPaisa: body.discountPaisa || 0,
        paidPaisa,
        duePaisa,
        paymentMethod: body.paymentMethod || "Cash",
        paymentAccount: body.paymentAccount || "Main Cash Box",
        notes: body.notes || null,
        status: "completed",
        createdBy: body.createdBy || "Owner",
      })
      .returning();

    // 2. Insert Purchase Items & Increase Stock
    if (body.items && Array.isArray(body.items)) {
      for (const item of body.items) {
        await db.insert(purchaseItems).values({
          purchaseId: newPur.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPricePaisa: item.unitPricePaisa,
          totalPaisa: item.totalPaisa,
        });

        // Add to inventory stock
        const [prod] = await db
          .select()
          .from(products)
          .where(eq(products.id, item.productId));

        if (prod) {
          const newStock = prod.currentStock + item.quantity;
          await db
            .update(products)
            .set({ currentStock: newStock })
            .where(eq(products.id, item.productId));

          await db.insert(inventoryMovements).values({
            businessId: bizId,
            shopId,
            productId: item.productId,
            type: "purchase",
            quantityChange: item.quantity,
            previousStock: prod.currentStock,
            newStock,
            referenceId: newPur.id,
            note: `Purchase #${invoiceNo}`,
          });
        }
      }
    }

    // 3. Update Supplier Payable if credit
    if (body.supplierId && duePaisa > 0) {
      const [sup] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, body.supplierId));

      if (sup) {
        await db
          .update(suppliers)
          .set({ currentPayablePaisa: sup.currentPayablePaisa + duePaisa })
          .where(eq(suppliers.id, body.supplierId));
      }
    }

    // 4. Deduct Cash/Bank balance if paid
    if (paidPaisa > 0) {
      const shopAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.businessId, bizId));

      let matchedAccount = shopAccounts.find(
        (a) => a.name.toLowerCase() === (body.paymentAccount || "").toLowerCase()
      ) || shopAccounts[0];

      if (matchedAccount) {
        await db
          .update(accounts)
          .set({
            currentBalancePaisa: Math.max(0, matchedAccount.currentBalancePaisa - paidPaisa),
          })
          .where(eq(accounts.id, matchedAccount.id));
      }
    }

    // 5. Accounting Journals
    const [journal] = await db
      .insert(journalEntries)
      .values({
        businessId: bizId,
        shopId,
        description: `Purchase #${invoiceNo} (${body.supplierName || "Supplier"})`,
        referenceType: "purchase",
        referenceId: newPur.id,
      })
      .returning();

    await db.insert(journalLines).values([
      {
        journalEntryId: journal.id,
        accountName: "Asset: Inventory Stock",
        accountType: "asset",
        debitPaisa: totalPaisa,
        creditPaisa: 0,
      },
    ]);

    if (paidPaisa > 0) {
      await db.insert(journalLines).values({
        journalEntryId: journal.id,
        accountName: `Asset: ${body.paymentAccount || "Cash"}`,
        accountType: "asset",
        debitPaisa: 0,
        creditPaisa: paidPaisa,
      });
    }

    if (duePaisa > 0) {
      await db.insert(journalLines).values({
        journalEntryId: journal.id,
        accountName: "Liability: Accounts Payable (Supplier Dues)",
        accountType: "liability",
        debitPaisa: 0,
        creditPaisa: duePaisa,
      });
    }

    return NextResponse.json({
      success: true,
      data: newPur,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
