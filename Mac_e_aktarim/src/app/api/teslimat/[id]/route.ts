import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";

// GET /api/teslimat/[id] - Tek teslimat detayı (kalemler + her kalemin medyasıyla)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const teslimat = await prisma.teslimat.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true } },
        items: {
          include: {
            media: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    if (!teslimat) {
      return NextResponse.json({ error: "Teslimat bulunamadı" }, { status: 404 });
    }

    return NextResponse.json({ teslimat });
  } catch (error) {
    console.error("Teslimat get error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/teslimat/[id] - Teslimat güncelle
//
// Akıllı kalem güncelleme:
//   - body.items[].id varsa: mevcut kalemi güncelle (medya korunur)
//   - id yoksa: yeni kalem oluştur
//   - body'de olmayan eski kalemler: silinir (cascade ile medya da silinir)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "SITE_CHIEF", "MUHASEBE"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { irsaliyeNo, supplier, siteId, receivedBy, date, notes, items } = body;

    if (!receivedBy?.trim() || !date) {
      return NextResponse.json({ error: "Teslim alan ve tarih zorunludur" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "En az bir malzeme kalemi ekleyin" }, { status: 400 });
    }

    type IncomingItem = {
      id?: string | null;
      materialName: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      taxRate?: number;
    };
    const incoming = items as IncomingItem[];

    for (const item of incoming) {
      if (!item.materialName?.trim() || !item.unit?.trim() || !item.quantity || item.quantity <= 0 || item.unitPrice === undefined || item.unitPrice < 0) {
        return NextResponse.json({ error: "Tüm kalemlerde malzeme adı, birim, miktar ve fiyat gerekli" }, { status: 400 });
      }
    }

    const teslimat = await prisma.$transaction(async (tx) => {
      // Mevcut teslimat var mı?
      const existing = await tx.teslimat.findUnique({
        where: { id },
        include: { items: { select: { id: true } } },
      });
      if (!existing) throw new Error("Teslimat bulunamadı");

      const incomingIds = new Set(incoming.map((i) => i.id).filter(Boolean) as string[]);
      const toDelete = existing.items.filter((it) => !incomingIds.has(it.id)).map((it) => it.id);

      // Body'de olmayan eski kalemleri sil (medya cascade ile silinir)
      if (toDelete.length > 0) {
        await tx.teslimatItem.deleteMany({ where: { id: { in: toDelete } } });
      }

      // Mevcut kalemleri güncelle / yenileri oluştur
      for (const item of incoming) {
        const totalPrice = item.quantity * item.unitPrice;
        if (item.id && existing.items.some((it) => it.id === item.id)) {
          await tx.teslimatItem.update({
            where: { id: item.id },
            data: {
              materialName: item.materialName.trim(),
              unit: item.unit.trim(),
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice,
              taxRate: typeof item.taxRate === "number" ? item.taxRate : 0,
            },
          });
        } else {
          await tx.teslimatItem.create({
            data: {
              teslimatId: id,
              materialName: item.materialName.trim(),
              unit: item.unit.trim(),
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice,
              taxRate: typeof item.taxRate === "number" ? item.taxRate : 0,
            },
          });
        }
      }

      return tx.teslimat.update({
        where: { id },
        data: {
          irsaliyeNo: irsaliyeNo?.trim() || "",
          supplier: supplier?.trim() || null,
          siteId: siteId || null,
          receivedBy: receivedBy.trim(),
          date: new Date(date),
          notes: notes?.trim() || null,
        },
        include: {
          site: { select: { id: true, name: true } },
          items: {
            include: {
              media: { orderBy: { createdAt: "asc" } },
            },
          },
        },
      });
    });

    return NextResponse.json({ teslimat });
  } catch (error) {
    console.error("Teslimat update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/teslimat/[id] - Teslimat sil
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "SITE_CHIEF", "MUHASEBE"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.teslimat.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Teslimat delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
