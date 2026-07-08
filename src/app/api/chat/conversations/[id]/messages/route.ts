import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const senderSelect = { id: true, firstName: true, lastName: true, username: true, avatarUrl: true } as const;

const messageInclude = {
  sender: { select: senderSelect },
  receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
  reactions: { select: { userId: true, emoji: true } },
  replyTo: { select: { id: true, type: true, body: true, deletedAt: true, sender: { select: { firstName: true, lastName: true } } } },
} as const;

type RawMessage = {
  id: string; conversationId: string; senderId: string; type: string; body: string;
  attachmentUrl: string | null; replyToId: string | null; forwarded: boolean;
  createdAt: Date; editedAt: Date | null; deletedAt: Date | null;
  sender: { id: string; firstName: string; lastName: string; username: string; avatarUrl: string | null };
  receipts: { userId: string; deliveredAt: Date | null; readAt: Date | null }[];
  reactions: { userId: string; emoji: string }[];
  replyTo: { id: string; type: string; body: string; deletedAt: Date | null; sender: { firstName: string; lastName: string } } | null;
};

// Mesajı UI biçimine getir: status (kendi), gruplu reaksiyonlar, yanıt özeti, tombstone
function shapeMessage(m: RawMessage, userId: string) {
  const deleted = !!m.deletedAt;
  let status: "sent" | "delivered" | "read" | undefined;
  if (m.senderId === userId && !deleted) {
    const recs = m.receipts;
    if (recs.length === 0) status = "sent";
    else if (recs.every((r) => r.readAt)) status = "read";
    else if (recs.every((r) => r.deliveredAt)) status = "delivered";
    else status = "sent";
  }

  const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of m.reactions) {
    const e = byEmoji.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
    e.count++;
    if (r.userId === userId) e.mine = true;
    byEmoji.set(r.emoji, e);
  }
  const reactions = deleted ? [] : Array.from(byEmoji.values());

  let replyTo: { id: string; type: string; body: string; senderName: string; deleted: boolean } | null = null;
  if (m.replyTo && !deleted) {
    const rt = m.replyTo;
    replyTo = {
      id: rt.id, type: rt.type, body: rt.deletedAt ? "" : rt.body,
      senderName: `${rt.sender.firstName} ${rt.sender.lastName}`.trim(), deleted: !!rt.deletedAt,
    };
  }

  const base = {
    id: m.id, conversationId: m.conversationId, senderId: m.senderId,
    createdAt: m.createdAt, forwarded: m.forwarded, sender: m.sender, status,
  };
  if (deleted) {
    return { ...base, type: "deleted", body: "", attachmentUrl: null, deleted: true, reactions: [], replyTo: null, replyToId: null };
  }
  return { ...base, type: m.type, body: m.body, attachmentUrl: m.attachmentUrl, replyToId: m.replyToId, deleted: false, reactions, replyTo };
}

async function isParticipant(conversationId: string, userId: string) {
  const p = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return Boolean(p);
}

// GET /api/chat/conversations/[id]/messages?limit=50&before=<ISO tarih>
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;
    if (!(await isParticipant(id, user.id))) {
      return NextResponse.json({ error: "Bu konuşmaya erişiminiz yok" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const before = searchParams.get("before");

    const raw = await prisma.message.findMany({
      where: {
        conversationId: id,
        hides: { none: { userId: user.id } }, // "benden sil" ile gizlenenler hariç
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: messageInclude,
    });
    raw.reverse();

    await prisma.messageReceipt.updateMany({
      where: { userId: user.id, deliveredAt: null, message: { conversationId: id } },
      data: { deliveredAt: new Date() },
    });

    const messages = raw.map((m) => shapeMessage(m as RawMessage, user.id));
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("chat messages GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST  { body, type?, attachmentUrl?, replyToId?, forwarded? }
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;
    if (!(await isParticipant(id, user.id))) {
      return NextResponse.json({ error: "Bu konuşmaya erişiminiz yok" }, { status: 403 });
    }

    const { body, type, attachmentUrl, replyToId, forwarded } = await request.json();
    const text = typeof body === "string" ? body.trim() : "";
    if (!text && !attachmentUrl) {
      return NextResponse.json({ error: "Boş mesaj" }, { status: 400 });
    }

    // Yanıt hedefi bu konuşmaya ait mi? (değilse yok say)
    let validReplyId: string | null = null;
    if (typeof replyToId === "string" && replyToId) {
      const rt = await prisma.message.findFirst({ where: { id: replyToId, conversationId: id }, select: { id: true } });
      if (rt) validReplyId = rt.id;
    }

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: id },
      select: { userId: true },
    });

    // Konuşma meta verisi (push bildirimi için: grup mu, başlık, avatar) — additive, akışı değiştirmez.
    const conversationMeta = await prisma.conversation.findUnique({
      where: { id },
      select: { isGroup: true, title: true, avatarUrl: true },
    });

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: id,
          senderId: user.id,
          type: typeof type === "string" ? type : "text",
          body: text,
          attachmentUrl: attachmentUrl || null,
          replyToId: validReplyId,
          forwarded: forwarded === true,
          receipts: {
            create: participants.filter((p) => p.userId !== user.id).map((p) => ({ userId: p.userId })),
          },
        },
        include: messageInclude,
      }),
      prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } }),
    ]);

    const shaped = shapeMessage(message as RawMessage, user.id);
    const participantIds = participants.map((p) => p.userId);

    // Socket-DIŞI gönderim (bildirimden cevap / web REST yedeği) → realtime'a yayınla ki online alıcı
    // CANLI görsün. Socket yolu kendi message:new yayınını yapıyor (x-from-socket başlığı) → atla → çift-emit olmaz.
    if (request.headers.get("x-from-socket") !== "1") {
      const realtimeUrl = process.env.REALTIME_INTERNAL_URL || "http://realtime:4828";
      const serviceToken = process.env.REALTIME_SERVICE_TOKEN;
      if (serviceToken) {
        try {
          await fetch(`${realtimeUrl}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-service-token": serviceToken },
            body: JSON.stringify({ command: "message:broadcast", message: shaped, participantIds, senderId: user.id }),
          });
        } catch {
          /* realtime erişilemezse mesaj yine kalıcı; canlı yayın atlanır (karşı taraf yenileyince görür) */
        }
      }
    }

    return NextResponse.json(
      {
        message: shaped,
        participantIds,
        conversation: conversationMeta
          ? { isGroup: conversationMeta.isGroup, title: conversationMeta.title, avatarUrl: conversationMeta.avatarUrl }
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("chat messages POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
