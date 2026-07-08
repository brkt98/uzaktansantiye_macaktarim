import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir, readFile, stat, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { imagesToSlideshow } from "@/lib/video-convert";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const maxDuration = 300;

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

function pickSlideshowMusic(): string | null {
  const envPath = process.env.SLIDESHOW_MUSIC;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = [
    path.join(process.cwd(), "public", "audio", "slideshow.mp3"),
    path.join(process.cwd(), "assets", "slideshow.mp3"),
    "/app/public/audio/slideshow.mp3",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// POST { perImageSec? } -> creates a slideshow video from daire image media
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; daireId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { daireId } = await params;

    let body: { perImageSec?: number } = {};
    try {
      body = await req.json();
    } catch {}
    const perImageSec = Math.min(Math.max(body.perImageSec ?? 3, 1), 10);

    const media = await prisma.salesDaireMedia.findMany({
      where: { daireId, mimeType: { startsWith: "image/" } },
      orderBy: { createdAt: "asc" },
    });
    if (media.length === 0)
      return NextResponse.json({ error: "Slideshow icin fotograf yok" }, { status: 400 });

    const tmpDir = path.join(os.tmpdir(), "slide-" + uuidv4());
    await mkdir(tmpDir, { recursive: true });

    const inputPaths: string[] = [];
    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      const fname = m.fileUrl.split("/").pop() || "";
      const src = path.join(UPLOAD_DIR, "sales", fname);
      const ext = path.extname(fname) || ".jpg";
      const dst = path.join(tmpDir, `i${i}${ext}`);
      try {
        const buf = await readFile(src);
        await writeFile(dst, buf);
        inputPaths.push(dst);
      } catch (e) {
        console.warn("slideshow: skip missing", src);
      }
    }
    if (inputPaths.length === 0)
      return NextResponse.json({ error: "Kullanilabilir fotograf bulunamadi" }, { status: 400 });

    const outName = `slide-${uuidv4()}.mp4`;
    const outDir = path.join(UPLOAD_DIR, "sales");
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, outName);

    await imagesToSlideshow(inputPaths, outPath, perImageSec, pickSlideshowMusic());

    // temizlik
    for (const p of inputPaths) {
      try { await unlink(p); } catch {}
    }

    const st = await stat(outPath);

    const saved = await prisma.salesDaireMedia.create({
      data: {
        daireId,
        fileName: `slideshow-${new Date().toISOString().slice(0, 10)}.mp4`,
        fileUrl: `/api/sales/media/${outName}`,
        mimeType: "video/mp4",
        fileSize: st.size,
        title: "Slideshow",
      },
    });

    return NextResponse.json({ media: saved });
  } catch (err) {
    console.error("slideshow POST error", err);
    return NextResponse.json({ error: "Slideshow olusturulamadi" }, { status: 500 });
  }
}
