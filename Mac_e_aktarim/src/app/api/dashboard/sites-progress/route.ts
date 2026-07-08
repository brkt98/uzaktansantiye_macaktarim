import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const TYPES = ["KABA_INSAAT", "INCE_INSAAT", "BINA_GENEL"] as const;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const sites = await prisma.constructionSite.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        status: true,
        blocks: {
          select: { id: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    const siteIds = sites.map((site) => site.id);
    const blockIds = sites.flatMap((site) => site.blocks.map((block) => block.id));

    if (sites.length === 0) {
      return NextResponse.json({ sites: [] });
    }

    const floors = await prisma.constructionFloor.findMany({
      where: {
        siteId: { in: siteIds },
        type: { in: TYPES as unknown as string[] },
      },
      include: { works: { select: { id: true } } },
    });

    const entries = blockIds.length > 0
      ? await prisma.constructionEntry.findMany({
          where: {
            blockId: { in: blockIds },
            status: "COMPLETED",
            work: { floor: { siteId: { in: siteIds }, type: { in: TYPES as unknown as string[] } } },
          },
          select: {
            blockId: true,
            work: {
              select: {
                floor: {
                  select: {
                    siteId: true,
                    type: true,
                  },
                },
              },
            },
          },
        })
      : [];

    const blockUnitsCount = new Map<string, number>();
    if (blockIds.length > 0) {
      const realFloors = await prisma.floor.findMany({
        where: { blockId: { in: blockIds } },
        select: {
          blockId: true,
          _count: { select: { units: true } },
        },
      });

      for (const floor of realFloors) {
        blockUnitsCount.set(
          floor.blockId,
          (blockUnitsCount.get(floor.blockId) || 0) + floor._count.units
        );
      }
    }

    const inceConfigWhere = siteIds.map((siteId) => ({
      id: { startsWith: `ince_${siteId}_` },
    }));
    const inceConfigs = inceConfigWhere.length > 0
      ? await prisma.constructionDefault.findMany({ where: { OR: inceConfigWhere } })
      : [];

    const inceDaireCountByBlock = new Map<string, number>();
    for (const cfg of inceConfigs) {
      const siteId = siteIds.find((id) => cfg.id.startsWith(`ince_${id}_`));
      if (!siteId) continue;

      const blockId = cfg.id.replace(`ince_${siteId}_`, "");
      const tpl = cfg.template as { daires?: { id: string; name: string }[] } | null;
      if (Array.isArray(tpl?.daires)) {
        inceDaireCountByBlock.set(blockId, tpl.daires.length);
      }
    }

    const floorsBySiteTypeBlock = new Map<string, typeof floors>();
    for (const floor of floors) {
      const key = `${floor.siteId}__${floor.type}__${floor.blockId ?? "GLOBAL"}`;
      const items = floorsBySiteTypeBlock.get(key) || [];
      items.push(floor);
      floorsBySiteTypeBlock.set(key, items);
    }

    const getTypeFloors = (siteId: string, type: string, blockId: string) => {
      const blockFloors = floorsBySiteTypeBlock.get(`${siteId}__${type}__${blockId}`) || [];
      if (blockFloors.length > 0) return blockFloors;
      return floorsBySiteTypeBlock.get(`${siteId}__${type}__GLOBAL`) || [];
    };

    const completedBySiteBlockType = new Map<string, number>();
    for (const entry of entries) {
      const type = entry.work.floor.type;
      const key = `${entry.work.floor.siteId}__${entry.blockId}__${type}`;
      completedBySiteBlockType.set(key, (completedBySiteBlockType.get(key) || 0) + 1);
    }

    const siteProgress = sites.map((site) => {
      let siteCompleted = 0;
      let siteTotal = 0;

      for (const block of site.blocks) {
        for (const type of TYPES) {
          const typeFloors = getTypeFloors(site.id, type, block.id);
          const workCount = typeFloors.reduce((sum, floor) => sum + floor.works.length, 0);
          let typeTotal = workCount;

          if (type === "INCE_INSAAT") {
            const daireCount =
              inceDaireCountByBlock.get(block.id) ??
              blockUnitsCount.get(block.id) ??
              (workCount > 0 ? 16 : 0);
            typeTotal = workCount * daireCount;
          }

          const typeCompleted = completedBySiteBlockType.get(`${site.id}__${block.id}__${type}`) || 0;

          siteCompleted += typeCompleted;
          siteTotal += typeTotal;
        }
      }

      return {
        id: site.id,
        name: site.name,
        status: site.status,
        blockCount: site.blocks.length,
        completed: siteCompleted,
        total: siteTotal,
        percent: siteTotal > 0 ? Math.round((siteCompleted / siteTotal) * 100) : 0,
      };
    });

    return NextResponse.json({ sites: siteProgress });
  } catch (error) {
    console.error("dashboard/sites-progress GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
