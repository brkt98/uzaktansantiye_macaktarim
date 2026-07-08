import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readFile, stat } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// GET /api/annotations/[id]/media/[filename] — medya dosyasını sun
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id, filename } = await params;

    // Path traversal koruması
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Geçersiz dosya adı" }, { status: 400 });
    }

    const filePath = path.join(UPLOAD_DIR, "annotations", id, filename);

    // Dosyanın gerçekten annotations altında olduğunu doğrula
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(path.join(UPLOAD_DIR, "annotations"));
    if (!resolvedPath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Geçersiz yol" }, { status: 400 });
    }

    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    const fileBuffer = await readFile(filePath);
    const ext = filename.split(".").pop()?.toLowerCase() || "";

    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", bmp: "image/bmp", webp: "image/webp", svg: "image/svg+xml",
      mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
      avi: "video/x-msvideo", mkv: "video/x-matroska",
      heic: "image/heic", heif: "image/heif",
    };

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Media serve error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
