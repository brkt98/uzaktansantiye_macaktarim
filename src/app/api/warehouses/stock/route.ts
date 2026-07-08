import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// POST /api/warehouses/stock - Depoya malzeme ekle/güncelle
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "SITE_CHIEF", "MUHASEBE"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { warehouseId, materialId, quantity, minStock, notes } = body;

    if (!warehouseId || !materialId) {
      return NextResponse.json({ error: "Depo ve malzeme ID gerekli" }, { status: 400 });
    }

    if (quantity === undefined || quantity === null || quantity < 0) {
      return NextResponse.json({ error: "Geçerli bir miktar girin" }, { status: 400 });
    }

    const warehouseMaterial = await prisma.warehouseMaterial.upsert({
      where: {
        warehouseId_materialId: {
          warehouseId,
          materialId,
        },
      },
      update: {
        quantity,
        minStock: minStock ?? undefined,
        notes: notes ?? undefined,
      },
      create: {
        warehouseId,
        materialId,
        quantity,
        minStock,
        notes,
      },
      include: {
        material: true,
        media: { orderBy: { createdAt: "asc" } },
      },
    });

    return NextResponse.json({ warehouseMaterial });
  } catch (error) {
    console.error("Stock update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/warehouses/stock - Depodan malzeme kaldır
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "SITE_CHIEF", "MUHASEBE"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID gerekli" }, { status: 400 });
    }

    const stock = await prisma.warehouseMaterial.findUnique({
      where: { id },
      include: { media: true },
    });

    if (!stock) {
      return NextResponse.json({ error: "Malzeme bulunamadı" }, { status: 404 });
    }

    const base = path.resolve(UPLOAD_DIR);
    for (const media of stock.media) {
      const abs = path.resolve(path.join(UPLOAD_DIR, media.url));
      if (abs.startsWith(base + path.sep)) {
        await fs.unlink(abs).catch(() => {});
      }
    }

    await prisma.warehouseMaterial.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Stock delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
