import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ success: true, status: "ok", db: "connected" });
  } catch {
    return NextResponse.json(
      { success: false, status: "error", db: "disconnected" },
      { status: 500 }
    );
  }
}
