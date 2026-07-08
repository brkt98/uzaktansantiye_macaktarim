import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/personnel/today — bugünkü personel özeti (GMT+3 Türkiye saati)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    // Türkiye saati ile bugünün tarihini hesapla
    const now = new Date();
    const turkeyOffset = 3 * 60 * 60 * 1000;
    const turkeyNow = new Date(now.getTime() + turkeyOffset);
    const turkeyDateStr = turkeyNow.toISOString().slice(0, 10); // YYYY-MM-DD

    // @db.Date sütunu için midnight UTC karşılaştırması
    // (Kayıtlar "YYYY-MM-DD" → new Date("YYYY-MM-DD") = midnight UTC olarak saklanır)
    const todayMidnight = new Date(turkeyDateStr + "T00:00:00.000Z");
    const tomorrowMidnight = new Date(todayMidnight);
    tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);

    // Bugünkü tüm personel kayıtlarını getir
    const entries = await prisma.personnelEntry.findMany({
      where: {
        date: {
          gte: todayMidnight,
          lt: tomorrowMidnight,
        },
      },
      include: {
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "asc" }],
    });

    // Özet: site + workName bazında grupla
    const summaryMap = new Map<string, {
      siteId: string;
      siteName: string;
      workName: string;
      companies: string[];
      personCount: number;
    }>();

    for (const e of entries) {
      const key = `${e.siteId}::${e.workName}`;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          siteId: e.siteId,
          siteName: e.site.name,
          workName: e.workName,
          companies: [],
          personCount: 0,
        });
      }
      const item = summaryMap.get(key)!;
      item.personCount++;
      const comp = e.company || "";
      if (comp && !item.companies.includes(comp)) {
        item.companies.push(comp);
      }
    }

    const summary = Array.from(summaryMap.values());

    // Detay: tüm kayıtlar satır satır
    const details = entries.map((e) => ({
      id: e.id,
      siteId: e.siteId,
      siteName: e.site.name,
      workName: e.workName,
      floorName: e.floorName,
      constructionType: e.constructionType,
      personnelName: e.personnelName,
      company: e.company,
      workDuration: e.workDuration,
    }));

    // Benzersiz kişi sayısı (aynı kişi birden fazla işte çalışabilir)
    const uniqueNames = new Set(entries.map((e) => e.personnelName).filter(Boolean));
    const uniqueTotal = uniqueNames.size;

    return NextResponse.json({ summary, details, date: turkeyDateStr, uniqueTotal });
  } catch (error) {
    console.error("Personnel today GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
