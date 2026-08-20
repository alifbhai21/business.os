import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  sales,
  saleItems,
  products,
  customers,
  accounts,
  inventoryMovements,
  journalEntries,
  journalLines,
  auditLogs,
  businesses,
  shops,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function GET(req: NextRequest) {
  try {
    let bizList = await db.select().from(businesses).limit(1);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses).limit(1);
    }
    const bizId = bizList[0].id;

    const salesList = await db
      .select()
      .from(sales)
      .where(eq(sales.businessId, bizId))
      .orderBy(desc(sales.createdAt))
      .limit(50);

    return NextResponse.json({
      success: true,
      data: salesList,
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

    const countRes = await db.select().from(sales).where(eq(sales.businessId, bizId));
    const invoiceNo = `INV-2026-${(countRes.length + 1).toString().padStart(3, "0")}`;

    const totalPaisa = body.totalPaisa;
    const paidPaisa = body.paidPaisa;
    const duePaisa = body.duePaisa || Math.max(0, totalPaisa - paidPaisa);

    // 1. Create Sale Record
    const [newSale] = await db
      .insert(sales)
      .values({
        localId: body.localId || null,
        businessId: bizId,
        shopId,
        invoiceNo,
        customerId: body.customerId || null,
        customerName: body.customerName || "Walk-in Customer",
        totalPaisa,
        discountPaisa: body.discountPaisa || 0,
        taxPaisa: body.taxPaisa || 0,
        paidPaisa,
        duePaisa,
        paymentMethod: body.paymentMethod || "Cash",
        paymentAccount: body.paymentAccount || "Main Cash Box",
        notes: body.notes || null,
        status: "completed",
        createdBy: body.createdBy || "Owner",
      })
      .returning();

    // 2. Insert Sale Items & Update Inventory
    if (body.items && Array.isArray(body.items)) {
      for (const item of body.items) {
        await db.insert(saleItems).values({
          saleId: newSale.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPricePaisa: item.unitPricePaisa,
          totalPaisa: item.totalPaisa,
        });

        // Deduct inventory
        const [prod] = await db
          .select()
          .from(products)
          .where(eq(products.id, item.productId));

        if (prod) {
          const newStock = Math.max(0, prod.currentStock - item.quantity);
          await db
            .update(products)
            .set({ currentStock: newStock })
            .where(eq(products.id, item.productId));

          await db.insert(inventoryMovements).values({
            businessId: bizId,
            shopId,
            productId: item.productId,
            type: "sale",
            quantityChange: -item.quantity,
            previousStock: prod.currentStock,
            newStock,
            referenceId: newSale.id,
            note: `Sale #${invoiceNo}`,
          });
        }
      }
    }

    // 3. Update Customer Balance if credit
    if (body.customerId && duePaisa > 0) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, body.customerId));

      if (cust) {
        await db
          .update(customers)
          .set({ currentDuePaisa: cust.currentDuePaisa + duePaisa })
          .where(eq(customers.id, body.customerId));
      }
    }

    // 4. Update Shop Account Cash Balance if paid
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
            currentBalancePaisa: matchedAccount.currentBalancePaisa + paidPaisa,
          })
          .where(eq(accounts.id, matchedAccount.id));
      }
    }

    // 5. Create Double Entry Accounting Journal
    const [journal] = await db
      .insert(journalEntries)
      .values({
        businessId: bizId,
        shopId,
        description: `Sale Invoice #${invoiceNo} (${body.customerName || "Walk-in"})`,
        referenceType: "sale",
        referenceId: newSale.id,
      })
      .returning();

    // Debit Cash/Bank for paid amount, Debit Customer Receivable for due
    if (paidPaisa > 0) {
      await db.insert(journalLines).values({
        journalEntryId: journal.id,
        accountName: `Asset: ${body.paymentAccount || "Cash"}`,
        accountType: "asset",
        debitPaisa: paidPaisa,
        creditPaisa: 0,
      });
    }
    if (duePaisa > 0) {
      await db.insert(journalLines).values({
        journalEntryId: journal.id,
        accountName: "Asset: Accounts Receivable (Customer Dues)",
        accountType: "asset",
        debitPaisa: duePaisa,
        creditPaisa: 0,
      });
    }
    // Credit Sales Revenue for total
    await db.insert(journalLines).values({
      journalEntryId: journal.id,
      accountName: "Revenue: Sales Revenue",
      accountType: "revenue",
      debitPaisa: 0,
      creditPaisa: totalPaisa,
    });

    // 6. Audit Log
    await db.insert(auditLogs).values({
      businessId: bizId,
      shopId,
      action: "SALE_CREATED",
      userPhone: "01711000111",
      details: `Created sale invoice ${invoiceNo} total ৳${totalPaisa / 100}`,
      recordId: newSale.id,
    });

    return NextResponse.json({
      success: true,
      data: newSale,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
