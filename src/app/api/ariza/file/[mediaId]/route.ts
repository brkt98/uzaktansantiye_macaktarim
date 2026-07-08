import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import path from "path";
import fs from "fs";
import { isThumbRequest, existingThumbPath } from "@/lib/mediaThumb";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// GET /api/ariza/file/[mediaId] — inline media (image/video) serving
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { mediaId } = await params;
    const media = await prisma.ariszaMedia.findUnique({ where: { id: mediaId } });
    if (!media) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    let abs = path.resolve(path.join(UPLOAD_DIR, media.url));
    const base = path.resolve(UPLOAD_DIR);
    if (!abs.startsWith(base + path.sep)) {
      return NextResponse.json({ error: "Geçersiz yol" }, { status: 400 });
    }
    if (!fs.existsSync(abs)) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    // ?size=thumb → küçük (400px webp) sürüm (varsa, resimler için); yoksa orijinal.
    let isThumb = false;
    if (isThumbRequest(_req.url) && (media.mimeType || "").startsWith("image/")) {
      const t = await existingThumbPath(abs);
      if (t) { abs = t; isThumb = true; }
    }

    const buffer = fs.readFileSync(abs);
    const headers = new Headers();
    headers.set("Content-Type", isThumb ? "image/webp" : (media.mimeType || "application/octet-stream"));
    headers.set("Content-Length", buffer.length.toString());
    headers.set("Cache-Control", "private, max-age=31536000");
    return new NextResponse(buffer, { status: 200, headers });
  } catch (error) {
    console.error("Ariza file GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
