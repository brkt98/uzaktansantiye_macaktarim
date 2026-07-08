import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

type Segment = {
  id: string;
  text: string;
  userId: string;
  userName: string;
  at: string;
  deletedAt?: string | null;
};

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

// DELETE /api/shared-notes/[id] — Paylaşımdan kaldır
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const shared = await prisma.sharedNote.findUnique({ where: { id } });
    if (!shared) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    if (shared.sharedByUserId !== user.id && !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    await prisma.note.updateMany({
      where: { sharedNoteId: id },
      data: { sharedNoteId: null },
    });

    await prisma.sharedNote.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("shared-notes DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH /api/shared-notes/[id]
// body: { action: "append", text } | { action: "deleteSegment", segmentId } | { action: "editTitle", title }
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const shared = await prisma.sharedNote.findUnique({ where: { id } });
    if (!shared) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    const body = await request.json();
    const action = body?.action as string;
    const segments = normalizeSegments(shared);

    const admin = isAdmin(user.roles);
    const userName = `${user.firstName} ${user.lastName}`.trim() || user.email || "Kullanıcı";

    if (action === "append") {
      const text = String(body.text || "").trim();
      if (!text) return NextResponse.json({ error: "Bos icerik" }, { status: 400 });
      const newSeg: Segment = {
        id: uuidv4(),
        text,
        userId: user.id,
        userName,
        at: new Date().toISOString(),
      };
      const next = [...segments, newSeg];
      const updated = await prisma.sharedNote.update({
        where: { id },
        data: {
          segments: next as unknown as object,
          content: next.filter((s) => !s.deletedAt).map((s) => s.text).join("\n\n"),
        },
      });
      return NextResponse.json({ shared: { ...updated, segments: next } });
    }

    if (action === "deleteSegment") {
      const segmentId = String(body.segmentId || "");
      const idx = segments.findIndex((s) => s.id === segmentId);
      if (idx === -1) return NextResponse.json({ error: "Segment yok" }, { status: 404 });
      const seg = segments[idx];
      const canDelete = admin || seg.userId === user.id;
      if (!canDelete) return NextResponse.json({ error: "Bu girisi silme yetkiniz yok" }, { status: 403 });
      const next = segments.filter((s) => s.id !== segmentId);
      const updated = await prisma.sharedNote.update({
        where: { id },
        data: {
          segments: next as unknown as object,
          content: next.filter((s) => !s.deletedAt).map((s) => s.text).join("\n\n"),
        },
      });
      return NextResponse.json({ shared: { ...updated, segments: next } });
    }

    if (action === "editTitle") {
      if (shared.sharedByUserId !== user.id && !admin) {
        return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
      }
      const title = String(body.title || "").trim();
      const updated = await prisma.sharedNote.update({
        where: { id },
        data: { title },
      });
      return NextResponse.json({ shared: { ...updated, segments } });
    }

    return NextResponse.json({ error: "Gecersiz action" }, { status: 400 });
  } catch (error) {
    console.error("shared-notes PATCH error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
