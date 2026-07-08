import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// realtime servisinin servis-içi komut kanalı (docker iç ağı).
const REALTIME_URL = process.env.REALTIME_INTERNAL_URL || "http://realtime:4828";

/**
 * POST /api/call/reject  { conversationId, fromUserId }
 * Uygulama KAPALIYKEN bildirimdeki "Reddet" düğmesinden çağrılır (socket yok, cookie yok).
 *  - fromUserId = ARAYAN (reddedilmesi gereken hedef) → realtime ona 'call:rejected' yayar.
 * Native CallActionReceiver bu route'a token'sız POST eder; auth'suzdur (CUID + dar etki).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const conversationId = body?.conversationId;
    const fromUserId = body?.fromUserId; // arayan
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId gerekli" }, { status: 400 });
    }
    const serviceToken = process.env.REALTIME_SERVICE_TOKEN;
    if (!serviceToken) {
      return NextResponse.json({ error: "Servis yapılandırılmamış" }, { status: 500 });
    }

    await fetch(`${REALTIME_URL}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-service-token": serviceToken },
      body: JSON.stringify({
        command: "call:reject",
        conversationId,
        toUserId: fromUserId || null, // arayan = call:rejected hedefi
        byUserId: null, // kilitli cihaz reddedenin id'sini güvenle veremez
      }),
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("call/reject:", e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
