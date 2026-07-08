import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// GET /api/warehouses - Tüm depoları listele
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const warehouses = await prisma.warehouse.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        materials: {
          include: {
            material: true,
            media: { orderBy: { createdAt: "asc" } },
          },
          orderBy: { material: { name: "asc" } },
        },
      },
    });

    return NextResponse.json({ warehouses });
  } catch (error) {
    console.error("Warehouses fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/warehouses - Yeni depo oluştur
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, sortOrder } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Depo adı gerekli" }, { status: 400 });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        name: name.trim(),
        sortOrder: sortOrder || 0,
      },
    });

    return NextResponse.json({ warehouse }, { status: 201 });
  } catch (error) {
    console.error("Warehouse create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
