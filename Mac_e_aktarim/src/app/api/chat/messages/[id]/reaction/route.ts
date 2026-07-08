import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

async function isParticipant(conversationId: string, userId: string) {
  const p = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return Boolean(p);
}

// POST /api/chat/messages/[id]/reaction  { emoji } — tek reaksiyon/kullanıcı (aynı emoji→kaldır, farklı→değiştir)
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;
    const { emoji } = await request.json();
    if (!emoji || typeof emoji !== "string") return NextResponse.json({ error: "emoji gerekli" }, { status: 400 });

    const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, deletedAt: true } });
    if (!msg || msg.deletedAt) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 });
    if (!(await isParticipant(msg.conversationId, user.id))) {
      return NextResponse.json({ error: "Erişiminiz yok" }, { status: 403 });
    }

    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId: id, userId: user.id } },
    });
    if (existing) {
      if (existing.emoji === emoji) await prisma.messageReaction.delete({ where: { id: existing.id } });
      else await prisma.messageReaction.update({ where: { id: existing.id }, data: { emoji } });
    } else {
      await prisma.messageReaction.create({ data: { messageId: id, userId: user.id, emoji } });
    }

    const all = await prisma.messageReaction.findMany({ where: { messageId: id }, select: { userId: true, emoji: true } });
    const map = new Map<string, string[]>();
    for (const r of all) { const a = map.get(r.emoji) || []; a.push(r.userId); map.set(r.emoji, a); }
    const reactions = Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));

    return NextResponse.json({ conversationId: msg.conversationId, messageId: id, reactions });
  } catch (error) {
    console.error("chat reaction error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
