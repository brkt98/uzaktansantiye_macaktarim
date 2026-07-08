import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// GET /api/yurtanka/data — Admin sayfası verileri (cookie auth)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
    if (!isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    const data = await prisma.yurtAnkaSync.findUnique({
      where: { id: "latest" },
    });

    if (!data) {
      return NextResponse.json({
        studentsOutside: [],
        personnelDaily: [],
        weeks: [],
        weeklyData: {},
        meta: {},
        syncedAt: null,
        online: false,
      });
    }

    const ageMs = Date.now() - new Date(data.syncedAt).getTime();
    const online = ageMs < 5 * 60 * 1000; // 5 dk içinde sync olduysa online

    return NextResponse.json({
      studentsOutside: data.studentsOutside,
      personnelDaily: data.personnelDaily,
      weeks: data.weeks,
      weeklyData: data.weeklyData,
      meta: data.meta,
      syncedAt: data.syncedAt,
      online,
    });
  } catch (error: unknown) {
    console.error("[YURTANKA DATA]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
