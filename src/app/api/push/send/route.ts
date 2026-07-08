import { NextRequest, NextResponse } from "next/server";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

// POST /api/push/send — SERVİS İÇİ uç (realtime servisi çağırır).
// x-service-token header'ı ile korunur; cookie auth'tan muaf (middleware publicPaths).
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-service-token");
  const expected = process.env.REALTIME_SERVICE_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const { userId, title, body, data, dataOnly, ttlMs } = await request.json();
    // call / call_cancel data-only push'larda title gerekmez (notification bloğu yok).
    const isDataOnly = dataOnly === true;
    if (!userId || (!isDataOnly && !title)) {
      return NextResponse.json({ error: "userId ve title gerekli" }, { status: 400 });
    }
    await sendPushToUser(userId, {
      title: title || "",
      body: body || "",
      data: data || {},
      dataOnly: isDataOnly,
      ...(typeof ttlMs === "number" ? { ttlMs } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("push/send:", e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
