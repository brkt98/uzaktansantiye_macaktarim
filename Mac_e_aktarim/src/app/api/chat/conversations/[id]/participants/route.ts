import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const participantUserSelect = { id: true, firstName: true, lastName: true, username: true, avatarUrl: true } as const;
const convInclude = { participants: { include: { user: { select: participantUserSelect } } } } as const;

// POST /api/chat/conversations/[id]/participants  { userIds: string[] } — üye ekle (yalnızca yönetici, grup)
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const conv = await prisma.conversation.findUnique({ where: { id }, select: { isGroup: true } });
    if (!conv) return NextResponse.json({ error: "Konuşma bulunamadı" }, { status: 404 });
    if (!conv.isGroup) return NextResponse.json({ error: "Yalnızca gruplara üye eklenebilir" }, { status: 400 });

    const me = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      select: { role: true },
    });
    if (!me) return NextResponse.json({ error: "Bu gruba erişiminiz yok" }, { status: 403 });
    if (me.role !== "admin") return NextResponse.json({ error: "Yalnızca yönetici üye ekleyebilir" }, { status: 403 });

    const { userIds } = await request.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds gerekli" }, { status: 400 });
    }
    const valid = await prisma.user.findMany({ where: { id: { in: userIds }, isActive: true }, select: { id: true } });
    if (valid.length > 0) {
      await prisma.conversationParticipant.createMany({
        data: valid.map((u) => ({ conversationId: id, userId: u.id, role: "member" })),
        skipDuplicates: true,
      });
    }

    const conversation = await prisma.conversation.findUnique({ where: { id }, include: convInclude });
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("chat participants POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/chat/conversations/[id]/participants  { userId } — üye çıkar (yönetici) veya gruptan ayrıl (kendisi)
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const me = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      select: { role: true },
    });
    if (!me) return NextResponse.json({ error: "Bu gruba erişiminiz yok" }, { status: 403 });

    const { userId } = await request.json();
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId gerekli" }, { status: 400 });
    }
    const isSelf = userId === user.id;

    if (!isSelf) {
      if (me.role !== "admin") {
        return NextResponse.json({ error: "Yalnızca yönetici üye çıkarabilir" }, { status: 403 });
      }
      // Bir yönetici başka yöneticiyi çıkaramaz — yalnızca grup kurucusu (yetki gaspı önlenir)
      const target = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: id, userId } },
        select: { role: true },
      });
      if (!target) return NextResponse.json({ error: "Kullanıcı bu grupta değil" }, { status: 404 });
      if (target.role === "admin") {
        const conv = await prisma.conversation.findUnique({ where: { id }, select: { createdBy: true } });
        if (!conv || user.id !== conv.createdBy) {
          return NextResponse.json({ error: "Yöneticiyi yalnızca grup kurucusu çıkarabilir" }, { status: 403 });
        }
      }
    }

    // Sil + grup asla yöneticisiz/boş kalmasın
    await prisma.$transaction(async (tx) => {
      await tx.conversationParticipant.deleteMany({ where: { conversationId: id, userId } });
      const remaining = await tx.conversationParticipant.count({ where: { conversationId: id } });
      if (remaining === 0) {
        await tx.conversation.delete({ where: { id } }); // mesajlar/receipt'ler cascade silinir
        return;
      }
      const adminCount = await tx.conversationParticipant.count({ where: { conversationId: id, role: "admin" } });
      if (adminCount === 0) {
        const oldest = await tx.conversationParticipant.findFirst({
          where: { conversationId: id }, orderBy: { joinedAt: "asc" }, select: { id: true },
        });
        if (oldest) await tx.conversationParticipant.update({ where: { id: oldest.id }, data: { role: "admin" } });
      }
    });

    if (isSelf) return NextResponse.json({ left: true });
    const conversation = await prisma.conversation.findUnique({ where: { id }, include: convInclude });
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("chat participants DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
