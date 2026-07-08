import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST /api/chat/conversations/[id]/read — okundu işaretle (lastReadAt = şimdi)
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const now = new Date();
    const updated = await prisma.conversationParticipant.updateMany({
      where: { conversationId: id, userId: user.id },
      data: { lastReadAt: now },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Bu konuşmaya erişiminiz yok" }, { status: 403 });
    }

    await prisma.messageReceipt.updateMany({
      where: { userId: user.id, readAt: null, message: { conversationId: id } },
      data: { readAt: now },
    });

    // Socket-DIŞI okundu (bildirimden "Okundu yap") → realtime'a yayınla ki gönderenin mavi tiki
    // CANLI olsun. Socket yolu kendi "read" emit'ini yapıyor (x-from-socket) → atla, çift olmaz.
    if (request.headers.get("x-from-socket") !== "1") {
      const realtimeUrl = process.env.REALTIME_INTERNAL_URL || "http://realtime:4828";
      const serviceToken = process.env.REALTIME_SERVICE_TOKEN;
      if (serviceToken) {
        try {
          await fetch(`${realtimeUrl}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-service-token": serviceToken },
            body: JSON.stringify({ command: "read:broadcast", conversationId: id, userId: user.id }),
          });
        } catch {
          /* realtime erişilemezse okundu yine kalıcı; canlı yayın atlanır */
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("chat read POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
