import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products, customers, suppliers, accounts, businesses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedInitialData } from "@/lib/seed-data";

export async function POST(req: NextRequest) {
  try {
    let bizList = await db.select().from(businesses).limit(1);
    if (bizList.length === 0) {
      await seedInitialData();
      bizList = await db.select().from(businesses).limit(1);
    }
    const bizId = bizList[0].id;

    const allProducts = await db.select().from(products).where(eq(products.businessId, bizId));
    const allCustomers = await db.select().from(customers).where(eq(customers.businessId, bizId));
    const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.businessId, bizId));
    const allAccounts = await db.select().from(accounts).where(eq(accounts.businessId, bizId));

    return NextResponse.json({
      success: true,
      data: {
        products: allProducts,
        customers: allCustomers,
        suppliers: allSuppliers,
        accounts: allAccounts,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
