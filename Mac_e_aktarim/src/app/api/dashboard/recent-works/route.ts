import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/dashboard/recent-works?days=3 veya ?date=YYYY-MM-DD
// Son N günde (ya da belirli bir günde) personel girilen veya fotoğraf eklenen iş kalemleri.
// Personel entryKey formatları:
//   - KABA_INSAAT/BINA_GENEL/PEYZAJ: `${floorId}_${workId}`
//   - INCE_INSAAT:                   `${workId}:${unitId}`
const MIN_DATE = "2026-01-01";
const isIsoDate = (value: string | null) =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const requestedDate = searchParams.get("date");

    const now = new Date();
    const turkeyOffset = 3 * 60 * 60 * 1000;
    const turkeyNow = new Date(now.getTime() + turkeyOffset);
    const todayStr = turkeyNow.toISOString().slice(0, 10);

    if (requestedDate && !isIsoDate(requestedDate)) {
      return NextResponse.json({ error: "Gecersiz tarih" }, { status: 400 });
    }
    if (requestedDate && (requestedDate < MIN_DATE || requestedDate > todayStr)) {
      return NextResponse.json({ error: "Tarih aralik disi" }, { status: 400 });
    }

    const days = requestedDate
      ? 1
      : Math.min(Math.max(parseInt(searchParams.get("days") || "3", 10) || 3, 1), 14);
    const anchorDateStr = requestedDate || todayStr;
    const anchorMidnight = new Date(anchorDateStr + "T00:00:00.000Z");
    const startDate = new Date(anchorMidnight);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    const endDate = new Date(anchorMidnight);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    // 1) Personel girilen işler (son N gün)
    const entries = await prisma.personnelEntry.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      select: {
        id: true,
        date: true,
        createdAt: true,
        personnelName: true,
        company: true,
        workDuration: true,
        workName: true,
        siteId: true,
        blockId: true,
        floorName: true,
        constructionType: true,
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "asc" }],
    });

    // 2) Son N gün içinde eklenen ConstructionEntryMedia
    const recentMedia = await prisma.constructionEntryMedia.findMany({
      where: { createdAt: { gte: startDate, lt: endDate } },
      select: {
        id: true,
        fileUrl: true,
        mimeType: true,
        fileName: true,
        createdAt: true,
        entry: {
          select: {
            blockId: true,
            floorId: true,
            work: {
              select: {
                id: true,
                name: true,
                floor: {
                  select: {
                    type: true,
                    name: true,
                    site: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    type WorkAgg = {
      key: string;
      siteId: string;
      siteName: string;
      workName: string;
      workNames: string[];
      workIds: string[];
      contextName: string;
      blockName: string;
      blockId?: string;
      workId?: string;
      constructionType: string | null;
      personnelCount: number;
      personnelEntries: Array<{
        id: string;
        date: string;
        personnelName: string;
        company: string | null;
        workDuration: string;
        workName: string;
      }>;
      photoCount: number;
      photos: Array<{ id: string; url: string; mimeType: string; fileName: string | null; createdAt: string; workName?: string }>;
      lastActivity: string;
      daireNames?: string[];
    };

    // Block id → name lookup
    const blockIds = new Set<string>();
    for (const e of entries) if (e.blockId) blockIds.add(e.blockId);
    for (const m of recentMedia) if (m.entry?.blockId) blockIds.add(m.entry.blockId);
    const blocks = blockIds.size > 0
      ? await prisma.block.findMany({ where: { id: { in: Array.from(blockIds) } }, select: { id: true, name: true } })
      : [];
    const blockMap = new Map(blocks.map((b) => [b.id, b.name]));

    // Unit lookup for INCE_INSAAT media (ConstructionEntry.floorId = Unit.id)
    const inceUnitIds = new Set<string>();
    for (const m of recentMedia) {
      if (m.entry?.work?.floor?.type === "INCE_INSAAT" && m.entry.floorId) {
        inceUnitIds.add(m.entry.floorId);
      }
    }
    const inceUnits = inceUnitIds.size > 0
      ? await prisma.unit.findMany({ where: { id: { in: Array.from(inceUnitIds) } }, select: { id: true, name: true } })
      : [];
    const inceUnitMap = new Map(inceUnits.map((u) => [u.id, u.name]));

    const map = new Map<string, WorkAgg>();

    // Personel kayıtlarından grupla
    for (const e of entries) {
      const ctx = e.floorName || "—";
      const blockName = e.blockId ? (blockMap.get(e.blockId) ?? "—") : "Peyzaj";
      const isInce = e.constructionType === "INCE_INSAAT";
      const isKaba = e.constructionType === "KABA_INSAAT";
      const k = isInce
        ? `${e.siteId}::${e.workName}::INCE::${blockName}`
        : isKaba
        ? `${e.siteId}::KABA::${blockName}::${ctx}`
        : `${e.siteId}::${e.workName}::${ctx}::${blockName}`;
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          siteId: e.siteId,
          siteName: e.site.name,
          workName: e.workName,
          workNames: [e.workName],
          workIds: [],
          contextName: ctx,
          blockName,
          blockId: e.blockId || undefined,
          constructionType: e.constructionType,
          personnelCount: 0,
          personnelEntries: [],
          photoCount: 0,
          photos: [],
          lastActivity: e.createdAt.toISOString(),
          daireNames: isInce ? [] : undefined,
        });
      }
      const w = map.get(k)!;
      if (isInce && w.daireNames && ctx !== "—" && !w.daireNames.includes(ctx)) {
        w.daireNames.push(ctx);
      }
      if (isKaba && !w.workNames.includes(e.workName)) {
        w.workNames.push(e.workName);
      }
      w.personnelEntries.push({
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        personnelName: e.personnelName,
        company: e.company,
        workDuration: e.workDuration,
        workName: e.workName,
      });
      if (e.createdAt.toISOString() > w.lastActivity) w.lastActivity = e.createdAt.toISOString();
    }

    // Fotoğraflardan grupla (work.name, floor.name, site)
    for (const m of recentMedia) {
      const work = m.entry?.work;
      if (!work) continue;
      const floor = work.floor;
      const site = floor?.site;
      if (!site) continue;
      const isInce = floor?.type === "INCE_INSAAT";
      const isKaba = floor?.type === "KABA_INSAAT";
      const ctx = isInce && m.entry?.floorId
        ? (inceUnitMap.get(m.entry.floorId) || floor?.name || "—")
        : (floor?.name || "—");
      const blockName = m.entry?.blockId ? (blockMap.get(m.entry.blockId) ?? "—") : "Peyzaj";
      const k = isInce
        ? `${site.id}::${work.name}::INCE::${blockName}`
        : isKaba
        ? `${site.id}::KABA::${blockName}::${ctx}`
        : `${site.id}::${work.name}::${ctx}::${blockName}`;
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          siteId: site.id,
          siteName: site.name,
          workName: work.name,
          workNames: [work.name],
          workIds: [work.id],
          contextName: ctx,
          blockName,
          blockId: m.entry?.blockId || undefined,
          workId: work.id,
          constructionType: floor?.type || null,
          personnelCount: 0,
          personnelEntries: [],
          photoCount: 0,
          photos: [],
          lastActivity: m.createdAt.toISOString(),
          daireNames: isInce ? [] : undefined,
        });
      }
      const w = map.get(k)!;
      if (isInce) {
        if (!w.daireNames) w.daireNames = [];
        if (ctx !== "—" && !w.daireNames.includes(ctx)) w.daireNames.push(ctx);
      }
      if (isKaba && !w.workNames.includes(work.name)) {
        w.workNames.push(work.name);
      }
      if (isKaba && !w.workIds.includes(work.id)) {
        w.workIds.push(work.id);
      }
      if (!w.blockId && m.entry?.blockId) w.blockId = m.entry.blockId;
      if (!w.workId) w.workId = work.id;
      if (!w.constructionType && floor?.type) {
        w.constructionType = floor.type;
      }
      w.photoCount++;
      w.photos.push({
        id: m.id,
        url: m.fileUrl,
        mimeType: m.mimeType,
        fileName: m.fileName,
        createdAt: m.createdAt.toISOString(),
        workName: work.name,
      });
      if (m.createdAt.toISOString() > w.lastActivity) w.lastActivity = m.createdAt.toISOString();
    }

    // Post-process: unique personnel count, sorted daire/work names
    for (const w of map.values()) {
      const uniqueNames = new Set(w.personnelEntries.map((p) => p.personnelName));
      w.personnelCount = uniqueNames.size;
      if (w.daireNames && w.daireNames.length > 0) {
        w.daireNames.sort((a, b) => a.localeCompare(b, "tr", { numeric: true, sensitivity: "base" }));
      }
      if (w.workNames && w.workNames.length > 0) {
        w.workNames.sort((a, b) => a.localeCompare(b, "tr", { numeric: true, sensitivity: "base" }));
      }
    }

    const works = Array.from(map.values()).sort((a, b) =>
      b.lastActivity.localeCompare(a.lastActivity)
    );

    // INCE_INSAAT için her daire ayrı iş sayılır; diğerleri için 1
    const itemCountOf = (w: WorkAgg) =>
      w.constructionType === "INCE_INSAAT" && w.daireNames && w.daireNames.length > 0
        ? w.daireNames.length
        : 1;
    const sumItems = (list: WorkAgg[]) => list.reduce((acc, w) => acc + itemCountOf(w), 0);

    // Kategorize et
    const withPhoto = works.filter((w) => w.photoCount > 0 && w.personnelCount > 0);
    const photoOnly = works.filter((w) => w.photoCount > 0 && w.personnelCount === 0);
    const personnelNoPhoto = works.filter((w) => w.photoCount === 0 && w.personnelCount > 0);
    const allWithPhoto = works.filter((w) => w.photoCount > 0);

    return NextResponse.json({
      total: sumItems(works),
      withPhotoCount: sumItems(allWithPhoto),
      personnelNoPhotoCount: sumItems(personnelNoPhoto),
      photoWithPersonnelCount: sumItems(withPhoto),
      works,
      categories: {
        photos: allWithPhoto,
        personnelNoPhoto,
        personnelWithPhoto: withPhoto,
        photosOnly: photoOnly,
      },
    });
  } catch (error) {
    console.error("dashboard/recent-works GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
