import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getIstanbulDateKey, summarizeAttendanceByDay } from "@/lib/studyankaAttendance";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// GET /api/studyanka/status - StudyAnka sayfasi icin guncel veri
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.studyankaAccess) {
      return NextResponse.json({ error: "Yetkisiz eriÅŸim" }, { status: 403 });
    }

    const [data, userIdConfig] = await Promise.all([
      prisma.studyankaSync.findUnique({ where: { id: "latest" } }),
      prisma.studyankaSync.findUnique({ where: { id: "user_id_config" } }),
    ]);

    const userMappings =
      userIdConfig?.prices !== null &&
      userIdConfig?.prices !== undefined &&
      typeof userIdConfig.prices === "object" &&
      !Array.isArray(userIdConfig.prices)
        ? (userIdConfig.prices as Record<string, string>)
        : undefined;

    if (!data) {
      return NextResponse.json({
        rooms: [],
        records: [],
        todayAttendanceRecords: [],
        todayAttendanceCount: 0,
        lastAttendanceAt: null,
        prices: {},
        summary: {},
        syncedAt: null,
        online: false,
      });
    }

    const summary = isObject(data.summary) ? data.summary : {};
    const records = Array.isArray(summary.attendanceRecords) ? summary.attendanceRecords : [];
    const todayKey = getIstanbulDateKey();
    const todayAttendanceRecords = summarizeAttendanceByDay(records, todayKey, userMappings)
      .sort((a, b) => b.EntryDateTime.localeCompare(a.EntryDateTime));
    const lastAttendanceAt = todayAttendanceRecords[0]?.EntryDateTime ?? null;
    const online = Date.now() - new Date(data.syncedAt).getTime() < 30000;

    return NextResponse.json({
      rooms: data.rooms,
      records,
      todayAttendanceRecords,
      todayAttendanceCount: todayAttendanceRecords.length,
      lastAttendanceAt,
      prices: data.prices,
      summary: {
        ...summary,
        totalAttendance: records.length,
        kabinUsedToday: typeof summary.kabinUsedToday === "number" ? summary.kabinUsedToday : 0,
        toplantiUsedToday: typeof summary.toplantiUsedToday === "number" ? summary.toplantiUsedToday : 0,
      },
      syncedAt: data.syncedAt,
      online,
    });
  } catch (error: unknown) {
    console.error("[STUDYANKA STATUS]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
