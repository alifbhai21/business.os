import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, businesses } from "@/db/schema";
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

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.businessId, bizId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
