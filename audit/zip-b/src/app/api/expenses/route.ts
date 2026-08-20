import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { BUSINESS_ID, SHOP_ID } from "@/lib/constants";
import { z } from "zod";

const expenseSchema = z.object({
  category: z.enum([
    "rent",
    "salary",
    "electricity",
    "internet",
    "transport",
    "maintenance",
    "marketing",
    "packaging",
    "office",
    "other",
  ]),
  amount: z.number().min(0),
  paymentMethod: z
    .enum(["cash", "bank", "bkash", "nagad", "rocket", "card", "other"])
    .default("cash"),
  description: z.string().optional().nullable(),
  expenseDate: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const conditions = [eq(expenses.businessId, BUSINESS_ID)];

    if (from) conditions.push(gte(expenses.expenseDate, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59);
      conditions.push(lte(expenses.expenseDate, toDate));
    }

    const rows = await db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.expenseDate))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(...conditions));

    const [{ totalAmount }] = await db
      .select({ totalAmount: sql<number>`coalesce(sum(amount), 0)::int` })
      .from(expenses)
      .where(and(...conditions));

    return NextResponse.json({
      success: true,
      data: rows,
      meta: { total, totalAmount },
      pagination: { total, limit, offset },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = expenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const amountPaisa = Math.round(data.amount * 100);
    const expenseDate = data.expenseDate ? new Date(data.expenseDate) : new Date();

    const [expense] = await db
      .insert(expenses)
      .values({
        businessId: BUSINESS_ID,
        shopId: SHOP_ID,
        category: data.category,
        amount: amountPaisa,
        paymentMethod: data.paymentMethod,
        description: data.description ?? null,
        expenseDate,
      })
      .returning();

    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to create expense" },
      { status: 500 }
    );
  }
}
