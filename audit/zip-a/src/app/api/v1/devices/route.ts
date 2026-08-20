import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { devices, businesses, auditLogs } from "@/db/schema";
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

    const deviceList = await db
      .select()
      .from(devices)
      .where(eq(devices.businessId, bizId))
      .orderBy(desc(devices.createdAt));

    return NextResponse.json({
      success: true,
      data: deviceList,
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
    const { deviceId, status } = body;

    if (deviceId && status) {
      await db
        .update(devices)
        .set({ status })
        .where(eq(devices.id, deviceId));
    }

    return NextResponse.json({
      success: true,
      message: "Device access updated",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
