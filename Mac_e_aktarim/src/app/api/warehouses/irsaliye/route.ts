import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";

// GET /api/warehouses/irsaliye - İrsaliyeleri listele
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId");

    const where = warehouseId ? { warehouseId } : {};

    const irsaliyeler = await prisma.irsaliye.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        items: {
          include: {
            warehouseMaterial: {
              include: {
                material: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ irsaliyeler });
  } catch (error) {
    console.error("Irsaliye fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/warehouses/irsaliye - Yeni irsaliye oluştur
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "MUHASEBE"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { warehouseId, irsaliyeNo, type, supplier, description, date, items } = body;

    if (!warehouseId || !irsaliyeNo?.trim() || !type || !date) {
      return NextResponse.json({ error: "Zorunlu alanları doldurun" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "En az bir malzeme kalemi ekleyin" }, { status: 400 });
    }

    // Validate type
    if (type !== "GIRIS" && type !== "CIKIS") {
      return NextResponse.json({ error: "Geçersiz irsaliye tipi" }, { status: 400 });
    }

    // Create irsaliye + items in a transaction, update stock
    const result = await prisma.$transaction(async (tx) => {
      const irsaliye = await tx.irsaliye.create({
        data: {
          warehouseId,
          irsaliyeNo: irsaliyeNo.trim(),
          type,
          supplier: supplier?.trim() || null,
          description: description?.trim() || null,
          date: new Date(date),
          items: {
            create: items.map((item: { warehouseMaterialId: string; quantity: number }) => ({
              warehouseMaterialId: item.warehouseMaterialId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: {
            include: {
              warehouseMaterial: {
                include: { material: true },
              },
            },
          },
        },
      });

      // Update stock quantities
      for (const item of items) {
        const delta = type === "GIRIS" ? item.quantity : -item.quantity;
        await tx.warehouseMaterial.update({
          where: { id: item.warehouseMaterialId },
          data: {
            quantity: { increment: delta },
          },
        });
      }

      return irsaliye;
    });

    return NextResponse.json({ irsaliye: result }, { status: 201 });
  } catch (error) {
    console.error("Irsaliye create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
