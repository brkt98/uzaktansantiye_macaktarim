import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AccessToken } from "livekit-server-sdk";

export const runtime = "nodejs";

// POST /api/rtc/token  { conversationId }  → LiveKit erişim token'ı
// Oda adı: conv-<conversationId> (arayan + aranan aynı odaya katılır).
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "LiveKit yapılandırılmamış" }, { status: 503 });
  }

  const { conversationId, screen } = await request.json();
  if (!conversationId || typeof conversationId !== "string") {
    return NextResponse.json({ error: "conversationId gerekli" }, { status: 400 });
  }
  // ADDITIVE: ekran paylaşımı için ayrı bir "-screen" identity'li token istendi mi?
  // Yetki kontrolü AYNEN user.id üzerinden yapılır; sadece üretilen token identity'si değişir.
  const isScreen = screen === true;

  // Yetki: kullanıcı bu konuşmanın katılımcısı mı?
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { id: true },
  });
  if (!participant) {
    return NextResponse.json({ error: "Bu görüşmeye erişiminiz yok" }, { status: 403 });
  }

  const room = `conv-${conversationId}`;
  const baseName = `${user.firstName} ${user.lastName}`.trim() || user.username;
  // Ekran bağlantısı ana çağrı bağlantısıyla AYNI identity kullanırsa LiveKit DUPLICATE_IDENTITY
  // ile eski bağlantıyı düşürür → ana arama kopar. Bu yüzden "-screen" identity şart.
  const identity = isScreen ? `${user.id}-screen` : user.id;
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: isScreen ? `${baseName} (ekran)` : baseName,
    ttl: "2h",
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  const token = await at.toJwt();

  return NextResponse.json({ token, url, room });
}
