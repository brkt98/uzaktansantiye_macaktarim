import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/sales/[siteId] -> Bir şantiyenin blok+daire yapısı + satış durumu
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { siteId } = await params;

    const site = await prisma.constructionSite.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        status: true,
        blocks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            order: true,
            floors: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                name: true,
                order: true,
                units: {
                  orderBy: { order: "asc" },
                  select: { id: true, name: true, order: true },
                },
              },
            },
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: "Şantiye bulunamadı" }, { status: 404 });
    }

    // Bu şantiyenin tüm sales unit kayıtlarını çek
    const salesUnits = await prisma.salesUnit.findMany({
      where: { siteId },
      include: {
        media: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            mimeType: true,
            title: true,
            description: true,
            createdAt: true,
          },
        },
      },
    });

    // Tum unit id'leri (Floor->Unit dahil)
    const allUnitIds = site.blocks.flatMap((b) =>
      b.floors.flatMap((f) => f.units.map((u) => u.id))
    );

    const [buyers, docs] = await Promise.all([
      prisma.buyer.findMany({
        where: { targetType: "unit", targetId: { in: allUnitIds } },
        include: {
          payments: { select: { amount: true } },
        },
      }),
      prisma.salesDocument.findMany({
        where: { targetType: "unit", targetId: { in: allUnitIds } },
        select: { targetId: true },
      }),
    ]);

    const buyerByUnit = new Map(buyers.map((b) => [b.targetId, b]));
    const docCountByUnit = new Map<string, number>();
    for (const d of docs) {
      docCountByUnit.set(d.targetId, (docCountByUnit.get(d.targetId) ?? 0) + 1);
    }

    // Block bazlı zenginleştir: her daire için sales status/price/media
    const blocks = site.blocks.map((b) => {
      const daires: {
        id: string;
        name: string;
        floorId: string;
        floorName: string;
        salesUnitId: string | null;
        status: "AVAILABLE" | "RESERVED" | "SOLD" | "LAND_OWNER";
        price: string | null;
        reservedFor: string | null;
        notes: string | null;
        mediaCount: number;
        hasMedia: boolean;
        hasDocuments: boolean;
        buyerName: string | null;
        buyerPhone: string | null;
        totalPaid: string | null;
        remainingAmount: string | null;
      }[] = [];

      for (const f of b.floors) {
        for (const u of f.units) {
          const su = salesUnits.find(
            (s) => s.blockId === b.id && s.daireName === u.name
          );
          const buyer = buyerByUnit.get(u.id);
          const totalPaid = buyer
            ? buyer.payments.reduce((s, p) => s + Number(p.amount), 0)
            : 0;
          const priceNum = su?.price ? Number(su.price) : null;
          const remaining =
            priceNum != null ? Math.max(0, priceNum - totalPaid) : null;
          const mediaCount = su?.media.length ?? 0;
          daires.push({
            id: u.id,
            name: u.name,
            floorId: f.id,
            floorName: f.name,
            salesUnitId: su?.id ?? null,
            status: (su?.status ?? "AVAILABLE") as
              | "AVAILABLE"
              | "RESERVED"
              | "SOLD"
              | "LAND_OWNER",
            price: su?.price ? su.price.toString() : null,
            reservedFor: su?.reservedFor ?? null,
            notes: su?.notes ?? null,
            mediaCount,
            hasMedia: mediaCount > 0,
            hasDocuments: (docCountByUnit.get(u.id) ?? 0) > 0,
            buyerName: buyer?.name ?? null,
            buyerPhone: buyer?.phone ?? null,
            totalPaid: buyer ? totalPaid.toFixed(2) : null,
            remainingAmount: remaining != null ? remaining.toFixed(2) : null,
          });
        }
      }

      const sold = daires.filter((d) => d.status === "SOLD").length;
      const reserved = daires.filter((d) => d.status === "RESERVED").length;
      const available = daires.filter((d) => d.status === "AVAILABLE").length;

      return {
        id: b.id,
        name: b.name,
        order: b.order,
        floors: b.floors.map((f) => ({ id: f.id, name: f.name })),
        daires,
        total: daires.length,
        sold,
        reserved,
        available,
      };
    });

    return NextResponse.json({
      site: {
        id: site.id,
        name: site.name,
        description: site.description,
        address: site.address,
        status: site.status,
      },
      blocks,
    });
  } catch (err) {
    console.error("GET /api/sales/[siteId] error:", err);
    return NextResponse.json({ error: "Veri alınamadı" }, { status: 500 });
  }
}

// DELETE /api/sales/[siteId] -> Aktif santiyeyi silmeden Satis sayfasindan gizle
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });
    }

    const { siteId } = await params;
    const site = await prisma.constructionSite.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        status: true,
        config: true,
        _count: { select: { blocks: true } },
      },
    });

    if (!site) {
      return NextResponse.json({ error: "Santiye bulunamadi" }, { status: 404 });
    }

    const currentConfig =
      site.config && typeof site.config === "object" && !Array.isArray(site.config)
        ? (site.config as Record<string, unknown>)
        : {};

    if (currentConfig.salesHiddenFromSales === true) {
      return NextResponse.json(
        { error: "Bu şantiye zaten Satış sayfasından gizlenmiş" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.trashItem.create({
        data: {
          siteId: site.id,
          siteName: site.name,
          itemType: "sales_project",
          itemName: site.name,
          deletedBy: user.id,
          deletedByName: `${user.firstName} ${user.lastName}`,
          originalData: {
            sourceType: "site_sales_card",
            siteId: site.id,
            name: site.name,
            description: site.description,
            address: site.address,
            status: site.status,
            blockCount: site._count.blocks,
            configBefore: currentConfig,
          },
        },
      });

      await tx.constructionSite.update({
        where: { id: site.id },
        data: {
          config: {
            ...currentConfig,
            salesHiddenFromSales: true,
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/sales/[siteId] error:", err);
    return NextResponse.json({ error: "Satistan kaldirilamadi" }, { status: 500 });
  }
}
