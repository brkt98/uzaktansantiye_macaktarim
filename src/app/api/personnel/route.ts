import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { syncMatchedPersonnel } from "@/lib/personnel-sync";

function parseConstructionEntryKey(entryKey: unknown) {
  const key = String(entryKey || "").trim();
  if (!key) return { workId: "", floorId: null as string | null };

  if (key.includes(":")) {
    const [workId, floorId] = key.split(":");
    return { workId: workId || "", floorId: floorId || null };
  }

  if (key.includes("_")) {
    const parts = key.split("_");
    return { workId: parts[1] || "", floorId: null as string | null };
  }

  return { workId: key, floorId: null as string | null };
}

async function markConstructionEntryInProgress(params: {
  siteId: string;
  blockId?: string | null;
  entryKey: string;
}) {
  const { siteId, blockId, entryKey } = params;
  if (!blockId) return null;

  const { workId, floorId } = parseConstructionEntryKey(entryKey);
  if (!workId) return null;

  const work = await prisma.constructionWork.findUnique({
    where: { id: workId },
    select: { id: true, floor: { select: { siteId: true } } },
  });

  if (!work || work.floor.siteId !== siteId) return null;

  const where = { workId, blockId, floorId: floorId ?? null };
  let constructionEntry = await prisma.constructionEntry.findFirst({ where });
  const now = new Date();

  if (!constructionEntry) {
    constructionEntry = await prisma.constructionEntry.create({
      data: { workId, blockId, floorId: floorId ?? null, startDate: now, status: "IN_PROGRESS" },
    });
  } else if (constructionEntry.status === "NOT_STARTED") {
    constructionEntry = await prisma.constructionEntry.update({
      where: { id: constructionEntry.id },
      data: { startDate: constructionEntry.startDate || now, status: "IN_PROGRESS" },
    });
  } else if (constructionEntry.status === "IN_PROGRESS" && !constructionEntry.startDate) {
    constructionEntry = await prisma.constructionEntry.update({
      where: { id: constructionEntry.id },
      data: { startDate: now },
    });
  }

  return {
    id: constructionEntry.id,
    workId: constructionEntry.workId,
    blockId: constructionEntry.blockId,
    floorId: constructionEntry.floorId,
    startDate: constructionEntry.startDate,
    endDate: constructionEntry.endDate,
    status: constructionEntry.status,
  };
}

// GET /api/personnel?siteId=X&blockId=Y&constructionType=Z&entryKey=K&date=2026-03-24
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const blockId = searchParams.get("blockId");
    const constructionType = searchParams.get("constructionType");
    const entryKey = searchParams.get("entryKey");
    const date = searchParams.get("date");
    const recentNames = searchParams.get("recentNames");

    if (!siteId) {
      return NextResponse.json({ error: "siteId gerekli" }, { status: 400 });
    }

    // SitePersonnel kaydiyetinden isim/firma onerileri
    if (recentNames === "1") {
      const registry = await prisma.sitePersonnel.findMany({
        where: { siteId, isActive: true },
        select: { firstName: true, lastName: true, company: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      });
      const seenNames = new Set<string>();
      const seenCompanies = new Set<string>();
      const nameSuggestions: string[] = [];
      const companySuggestions: string[] = [];
      const suggestions: { name: string; company: string | null }[] = [];
      for (const r of registry) {
        const fullName = `${r.firstName} ${r.lastName}`.trim();
        const nk = fullName.toLowerCase();
        if (!seenNames.has(nk)) {
          seenNames.add(nk);
          nameSuggestions.push(fullName);
          suggestions.push({ name: fullName, company: r.company });
        }
        if (r.company) {
          const ck = r.company.toLowerCase();
          if (!seenCompanies.has(ck)) {
            seenCompanies.add(ck);
            companySuggestions.push(r.company);
          }
        }
      }
      return NextResponse.json({ nameSuggestions, companySuggestions, suggestions });
    }

    const where: Record<string, unknown> = { siteId };
    if (blockId) where.blockId = blockId;
    if (constructionType) where.constructionType = constructionType;
    if (entryKey) where.entryKey = entryKey;
    if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }

    const entries = await prisma.personnelEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Personnel GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/personnel — yeni personel kaydı
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, blockId, constructionType, workName, floorName, entryKey, date, personnelName, company, workDuration } = body;

    if (!siteId || !constructionType || !entryKey || !date || !personnelName) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    const entry = await prisma.personnelEntry.create({
      data: {
        siteId,
        blockId: blockId || null,
        constructionType,
        workName: workName || "",
        floorName: floorName || null,
        entryKey,
        date: new Date(date),
        personnelName,
        company: company || null,
        workDuration: workDuration || "FULL_DAY",
      },
    });

    let constructionEntry = null;
    try {
      constructionEntry = await markConstructionEntryInProgress({
        siteId,
        blockId: blockId || null,
        entryKey,
      });
    } catch (constructionErr) {
      console.error("Construction entry auto-progress error:", constructionErr);
    }

    // SitePersonnel registry'ye otomatik ekle (yoksa)
    try {
      const trimmed = String(personnelName).trim();
      const parts = trimmed.split(/\s+/);
      const firstName = parts[0] || trimmed;
      const lastName = parts.slice(1).join(" ") || "-";
      const trimmedCompany = company ? String(company).trim() : null;

      // Ayni isim+soyisim (case-insensitive) ayni santiyede var mi?
      const existing = await prisma.sitePersonnel.findFirst({
        where: {
          siteId,
          firstName: { equals: firstName, mode: "insensitive" },
          lastName: { equals: lastName, mode: "insensitive" },
        },
        select: { id: true, company: true },
      });

      if (!existing) {
        const createdPersonnel = await prisma.sitePersonnel.create({
          data: {
            siteId,
            firstName,
            lastName,
            company: trimmedCompany,
            isActive: true,
          },
        });
        await syncMatchedPersonnel(createdPersonnel.id);
      } else if (trimmedCompany && !existing.company) {
        // Firma bilgisi yoksa guncelle
        const updatedPersonnel = await prisma.sitePersonnel.update({
          where: { id: existing.id },
          data: { company: trimmedCompany },
        });
        await syncMatchedPersonnel(updatedPersonnel.id);
      }
    } catch (regErr) {
      console.error("SitePersonnel auto-create error:", regErr);
      // Ana islemi engelleme
    }

    return NextResponse.json({ entry, constructionEntry }, { status: 201 });
  } catch (error) {
    console.error("Personnel POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
