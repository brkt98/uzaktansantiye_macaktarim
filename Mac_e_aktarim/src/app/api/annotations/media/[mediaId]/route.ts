import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { unlink } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// DELETE /api/annotations/media/[mediaId] — tekil medya sil
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { mediaId } = await params;

    const media = await prisma.annotationMedia.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    // Dosyayı diskten sil
    const urlParts = media.fileUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    const annotationId = urlParts[urlParts.length - 3]; // /api/annotations/{id}/media/{filename}
    const filePath = path.join(UPLOAD_DIR, "annotations", annotationId, filename);

    try {
      await unlink(filePath);
    } catch {
      // Dosya zaten yoksa sorun değil
    }

    await prisma.annotationMedia.delete({ where: { id: mediaId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Media delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH /api/annotations/media/[mediaId] — medya başlık/açıklama güncelle
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { mediaId } = await params;
    const body = await req.json();
    const { title, description } = body;

    const media = await prisma.annotationMedia.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    const updated = await prisma.annotationMedia.update({
      where: { id: mediaId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });

    return NextResponse.json({ media: updated });
  } catch (error) {
    console.error("Media update error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
