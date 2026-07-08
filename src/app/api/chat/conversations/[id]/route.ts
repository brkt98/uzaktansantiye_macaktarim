import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const participantUserSelect = { id: true, firstName: true, lastName: true, username: true, avatarUrl: true } as const;
const convInclude = { participants: { include: { user: { select: participantUserSelect } } } } as const;

// GET /api/chat/conversations/[id] — üyelik kontrolü (realtime servisi join öncesi çağırır)
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;
    const p = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      select: { id: true },
    });
    if (!p) return NextResponse.json({ error: "Erişiminiz yok" }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH /api/chat/conversations/[id]  { title?, avatarUrl? } — yalnızca grup yöneticisi
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const me = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      select: { role: true },
    });
    if (!me) return NextResponse.json({ error: "Bu konuşmaya erişiminiz yok" }, { status: 403 });
    if (me.role !== "admin") return NextResponse.json({ error: "Yalnızca yönetici düzenleyebilir" }, { status: 403 });

    const conv = await prisma.conversation.findUnique({ where: { id }, select: { isGroup: true } });
    if (!conv || !conv.isGroup) return NextResponse.json({ error: "Yalnızca gruplar düzenlenebilir" }, { status: 400 });

    const { title, avatarUrl } = await request.json();
    const data: { title?: string | null; avatarUrl?: string | null } = {};
    if (typeof title === "string") data.title = title.trim() || null;
    if (typeof avatarUrl === "string") data.avatarUrl = avatarUrl || null;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Değişiklik yok" }, { status: 400 });
    }

    const conversation = await prisma.conversation.update({ where: { id }, data, include: convInclude });
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("chat conversation PATCH error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
