import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Blok bazlı ilerleme yüzdesi.
// Hesaplama: KABA_INSAAT + INCE_INSAAT + BINA_GENEL kapsamındaki TÜM iş hücrelerinden
// status=COMPLETED olanların oranı. İnce İnşaat'ta her daire için iş bazındaki
// kadar iş varmış gibi sayılır (slot = works × daire sayısı).
// İşler arasında ağırlık dağılımı yok — eşit ağırlık.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    const { id: siteId } = await params;

    const site = await prisma.constructionSite.findUnique({
      where: { id: siteId },
      include: { blocks: { select: { id: true } } },
    });
    if (!site) {
      return NextResponse.json({ error: "Şantiye bulunamadı" }, { status: 404 });
    }

    const blockIds = site.blocks.map((b) => b.id);
    if (blockIds.length === 0) {
      return NextResponse.json({ progress: {} });
    }

    const TYPES = ["KABA_INSAAT", "INCE_INSAAT", "BINA_GENEL"] as const;

    // Tüm ilgili tipler için floor + works'leri tek seferde getir.
    // blockId == null olan (site geneli template) floor'lar tüm bloklara aynı şekilde uygulanır.
    const floors = await prisma.constructionFloor.findMany({
      where: { siteId, type: { in: TYPES as unknown as string[] } },
      include: { works: { select: { id: true } } },
    });

    // Tüm bloklar için ilgili entries'leri tek seferde getir.
    const entries = await prisma.constructionEntry.findMany({
      where: {
        blockId: { in: blockIds },
        status: "COMPLETED",
        work: { floor: { siteId, type: { in: TYPES as unknown as string[] } } },
      },
      select: {
        blockId: true,
        workId: true,
        floorId: true,
        work: { select: { floor: { select: { type: true } } } },
      },
    });

    // İnce İnşaat için her bloğun daire sayısını al
    // (blok'a bağlı Floor üzerinden gerçek Unit sayısı; yoksa default 16)
    const blockUnitsCount = new Map<string, number>();
    const unitCounts = await prisma.unit.groupBy({
      by: ["floorId"],
      _count: { _all: true },
    });
    // floorId → blockId mapping
    const floorList = await prisma.floor.findMany({
      select: { id: true, blockId: true },
    });
    const floorToBlock = new Map(floorList.map((f) => [f.id, f.blockId]));
    for (const u of unitCounts) {
      const bId = floorToBlock.get(u.floorId);
      if (!bId) continue;
      blockUnitsCount.set(bId, (blockUnitsCount.get(bId) || 0) + u._count._all);
    }

    // Eğer ince için config var ise, oradaki daire sayısını da kullan (override).
    const inceConfigs = await prisma.constructionDefault.findMany({
      where: { id: { startsWith: `ince_${siteId}_` } },
    });
    const inceDaireCountByBlock = new Map<string, number>();
    for (const cfg of inceConfigs) {
      const bId = cfg.id.replace(`ince_${siteId}_`, "");
      const tpl = cfg.template as { daires?: { id: string; name: string }[] } | null;
      if (Array.isArray(tpl?.daires)) inceDaireCountByBlock.set(bId, tpl!.daires!.length);
    }

    // Her tip için "blok ya da global" floor'lardan toplam iş slot'u
    // Bir blokta o tip için blok-spesifik floor varsa onları kullan, yoksa global (blockId null) floor'ları say.
    const floorsByTypeBlock = new Map<string, typeof floors>();
    for (const f of floors) {
      const key = `${f.type}__${f.blockId ?? "GLOBAL"}`;
      const arr = floorsByTypeBlock.get(key) || [];
      arr.push(f);
      floorsByTypeBlock.set(key, arr);
    }
    const getTypeFloors = (type: string, blockId: string) => {
      const blkFloors = floorsByTypeBlock.get(`${type}__${blockId}`) || [];
      if (blkFloors.length > 0) return blkFloors;
      return floorsByTypeBlock.get(`${type}__GLOBAL`) || [];
    };

    // Tamamlanan entries'i blockId/type bazında grupla
    const completedByBlockType = new Map<string, number>();
    for (const e of entries) {
      const t = e.work.floor.type;
      const k = `${e.blockId}__${t}`;
      completedByBlockType.set(k, (completedByBlockType.get(k) || 0) + 1);
    }

    type TypeProgress = { percent: number; completed: number; total: number };
    const progress: Record<
      string,
      TypeProgress & { byType: Record<string, TypeProgress> }
    > = {};

    for (const blockId of blockIds) {
      let total = 0;
      let completed = 0;
      const byType: Record<string, TypeProgress> = {};
      for (const type of TYPES) {
        const tFloors = getTypeFloors(type, blockId);
        let workCount = 0;
        for (const f of tFloors) workCount += f.works.length;

        let typeTotal = workCount;
        if (type === "INCE_INSAAT") {
          // Daire sayısı: önce ince config, yoksa gerçek unit sayısı, yoksa 16 fallback
          const daireCount =
            inceDaireCountByBlock.get(blockId) ??
            blockUnitsCount.get(blockId) ??
            (workCount > 0 ? 16 : 0);
          typeTotal = workCount * daireCount;
        }

        const typeCompleted = completedByBlockType.get(`${blockId}__${type}`) || 0;
        const typePercent = typeTotal > 0 ? Math.round((typeCompleted / typeTotal) * 100) : 0;
        byType[type] = { percent: typePercent, completed: typeCompleted, total: typeTotal };

        total += typeTotal;
        completed += typeCompleted;
      }
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      progress[blockId] = { percent, completed, total, byType };
    }

    return NextResponse.json({ progress });
  } catch (e) {
    console.error("blocks-progress error:", e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
