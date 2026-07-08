import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const SYNC_API_KEY = process.env.YURTANKA_API_KEY;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// POST /api/yurtanka/sync — PDKS Tkinter app pushes current state here.
// Body: { studentsOutside?, personnelDaily?, weeks?, weeklyData?, meta? }
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");
    if (!SYNC_API_KEY) {
      return NextResponse.json(
        { error: "YURTANKA_API_KEY ayarlanmamış" },
        { status: 500 },
      );
    }
    if (apiKey !== SYNC_API_KEY) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const studentsOutside = Array.isArray(body.studentsOutside)
      ? body.studentsOutside
      : [];
    const personnelDaily = Array.isArray(body.personnelDaily)
      ? body.personnelDaily
      : [];
    const weeks = Array.isArray(body.weeks) ? body.weeks : [];
    const weeklyData = isObject(body.weeklyData) ? body.weeklyData : {};
    const meta = isObject(body.meta) ? body.meta : {};

    await prisma.yurtAnkaSync.upsert({
      where: { id: "latest" },
      update: {
        studentsOutside,
        personnelDaily,
        weeks,
        weeklyData,
        meta: { ...meta, lastUploadAt: new Date().toISOString() },
        syncedAt: new Date(),
      },
      create: {
        id: "latest",
        studentsOutside,
        personnelDaily,
        weeks,
        weeklyData,
        meta: { ...meta, lastUploadAt: new Date().toISOString() },
        syncedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      counts: {
        studentsOutside: studentsOutside.length,
        personnelDaily: personnelDaily.length,
        weeks: weeks.length,
      },
    });
  } catch (error: unknown) {
    console.error("[YURTANKA SYNC]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
