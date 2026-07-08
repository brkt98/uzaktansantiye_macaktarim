import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncRecent, runBackfill, isBackfillRunning } from "@/lib/adisyoSync";

export const dynamic = "force-dynamic";

// Yetki: ya StudyAnka erişimli giriş yapmış kullanıcı, ya da cron için ADISYO_SYNC_TOKEN header'ı.
async function authorize(request: NextRequest): Promise<boolean> {
  const token = process.env.ADISYO_SYNC_TOKEN;
  if (token && request.headers.get("x-adisyo-sync-token") === token) return true;
  const user = await getCurrentUser();
  return Boolean(user && user.studyankaAccess);
}

async function handle(request: NextRequest) {
  try {
    if (!(await authorize(request))) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const mode = params.get("mode");

    if (mode === "backfill") {
      if (isBackfillRunning()) {
        return NextResponse.json({ started: false, message: "Backfill zaten çalışıyor." });
      }
      const daysParam = Number(params.get("days"));
      const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 180) : undefined;
      // Arka planda çalıştır (sayfalar arası 41 sn bekler; dakikalar sürebilir). Beklemeden yanıt dön.
      void runBackfill(days).catch((e) => console.error("[ADISYO BACKFILL]", e));
      return NextResponse.json({
        started: true,
        message: "Backfill arka planda başladı. Yoğun günlerde birkaç dakika sürebilir.",
      });
    }

    const result = await syncRecent();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[ADISYO SYNC]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
