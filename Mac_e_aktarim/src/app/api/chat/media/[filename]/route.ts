import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readFile, stat, open } from "fs/promises";
import path from "path";
import { isThumbRequest, existingThumbPath } from "@/lib/mediaThumb";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// GET /api/chat/media/[filename]  (?size=thumb)
export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { filename } = await params;
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Geçersiz dosya adı" }, { status: 400 });
    }

    const baseDir = path.join(UPLOAD_DIR, "chat");
    let filePath = path.join(baseDir, filename);
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(baseDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Geçersiz yol" }, { status: 400 });
    }

    // ?size=thumb → küçük (400px webp) sürüm (varsa); yoksa orijinale düş.
    let isThumb = false;
    if (isThumbRequest(req.url)) {
      const t = await existingThumbPath(filePath);
      if (t) { filePath = t; isThumb = true; }
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      webp: "image/webp", bmp: "image/bmp", heic: "image/heic", heif: "image/heif",
      mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", opus: "audio/opus",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      zip: "application/zip", rar: "application/x-rar-compressed", "7z": "application/x-7z-compressed",
      txt: "text/plain",
    };
    const contentType = isThumb ? "image/webp" : (mimeTypes[ext] || "application/octet-stream");
    const fileSize = fileStat.size;

    // Range (ses/video oynatma — iOS)
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        const fh = await open(filePath, "r");
        const buf = Buffer.alloc(chunkSize);
        await fh.read(buf, 0, chunkSize, start);
        await fh.close();
        return new NextResponse(buf, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": String(chunkSize),
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=31536000",
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
        "Cache-Control": "private, max-age=31536000",
      },
    });
  } catch (err) {
    console.error("chat media serve error:", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}
