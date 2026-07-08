import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// DELETE /api/ariza/[id]/media/[mediaId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id, mediaId } = await params;
    const media = await prisma.ariszaMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.ariszaId !== id) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    try {
      const abs = path.resolve(path.join(UPLOAD_DIR, media.url));
      const base = path.resolve(UPLOAD_DIR);
      if (abs.startsWith(base + path.sep)) {
        await fs.unlink(abs).catch(() => {});
      }
    } catch {
      // ignore
    }

    await prisma.ariszaMedia.delete({ where: { id: mediaId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ariza media DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
