import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// DELETE /api/teslimat-items/[itemId]/media/[mediaId] — bir medyayı sil
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string; mediaId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { itemId, mediaId } = await params;
    const media = await prisma.teslimatItemMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.teslimatItemId !== itemId) {
      return NextResponse.json({ error: "Medya bulunamadı" }, { status: 404 });
    }

    // Diskten dosyayı sil (varsa)
    try {
      const absPath = path.resolve(UPLOAD_DIR, media.url);
      const resolvedBase = path.resolve(UPLOAD_DIR);
      if (absPath.startsWith(resolvedBase + path.sep)) {
        await fs.unlink(absPath).catch(() => {});
      }
    } catch {
      // Diskte yoksa görmezden gel
    }

    await prisma.teslimatItemMedia.delete({ where: { id: mediaId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Teslimat item media delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
