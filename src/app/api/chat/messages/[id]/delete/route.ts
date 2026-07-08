import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DELETE_EVERYONE_WINDOW_MS = 60_000; // 1 dakika

async function isParticipant(conversationId: string, userId: string) {
  const p = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return Boolean(p);
}

// POST /api/chat/messages/[id]/delete  { scope: "me" | "everyone" }
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;
    const { scope } = await request.json();

    const msg = await prisma.message.findUnique({
      where: { id },
      select: { senderId: true, conversationId: true, createdAt: true, deletedAt: true },
    });
    if (!msg) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 });
    if (!(await isParticipant(msg.conversationId, user.id))) {
      return NextResponse.json({ error: "Erişiminiz yok" }, { status: 403 });
    }

    if (scope === "everyone") {
      if (msg.senderId !== user.id) {
        return NextResponse.json({ error: "Yalnızca kendi mesajınızı herkesten silebilirsiniz" }, { status: 403 });
      }
      if (Date.now() - new Date(msg.createdAt).getTime() > DELETE_EVERYONE_WINDOW_MS) {
        return NextResponse.json({ error: "Herkesten silme süresi (1 dk) doldu" }, { status: 400 });
      }
      if (!msg.deletedAt) {
        await prisma.message.update({ where: { id }, data: { deletedAt: new Date(), body: "", attachmentUrl: null } });
      }
      return NextResponse.json({ conversationId: msg.conversationId, messageId: id, everyone: true });
    }

    // "benden sil"
    await prisma.messageHide.upsert({
      where: { messageId_userId: { messageId: id, userId: user.id } },
      create: { messageId: id, userId: user.id },
      update: {},
    });
    return NextResponse.json({ messageId: id, everyone: false });
  } catch (error) {
    console.error("chat delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
