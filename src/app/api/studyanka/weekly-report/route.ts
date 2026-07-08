import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  summarizeAttendanceByDay,
  buildWeeklyAttendance,
  getActivePersonnel,
} from "@/lib/studyankaAttendance";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// GET /api/studyanka/weekly-report
// Haftalık çalışma tablolarını JSON olarak döndürür (pop-up görünümü için).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.studyankaAccess) {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const [data, userIdConfig] = await Promise.all([
      prisma.studyankaSync.findUnique({ where: { id: "latest" } }),
      prisma.studyankaSync.findUnique({ where: { id: "user_id_config" } }),
    ]);
    const summary = isObject(data?.summary) ? data.summary : {};
    const records = Array.isArray(summary.attendanceRecords) ? summary.attendanceRecords : [];

    const userMappings =
      userIdConfig?.prices !== null &&
      userIdConfig?.prices !== undefined &&
      typeof userIdConfig.prices === "object" &&
      !Array.isArray(userIdConfig.prices)
        ? (userIdConfig.prices as Record<string, string>)
        : undefined;

    const attendanceSummaries = summarizeAttendanceByDay(records, undefined, userMappings);
    const activePersonnel = getActivePersonnel(userMappings);
    const tables = buildWeeklyAttendance(attendanceSummaries, activePersonnel);

    // Date alanlarını client'a uygun ISO string'e çevir
    const weeks = tables.map((table) => ({
      weekStartKey: table.weekStartKey, // "YYYY/MM/DD"
      weekStart: table.weekStart.toISOString(),
      weekEnd: table.weekEnd.toISOString(),
      rows: table.rows,
    }));

    return NextResponse.json({ weeks });
  } catch (error: unknown) {
    console.error("[STUDYANKA WEEKLY REPORT]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
