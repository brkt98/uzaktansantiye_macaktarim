import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readFile, stat, open } from "fs/promises";
import path from "path";
import { isThumbRequest, existingThumbPath } from "@/lib/mediaThumb";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { filename } = await params;
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Geçersiz dosya adı" }, { status: 400 });
    }

    let filePath = path.join(UPLOAD_DIR, "sales", filename);
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(path.join(UPLOAD_DIR, "sales"));
    if (!resolvedPath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Geçersiz yol" }, { status: 400 });
    }

    // ?size=thumb → küçük (400px webp) sürümü servis et (varsa); yoksa orijinale düş.
    let isThumb = false;
    if (isThumbRequest(_req.url)) {
      const t = await existingThumbPath(filePath);
      if (t) { filePath = t; isThumb = true; }
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", bmp: "image/bmp", webp: "image/webp", svg: "image/svg+xml",
      heic: "image/heic", heif: "image/heif", tiff: "image/tiff", tif: "image/tiff",
      mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
      avi: "video/x-msvideo", mkv: "video/x-matroska",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
      pdf: "application/pdf",
    };
    const contentType = isThumb ? "image/webp" : (mimeTypes[ext] || "application/octet-stream");
    const fileSize = fileStat.size;

    const rangeHeader = _req.headers.get("range");
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const fh = await open(filePath, "r");
        const buffer = Buffer.alloc(chunkSize);
        await fh.read(buffer, 0, chunkSize, start);
        await fh.close();

        return new NextResponse(buffer, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": String(chunkSize),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000",
          },
        });
      }
    }

    const fileBuffer = await readFile(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(fileSize),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (err) {
    console.error("Sales media serve error:", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}
