import { NextResponse } from "next/server";
import { seedInitialData } from "@/lib/seed-data";

export async function GET() {
  try {
    const biz = await seedInitialData();
    return NextResponse.json({
      success: true,
      data: biz,
      message: "Seed data initialized successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const biz = await seedInitialData();
    return NextResponse.json({
      success: true,
      data: biz,
      message: "Seed data initialized successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
