import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type Segment = {
  id: string;
  text: string;
  userId: string;
  userName: string;
  at: string;
  deletedAt?: string | null;
};

// Eski paylasimi (segments null) tek bir baslangic segment olarak gosterirse,
// API katmaninda paylaşan kisi adina virtual segment uret.
function normalizeSegments(s: {
  segments: unknown;
  content: string;
  createdAt: Date;
  sharedByUserId: string;
  sharedByName: string;
  id: string;
}): Segment[] {
  if (Array.isArray(s.segments)) return s.segments as Segment[];
  if (!s.content) return [];
  return [
    {
      id: `legacy-${s.id}`,
      text: s.content,
      userId: s.sharedByUserId,
      userName: s.sharedByName,
      at: s.createdAt.toISOString(),
    },
  ];
}

// GET /api/shared-notes — Tüm kullanıcılarda görünen Paylaşımlar listesi
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const shared = await prisma.sharedNote.findMany({
      orderBy: { updatedAt: "desc" },
    });

    const list = shared.map((s) => ({
      id: s.id,
      originalNoteId: s.originalNoteId,
      sharedByUserId: s.sharedByUserId,
      sharedByName: s.sharedByName,
      title: s.title,
      content: s.content,
      segments: normalizeSegments(s),
      isMine: s.sharedByUserId === user.id,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return NextResponse.json({ shared: list });
  } catch (error) {
    console.error("shared-notes GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
