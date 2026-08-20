import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";
import { z } from "zod";

const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  openingBalance: z.number().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";

    const conditions = [
      eq(suppliers.businessId, BUSINESS_ID),
      eq(suppliers.isActive, true),
    ];

    if (search) {
      conditions.push(
        sql`(${suppliers.name} ILIKE ${`%${search}%`} OR ${suppliers.phone} ILIKE ${`%${search}%`})`
      );
    }

    const rows = await db
      .select()
      .from(suppliers)
      .where(and(...conditions))
      .orderBy(desc(suppliers.createdAt));

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = supplierSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const openingBalancePaisa = Math.round(data.openingBalance * 100);

    const [supplier] = await db
      .insert(suppliers)
      .values({
        businessId: BUSINESS_ID,
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        company: data.company ?? null,
        openingBalance: openingBalancePaisa,
        currentPayable: openingBalancePaisa,
      })
      .returning();

    return NextResponse.json({ success: true, data: supplier }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to create supplier" },
      { status: 500 }
    );
  }
}
