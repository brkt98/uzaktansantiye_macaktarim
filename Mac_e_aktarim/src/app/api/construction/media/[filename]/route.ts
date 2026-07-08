import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readFile, stat, open } from "fs/promises";
import path from "path";

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

    const { searchParams } = new URL(_req.url);
    const wantThumb = searchParams.get("size") === "thumb";

    let effectiveName = filename;
    const constructionDir = path.join(UPLOAD_DIR, "construction");

    if (wantThumb) {
      // Try <basename>.thumb.webp first, fall back to original if missing
      const dot = filename.lastIndexOf(".");
      const base = dot > 0 ? filename.slice(0, dot) : filename;
      const thumbCandidate = `${base}.thumb.webp`;
      const thumbStat = await stat(path.join(constructionDir, thumbCandidate)).catch(() => null);
      if (thumbStat) effectiveName = thumbCandidate;
    }

    const filePath = path.join(constructionDir, effectiveName);

    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(constructionDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Geçersiz yol" }, { status: 400 });
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    const ext = effectiveName.split(".").pop()?.toLowerCase() || "";

    const mimeTypes: Record<string, string> = {
      // Images
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", bmp: "image/bmp", webp: "image/webp", svg: "image/svg+xml",
      heic: "image/heic", heif: "image/heif", tiff: "image/tiff", tif: "image/tiff",
      // Video
      mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
      avi: "video/x-msvideo", mkv: "video/x-matroska",
      // Audio
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
      flac: "audio/flac", aac: "audio/aac",
      // Documents
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      // Archives
      zip: "application/zip", rar: "application/x-rar-compressed",
      "7z": "application/x-7z-compressed",
      // CAD
      dwg: "application/acad", dxf: "application/dxf",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";
    const fileSize = fileStat.size;

    // Range request support (required for iOS Safari video playback)
    const rangeHeader = _req.headers.get("range");
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const fileHandle = await open(filePath, "r");
        const buffer = Buffer.alloc(chunkSize);
        await fileHandle.read(buffer, 0, chunkSize, start);
        await fileHandle.close();

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
        "Content-Disposition": `inline; filename="${effectiveName}"`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(fileSize),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Construction media serve error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
