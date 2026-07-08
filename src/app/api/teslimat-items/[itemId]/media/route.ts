import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// POST /api/teslimat-items/[itemId]/media — bir teslimat kalemine fotoğraf/video yükle
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { itemId } = await params;
    const item = await prisma.teslimatItem.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ error: "Kalem bulunamadı" }, { status: 404 });

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Dosya gerekli" }, { status: 400 });
    }

    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "video/mp4", "video/quicktime", "video/webm",
    ];
    const created: { id: string; url: string; mimeType: string; fileName: string | null }[] = [];

    for (const file of files) {
      if (!allowed.includes(file.type)) continue;
      if (file.size > 50 * 1024 * 1024) continue; // 50MB max

      const ext = path.extname(file.name) || (file.type.startsWith("video") ? ".mp4" : ".jpg");
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || `media${ext}`;
      const inputBuffer = Buffer.from(await file.arrayBuffer());
      const optimized = await maybeOptimizeImage(inputBuffer, file.type, sanitized);
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${optimized.fileName}`;
      const relDir = path.join("teslimat", item.teslimatId, itemId);
      const absDir = path.join(UPLOAD_DIR, relDir);
      await fs.mkdir(absDir, { recursive: true });

      const absPath = path.join(absDir, fileName);
      const resolvedBase = path.resolve(UPLOAD_DIR);
      const resolvedPath = path.resolve(absPath);
      if (!resolvedPath.startsWith(resolvedBase + path.sep)) continue;

      await fs.writeFile(absPath, optimized.buffer);
      if (optimized.thumbnail) {
        await fs.writeFile(path.join(absDir, thumbFileName(fileName)), optimized.thumbnail.buffer);
      }
      const relPath = path.join(relDir, fileName).replace(/\\/g, "/");

      const media = await prisma.teslimatItemMedia.create({
        data: {
          teslimatItemId: itemId,
          url: relPath,
          mimeType: optimized.mimeType,
          fileName: file.name,
        },
      });

      created.push({
        id: media.id,
        url: media.url,
        mimeType: media.mimeType,
        fileName: media.fileName,
      });
    }

    return NextResponse.json({ media: created }, { status: 201 });
  } catch (error) {
    console.error("Teslimat item media upload error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// GET /api/teslimat-items/[itemId]/media — kalem medyalarını listele
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { itemId } = await params;
    const media = await prisma.teslimatItemMedia.findMany({
      where: { teslimatItemId: itemId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ media });
  } catch (error) {
    console.error("Teslimat item media list error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
