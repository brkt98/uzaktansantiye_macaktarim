import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readFile, stat } from "fs/promises";
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
      return NextResponse.json({ error: "Gecersiz dosya" }, { status: 400 });
    }

    const base = path.join(UPLOAD_DIR, "notes-images");
    let filePath = path.join(base, filename);
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(base);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Gecersiz yol" }, { status: 400 });
    }

    // ?size=thumb → küçük (400px webp) sürüm (varsa); yoksa orijinale düş.
    let isThumb = false;
    if (isThumbRequest(_req.url)) {
      const t = await existingThumbPath(filePath);
      if (t) { filePath = t; isThumb = true; }
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const contentType = isThumb ? "image/webp" :
      ext === "png" ? "image/png" :
      ext === "gif" ? "image/gif" :
      ext === "webp" ? "image/webp" :
      ext === "heic" || ext === "heif" ? "image/heic" :
      "image/jpeg";

    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (err) {
    console.error("notes-image serve err", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}
