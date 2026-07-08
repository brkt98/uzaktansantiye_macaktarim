import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const URL_RE = /(https?:\/\/[^\s]+)/g;

// GET /api/chat/conversations/[id]/attachments → { media, docs, links }
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const part = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      select: { id: true },
    });
    if (!part) return NextResponse.json({ error: "Bu konuşmaya erişiminiz yok" }, { status: 403 });

    const msgs = await prisma.message.findMany({
      where: { conversationId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, body: true, attachmentUrl: true, createdAt: true },
      take: 500,
    });

    const media: { id: string; type: string; url: string; fileName: string; createdAt: Date }[] = [];
    const docs: { id: string; url: string; fileName: string; createdAt: Date }[] = [];
    const links: { id: string; url: string; createdAt: Date }[] = [];

    for (const m of msgs) {
      if ((m.type === "image" || m.type === "video") && m.attachmentUrl) {
        media.push({ id: m.id, type: m.type, url: m.attachmentUrl, fileName: m.body || "", createdAt: m.createdAt });
      } else if (m.type === "file" && m.attachmentUrl) {
        docs.push({ id: m.id, url: m.attachmentUrl, fileName: m.body || "Dosya", createdAt: m.createdAt });
      } else if (m.type === "text" && m.body) {
        const found = m.body.match(URL_RE);
        if (found) found.forEach((u, i) => links.push({ id: `${m.id}-${i}`, url: u, createdAt: m.createdAt }));
      }
    }

    return NextResponse.json({ media, docs, links });
  } catch (error) {
    console.error("chat attachments GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
