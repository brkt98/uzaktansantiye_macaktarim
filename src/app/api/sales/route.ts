import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/sales -> Satış için kullanılabilecek şantiye listesi (her şantiye otomatik proje)
// Her proje için özet: toplam daire, satılan, rezerve, boş, toplam fiyat
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const sites = await prisma.constructionSite.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        status: true,
        startDate: true,
        config: true,
        _count: { select: { blocks: true } },
      },
    });

    // Tüm sales unit'leri tek seferde çek
    const allUnits = await prisma.salesUnit.findMany({
      select: { siteId: true, status: true, price: true },
    });

    const siteProjects = sites.filter((s) => {
      const config = s.config;
      return !(
        config &&
        typeof config === "object" &&
        !Array.isArray(config) &&
        (config as Record<string, unknown>).salesHiddenFromSales === true
      );
    }).map((s) => {
      const units = allUnits.filter((u) => u.siteId === s.id);
      const sold = units.filter((u) => u.status === "SOLD").length;
      const reserved = units.filter((u) => u.status === "RESERVED").length;
      const available = units.filter((u) => u.status === "AVAILABLE").length;
      return {
        type: "site" as const,
        id: s.id,
        name: s.name,
        description: s.description,
        address: s.address,
        status: s.status,
        startDate: s.startDate,
        blockCount: s._count.blocks,
        unitsTotal: units.length,
        sold,
        reserved,
        available,
      };
    });

    // Sadece-satış projeleri
    const salesOnly = await prisma.salesProject.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        blocks: {
          select: {
            _count: { select: { daires: true } },
            daires: { select: { status: true } },
          },
        },
      },
    });

    const projectProjects = salesOnly.map((p) => {
      const allDaires = p.blocks.flatMap((b) => b.daires);
      const sold = allDaires.filter((d) => d.status === "SOLD").length;
      const reserved = allDaires.filter((d) => d.status === "RESERVED").length;
      const available = allDaires.filter((d) => d.status === "AVAILABLE").length;
      return {
        type: "project" as const,
        id: p.id,
        name: p.name,
        description: p.description,
        address: null as string | null,
        status: null as string | null,
        startDate: p.createdAt,
        blockCount: p.blocks.length,
        unitsTotal: allDaires.length,
        sold,
        reserved,
        available,
      };
    });

    const projects = [...projectProjects, ...siteProjects];
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("GET /api/sales error:", err);
    return NextResponse.json({ error: "Liste alınamadı" }, { status: 500 });
  }
}
