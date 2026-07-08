import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

const CHECKIN_ACTION = "SITE_CHIEF_DAILY_CHECKIN";
const TIME_ZONE = "Europe/Istanbul";
const TURKEY_UTC_OFFSET_HOURS = 3;
const CHECKIN_START_HOUR = 3;
const CHECKIN_START_MINUTE = 45;

function getTurkeyNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const part = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const hour = Number(part("hour"));
  const minute = Number(part("minute"));

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${part("year")}-${part("month")}-${part("day")}`,
  };
}

function getTurkeyDayBoundsUtc(parts: ReturnType<typeof getTurkeyNowParts>) {
  const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, -TURKEY_UTC_OFFSET_HOURS, 0, 0, 0));
  const end = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, -TURKEY_UTC_OFFSET_HOURS, 0, 0, 0));
  return { start, end };
}

function isAfterCheckinStart(parts: ReturnType<typeof getTurkeyNowParts>) {
  return parts.hour > CHECKIN_START_HOUR || (parts.hour === CHECKIN_START_HOUR && parts.minute >= CHECKIN_START_MINUTE);
}

async function getTodayCheckin(userId: string, parts: ReturnType<typeof getTurkeyNowParts>) {
  const { start, end } = getTurkeyDayBoundsUtc(parts);
  return prisma.auditLog.findFirst({
    where: {
      userId,
      action: CHECKIN_ACTION,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    if (!hasRole(user.roles, "SITE_CHIEF")) {
      return NextResponse.json({ error: "Bu ekran sadece şantiye şefleri içindir" }, { status: 403 });
    }

    const turkeyNow = getTurkeyNowParts();
    const checkin = await getTodayCheckin(user.id, turkeyNow);

    return NextResponse.json({
      eligible: isAfterCheckinStart(turkeyNow),
      date: turkeyNow.dateKey,
      checkedIn: Boolean(checkin),
      checkin: checkin?.details ?? null,
    });
  } catch (error) {
    console.error("Site chief checkin GET error:", error);
    return NextResponse.json({ error: "Günlük giriş bilgisi alınamadı" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    if (!hasRole(user.roles, "SITE_CHIEF")) {
      return NextResponse.json({ error: "Bu işlem sadece şantiye şefleri içindir" }, { status: 403 });
    }

    const turkeyNow = getTurkeyNowParts();
    if (!isAfterCheckinStart(turkeyNow)) {
      return NextResponse.json({ error: "Günlük giriş Türkiye saati ile 03:45'ten sonra yapılabilir" }, { status: 400 });
    }

    const body = await request.json();
    const mode = body?.mode;
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    if (mode !== "SITES" && mode !== "OFFSITE" && mode !== "ON_LEAVE") {
      return NextResponse.json({ error: "Geçersiz çalışma türü" }, { status: 400 });
    }

    let selectedSites: { id: string; name: string; status: string }[] = [];

    if (mode === "SITES") {
      const siteIds: string[] = Array.isArray(body?.siteIds)
        ? Array.from(new Set(body.siteIds
            .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
            .map((id: string) => id.trim())))
        : [];

      if (siteIds.length === 0) {
        return NextResponse.json({ error: "En az bir şantiye seçmelisiniz" }, { status: 400 });
      }

      const memberships = await prisma.siteMember.findMany({
        where: {
          userId: user.id,
          siteId: { in: siteIds },
        },
        select: { siteId: true },
      });

      if (memberships.length !== siteIds.length) {
        return NextResponse.json({ error: "Seçilen şantiyelerden biri size atanmış değil" }, { status: 403 });
      }

      const sites = await prisma.constructionSite.findMany({
        where: {
          id: { in: siteIds },
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          status: true,
        },
      });

      if (sites.length !== siteIds.length) {
        return NextResponse.json({ error: "Seçilen şantiyelerden biri aktif değil" }, { status: 400 });
      }

      selectedSites = sites.map((site) => ({
        id: site.id,
        name: site.name,
        status: site.status,
      }));
    }

    if (mode === "OFFSITE" && !note) {
      return NextResponse.json({ error: "Şantiye harici çalışma için not girmelisiniz" }, { status: 400 });
    }

    const details = {
      date: turkeyNow.dateKey,
      mode,
      selectedSites,
      note: mode === "OFFSITE" ? note : null,
      timeZone: TIME_ZONE,
      submittedAt: new Date().toISOString(),
      submittedBy: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };

    const existing = await getTodayCheckin(user.id, turkeyNow);
    const checkin = existing
      ? await prisma.auditLog.update({
          where: { id: existing.id },
          data: { details },
        })
      : await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: CHECKIN_ACTION,
            entityType: "SiteChiefDailyCheckin",
            entityId: user.id,
            details,
          },
        });

    return NextResponse.json({ success: true, checkin: checkin.details });
  } catch (error) {
    console.error("Site chief checkin POST error:", error);
    return NextResponse.json({ error: "Günlük giriş kaydedilemedi" }, { status: 500 });
  }
}
