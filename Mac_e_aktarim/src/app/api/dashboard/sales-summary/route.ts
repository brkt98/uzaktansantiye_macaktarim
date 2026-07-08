import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/dashboard/sales-summary
// Tum satistaki proje/santiye + blok bazli ozet
// Sadece Mesale Evim projeleri (deneme/test verileri haric)
const isAllowed = (name: string) => {
  const n = name.trim().toLowerCase().replace(/ş/g, "s");
  return n.includes("mesale evim");
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    // 1) Pure-sales projeler
    const projects = await prisma.salesProject.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        blocks: {
          orderBy: { order: "asc" },
          include: {
            daires: { select: { id: true, status: true } },
          },
        },
      },
    });

    // 2) Site-attached santiyeler (Satis sayfasinda gizlenmemis)
    const sites = await prisma.constructionSite.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        config: true,
        blocks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            floors: {
              select: {
                units: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    const blockRows: {
      kind: "project" | "site";
      ownerId: string;
      ownerName: string;
      blockId: string;
      blockName: string;
      total: number;
      sold: number;
      reserved: number;
      available: number;
    }[] = [];

    let totalUnits = 0;
    let totalSold = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let totalLandOwner = 0;

    for (const p of projects) {
      if (!isAllowed(p.name)) continue;
      for (const b of p.blocks) {
        const total = b.daires.length;
        const sold = b.daires.filter((d) => d.status === "SOLD").length;
        const reserved = b.daires.filter((d) => d.status === "RESERVED").length;
        const available = b.daires.filter((d) => d.status === "AVAILABLE").length;
        const landOwner = b.daires.filter((d) => d.status === "LAND_OWNER").length;
        blockRows.push({
          kind: "project",
          ownerId: p.id,
          ownerName: p.name,
          blockId: b.id,
          blockName: b.name,
          total,
          sold,
          reserved,
          available,
        });
        totalUnits += total;
        totalSold += sold;
        totalReserved += reserved;
        totalAvailable += available;
        totalLandOwner += landOwner;
      }
    }

    // Site blok agregasyonu: SalesUnit'lerden status sayilari
    const visibleSites = sites.filter((s) => {
      if (!isAllowed(s.name)) return false;
      const cfg =
        s.config && typeof s.config === "object" && !Array.isArray(s.config)
          ? (s.config as Record<string, unknown>)
          : {};
      return cfg.salesHiddenFromSales !== true;
    });

    const allBlockIds = visibleSites.flatMap((s) => s.blocks.map((b) => b.id));
    const salesUnits = allBlockIds.length
      ? await prisma.salesUnit.findMany({
          where: { blockId: { in: allBlockIds } },
          select: { blockId: true, status: true },
        })
      : [];
    const statusByBlock = new Map<string, { sold: number; reserved: number; landOwner: number }>();
    for (const su of salesUnits) {
      const cur = statusByBlock.get(su.blockId) ?? { sold: 0, reserved: 0, landOwner: 0 };
      if (su.status === "SOLD") cur.sold += 1;
      else if (su.status === "RESERVED") cur.reserved += 1;
      else if (su.status === "LAND_OWNER") cur.landOwner += 1;
      statusByBlock.set(su.blockId, cur);
    }

    for (const s of visibleSites) {
      for (const b of s.blocks) {
        const total = b.floors.reduce((sum, f) => sum + f.units.length, 0);
        const st = statusByBlock.get(b.id) ?? { sold: 0, reserved: 0, landOwner: 0 };
        const sold = st.sold;
        const reserved = st.reserved;
        const landOwner = st.landOwner;
        const available = Math.max(0, total - sold - reserved - landOwner);
        if (total === 0) continue;
        blockRows.push({
          kind: "site",
          ownerId: s.id,
          ownerName: s.name,
          blockId: b.id,
          blockName: b.name,
          total,
          sold,
          reserved,
          available,
        });
        totalUnits += total;
        totalSold += sold;
        totalReserved += reserved;
        totalAvailable += available;
        totalLandOwner += landOwner;
      }
    }

    return NextResponse.json({
      totals: {
        totalUnits,
        totalSold,
        totalReserved,
        totalAvailable,
        totalLandOwner,
      },
      blocks: blockRows,
    });
  } catch (err) {
    console.error("Sales summary GET error:", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}
