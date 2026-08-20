import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BUSINESS_ID } from "@/lib/constants";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.businessId, BUSINESS_ID))
      .orderBy(categories.name);

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description } = await req.json();
    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      );
    }

    const [cat] = await db
      .insert(categories)
      .values({ businessId: BUSINESS_ID, name, description })
      .returning();

    return NextResponse.json({ success: true, data: cat }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to create category" },
      { status: 500 }
    );
  }
}
