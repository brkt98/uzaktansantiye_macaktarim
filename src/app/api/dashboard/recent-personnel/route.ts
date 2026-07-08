import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const MIN_DATE = "2026-01-01";
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;

const normalizeName = (name: string | null | undefined) =>
  (name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");

const isIsoDate = (value: string | null) =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

const turkeyTodayString = () => {
  const turkeyNow = new Date(Date.now() + TURKEY_OFFSET_MS);
  return turkeyNow.toISOString().slice(0, 10);
};

const dateFromIso = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// GET /api/dashboard/recent-personnel?days=3 or ?date=2026-04-30
// Groups personnel records by day.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const requestedDate = searchParams.get("date");
    const todayStr = turkeyTodayString();

    if (requestedDate && !isIsoDate(requestedDate)) {
      return NextResponse.json({ error: "Gecersiz tarih" }, { status: 400 });
    }

    if (requestedDate && (requestedDate < MIN_DATE || requestedDate > todayStr)) {
      return NextResponse.json({ error: "Tarih aralik disi" }, { status: 400 });
    }

    const days = requestedDate
      ? 1
      : Math.min(Math.max(parseInt(searchParams.get("days") || "3", 10) || 3, 1), 14);
    const anchorDate = requestedDate || todayStr;
    const anchorMidnight = dateFromIso(anchorDate);

    const startDate = new Date(anchorMidnight);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    const endDate = new Date(anchorMidnight);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    const entries = await prisma.personnelEntry.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      include: { site: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "asc" }],
    });

    const blockIds = Array.from(
      new Set(entries.map((entry) => entry.blockId).filter((id): id is string => !!id))
    );
    const blocks = blockIds.length
      ? await prisma.block.findMany({
          where: { id: { in: blockIds } },
          select: { id: true, name: true },
        })
      : [];
    const blockNames = new Map(blocks.map((block) => [block.id, block.name]));

    const byDate = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = entry.date.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(entry);
    }

    const days_arr: Array<{
      date: string;
      total: number;
      uniqueCount: number;
      records: Array<{
        id: string;
        siteId: string;
        siteName: string;
        blockId: string | null;
        blockName: string;
        workName: string;
        floorName: string | null;
        constructionType: string;
        personnelName: string;
        company: string | null;
        workDuration: string;
      }>;
    }> = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(anchorMidnight);
      date.setUTCDate(date.getUTCDate() - i);
      const key = date.toISOString().slice(0, 10);
      const list = byDate.get(key) || [];
      const uniqueNames = new Set(
        list.map((record) => normalizeName(record.personnelName)).filter(Boolean)
      );

      days_arr.push({
        date: key,
        total: list.length,
        uniqueCount: uniqueNames.size,
        records: list.map((entry) => ({
          id: entry.id,
          siteId: entry.siteId,
          siteName: entry.site.name,
          blockId: entry.blockId,
          blockName: entry.blockId ? blockNames.get(entry.blockId) || "Peyzaj" : "Peyzaj",
          workName: entry.workName,
          floorName: entry.floorName,
          constructionType: entry.constructionType,
          personnelName: entry.personnelName,
          company: entry.company,
          workDuration: entry.workDuration,
        })),
      });
    }

    return NextResponse.json({ days: days_arr });
  } catch (error) {
    console.error("dashboard/recent-personnel GET error:", error);
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
