import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { unlink } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// DELETE /api/checklist-media/[id] — delete a checklist media file
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;

    const media = await prisma.unitChecklistMedia.findUnique({ where: { id } });
    if (!media) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    // Delete file from disk
    const urlParts = media.fileUrl.split("/");
    const annotationId = urlParts[urlParts.length - 2];
    const filename = urlParts[urlParts.length - 1];
    const diskPath = path.join(UPLOAD_DIR, "checklist-media", annotationId, filename);
    try { await unlink(diskPath); } catch {}

    // Delete from DB
    await prisma.unitChecklistMedia.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Checklist media delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
