import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readFile, stat, open } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { filename } = await params;
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Gecersiz dosya" }, { status: 400 });
    }

    const filePath = path.join(UPLOAD_DIR, "notes-audio", filename);
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(path.join(UPLOAD_DIR, "notes-audio"));
    if (!resolvedPath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Gecersiz yol" }, { status: 400 });
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const contentType =
      ext === "webm" ? "audio/webm" :
      ext === "ogg" ? "audio/ogg" :
      ext === "m4a" ? "audio/mp4" :
      ext === "mp3" ? "audio/mpeg" :
      ext === "wav" ? "audio/wav" :
      "application/octet-stream";
    const fileSize = fileStat.size;

    const range = req.headers.get("range");
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : fileSize - 1;
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
            "Cache-Control": "public, max-age=31536000",
          },
        });
      }
    }

    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(fileSize),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (err) {
    console.error("notes-audio serve err", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}
