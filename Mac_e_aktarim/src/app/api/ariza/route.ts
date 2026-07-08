import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isSiteChiefScoped } from "@/lib/auth";

// GET /api/ariza?status=OPEN|RESOLVED|ALL — tüm arızalar (site filtresi yok)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "ALL";
    const siteId = searchParams.get("siteId");
    const kindParam = searchParams.get("kind");
    // Default kind = GENERIC (Arıza Takip). Pass kind=SANTIYE to get şantiye-scoped records.
    const kind = kindParam === "SANTIYE" ? "SANTIYE" : "GENERIC";

    const where: Record<string, unknown> = { kind };
    if (status === "OPEN" || status === "RESOLVED") where.status = status;
    if (siteId) where.siteId = siteId;

    const arizalar = await prisma.ariza.findMany({
      where,
      include: {
        site: { select: { id: true, name: true } },
        block: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        media: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ status: "asc" }, { startDate: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ arizalar });
  } catch (error) {
    console.error("Ariza GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/ariza — yeni arıza oluştur (siteName: string serbest metin)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await request.json();
    const {
      siteName,
      siteId,
      description,
      startDate,
      endDate,
      assignedPersonnel,
      kind: kindRaw,
    } = body;
    const kind: "GENERIC" | "SANTIYE" = kindRaw === "SANTIYE" ? "SANTIYE" : "GENERIC";
    // SANTIYE kayıtları mutlaka bir siteId'ye bağlı olmalı; GENERIC kayıtlar siteId taşımamalı
    if (kind === "SANTIYE" && !siteId) {
      return NextResponse.json({ error: "Şantiye Arıza için şantiye seçimi zorunludur" }, { status: 400 });
    }

    const trimmedSiteName = (siteName || "").trim();
    if (!trimmedSiteName || !description?.trim() || !startDate) {
      return NextResponse.json(
        { error: "Şantiye adı, açıklama ve başlangıç tarihi zorunludur" },
        { status: 400 }
      );
    }

    // siteId verilmişse şantiyenin gerçekten var olduğunu doğrula
    let resolvedSiteId: string | null = null;
    if (siteId && kind === "SANTIYE") {
      const site = await prisma.constructionSite.findUnique({
        where: { id: siteId },
        select: { id: true, name: true, deletedAt: true },
      });
      if (!site || site.deletedAt) {
        return NextResponse.json({ error: "Şantiye bulunamadı" }, { status: 404 });
      }
      // SITE_CHIEF (daha üst rolü yoksa) için membership kontrolü
      if (isSiteChiefScoped(user.roles)) {
        const m = await prisma.siteMember.findFirst({
          where: { siteId, userId: user.id }, select: { id: true },
        });
        if (!m) return NextResponse.json({ error: "Bu şantiyeye erişim yetkiniz yok" }, { status: 403 });
      }
      resolvedSiteId = site.id;
    }

    const status = endDate ? "RESOLVED" : "OPEN";

    const ariza = await prisma.ariza.create({
      data: {
        kind,
        // siteId verildiyse onu kullan, customSiteName temizle
        customSiteName: resolvedSiteId ? null : trimmedSiteName,
        siteId: resolvedSiteId,
        blockId: null,
        floorId: null,
        unitId: null,
        isPeyzaj: false,
        description: description.trim(),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        assignedPersonnel: assignedPersonnel?.trim() || null,
        status,
        createdById: user.id,
        createdByName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.username || null,
      },
      include: {
        site: { select: { id: true, name: true } },
        block: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        media: true,
      },
    });

    return NextResponse.json({ ariza }, { status: 201 });
  } catch (error) {
    console.error("Ariza POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
