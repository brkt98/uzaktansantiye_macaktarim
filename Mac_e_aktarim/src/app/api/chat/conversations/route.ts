import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const participantUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  avatarUrl: true,
} as const;

// GET /api/chat/conversations — kullanıcının konuşmaları (son mesaj + okunmadı sayısı)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const convos = await prisma.conversation.findMany({
      where: { participants: { some: { userId: user.id } } },
      orderBy: { lastMessageAt: "desc" },
      include: {
        participants: { include: { user: { select: participantUserSelect } } },
        messages: {
          where: { deletedAt: null, hides: { none: { userId: user.id } } },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: { select: participantUserSelect } },
        },
      },
    });

    const conversations = await Promise.all(
      convos.map(async (c) => {
        const me = c.participants.find((p) => p.userId === user.id);
        const unread = me
          ? await prisma.message.count({
              where: {
                conversationId: c.id,
                createdAt: { gt: me.lastReadAt },
                senderId: { not: user.id },
                deletedAt: null,
                hides: { none: { userId: user.id } },
              },
            })
          : 0;
        return {
          id: c.id,
          isGroup: c.isGroup,
          title: c.title,
          avatarUrl: c.avatarUrl,
          createdBy: c.createdBy,
          lastMessageAt: c.lastMessageAt,
          participants: c.participants.map((p) => ({
            userId: p.userId,
            role: p.role,
            user: p.user,
          })),
          lastMessage: c.messages[0] ?? null,
          unread,
        };
      })
    );

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("chat/conversations GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/chat/conversations  { userIds: string[], title?: string }
// 1:1 ise mevcut konuşmayı döndürür (tekrar oluşturmaz).
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { userIds, title } = await request.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds gerekli" }, { status: 400 });
    }

    const ids = Array.from(new Set<string>([user.id, ...userIds]));
    if (ids.length < 2) {
      return NextResponse.json({ error: "En az bir diğer kullanıcı gerekli" }, { status: 400 });
    }

    const validCount = await prisma.user.count({ where: { id: { in: ids }, isActive: true } });
    if (validCount !== ids.length) {
      return NextResponse.json({ error: "Geçersiz kullanıcı" }, { status: 400 });
    }

    const isGroup = ids.length > 2 || Boolean(title);

    if (!isGroup) {
      const existing = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: ids.map((id) => ({ participants: { some: { userId: id } } })),
        },
        include: {
          participants: { include: { user: { select: participantUserSelect } } },
        },
      });
      if (existing && existing.participants.length === 2) {
        return NextResponse.json({ conversation: existing, existed: true });
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        isGroup,
        title: isGroup ? title ?? null : null,
        createdBy: user.id,
        participants: {
          create: ids.map((id) => ({
            userId: id,
            role: id === user.id ? "admin" : "member",
          })),
        },
      },
      include: {
        participants: { include: { user: { select: participantUserSelect } } },
      },
    });

    return NextResponse.json({ conversation, existed: false }, { status: 201 });
  } catch (error) {
    console.error("chat/conversations POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
