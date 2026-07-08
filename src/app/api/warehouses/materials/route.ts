import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";

// GET /api/warehouses/materials - Tüm malzemeleri listele
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const materials = await prisma.material.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ materials });
  } catch (error) {
    console.error("Materials fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/warehouses/materials - Yeni malzeme oluştur
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "SITE_CHIEF", "MUHASEBE"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, unit } = body;

    if (!name?.trim() || !unit?.trim()) {
      return NextResponse.json({ error: "Malzeme adı ve birimi gerekli" }, { status: 400 });
    }

    const material = await prisma.material.create({
      data: {
        name: name.trim(),
        unit: unit.trim(),
      },
    });

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    console.error("Material create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
