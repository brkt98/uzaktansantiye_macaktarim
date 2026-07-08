import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DEFAULT_MAPPINGS: Record<string, string> = {
  "5": "Miray",
  "6": "Enes",
  "7": "Zeynep Hanım",
  "8": "Handan",
};

// GET /api/studyanka/user-ids
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.studyankaAccess) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const config = await prisma.studyankaSync.findUnique({ where: { id: "user_id_config" } });
    const stored = config?.prices;
    const isValidMap =
      stored !== null &&
      stored !== undefined &&
      typeof stored === "object" &&
      !Array.isArray(stored);
    const mappingsRecord = isValidMap
      ? (stored as Record<string, string>)
      : DEFAULT_MAPPINGS;

    const mappings = Object.entries(mappingsRecord).map(([id, name]) => ({ id, name }));
    return NextResponse.json({ mappings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/studyanka/user-ids
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.studyankaAccess) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { mappings } = body;
    if (!Array.isArray(mappings)) {
      return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
    }

    const mappingsRecord: Record<string, string> = {};
    for (const item of mappings) {
      const id = String(item?.id ?? "").trim();
      const name = String(item?.name ?? "").trim();
      if (id && name) {
        mappingsRecord[id] = name;
      }
    }

    await prisma.studyankaSync.upsert({
      where: { id: "user_id_config" },
      update: { prices: mappingsRecord, syncedAt: new Date() },
      create: {
        id: "user_id_config",
        rooms: [],
        prices: mappingsRecord,
        summary: {},
        syncedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
