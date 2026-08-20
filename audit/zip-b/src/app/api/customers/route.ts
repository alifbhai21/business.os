import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";
import { z } from "zod";

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  customerCode: z.string().optional().nullable(),
  openingBalance: z.number().min(0).default(0),
  creditLimit: z.number().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const withDue = searchParams.get("withDue") === "true";

    const conditions = [
      eq(customers.businessId, BUSINESS_ID),
      eq(customers.isActive, true),
    ];

    if (search) {
      conditions.push(
        sql`(${customers.name} ILIKE ${`%${search}%`} OR ${customers.phone} ILIKE ${`%${search}%`})`
      );
    }

    if (withDue) {
      conditions.push(sql`${customers.currentDue} > 0`);
    }

    const rows = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.createdAt));

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const openingBalancePaisa = Math.round(data.openingBalance * 100);

    const [customer] = await db
      .insert(customers)
      .values({
        businessId: BUSINESS_ID,
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        customerCode: data.customerCode ?? null,
        openingBalance: openingBalancePaisa,
        currentDue: openingBalancePaisa,
        creditLimit: Math.round(data.creditLimit * 100),
      })
      .returning();

    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to create customer" },
      { status: 500 }
    );
  }
}
