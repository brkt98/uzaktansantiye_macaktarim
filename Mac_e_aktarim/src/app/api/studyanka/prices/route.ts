import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST /api/studyanka/prices — brkt98 fiyatları günceller, PLC sync response ile alır
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.studyankaAccess) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { kabin, toplanti, alttoplanti } = body;

    if (!kabin || !toplanti) {
      return NextResponse.json({ error: "Fiyat bilgisi eksik" }, { status: 400 });
    }

    await prisma.studyankaSync.upsert({
      where: { id: "price_config" },
      update: {
        prices: { kabin, toplanti, alttoplanti: alttoplanti || toplanti },
        syncedAt: new Date(),
      },
      create: {
        id: "price_config",
        rooms: [],
        prices: { kabin, toplanti, alttoplanti: alttoplanti || toplanti },
        summary: {},
        syncedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[STUDYANKA PRICES]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
