import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { convertToWebmFast } from "@/lib/video-convert";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_TARGETS = ["salesProject", "constructionSite"] as const;
type TargetType = (typeof ALLOWED_TARGETS)[number];

// GET ?targetType=&targetId=
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get("targetType");
    const targetId = searchParams.get("targetId");
    if (!targetType || !targetId)
      return NextResponse.json({ error: "Parametre eksik" }, { status: 400 });
    const promo = await (prisma as any).promoVideo.findUnique({
      where: { targetType_targetId: { targetType, targetId } },
    });
    return NextResponse.json({ promo });
  } catch (err) {
    console.error("promo-video GET error", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

// POST: FormData(targetType, targetId, file?, embedUrl?)
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const fd = await req.formData();
    const targetType = fd.get("targetType") as string;
    const targetId = fd.get("targetId") as string;
    const file = fd.get("file") as File | null;
    const embedUrl = (fd.get("embedUrl") as string | null) || null;

    if (!targetType || !targetId)
      return NextResponse.json({ error: "Hedef parametreleri eksik" }, { status: 400 });
    if (!ALLOWED_TARGETS.includes(targetType as TargetType))
      return NextResponse.json({ error: "Gecersiz hedef tipi" }, { status: 400 });
    if (!file && !embedUrl)
      return NextResponse.json({ error: "Dosya veya URL gerekli" }, { status: 400 });

    let videoUrl: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;

    if (file) {
      const ab = await file.arrayBuffer();
      const buf = Buffer.from(ab);

      const tmpDir = path.join(os.tmpdir(), "promo-" + uuidv4());
      await mkdir(tmpDir, { recursive: true });
      const inExt = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || ".mp4").toLowerCase();
      const inPath = path.join(tmpDir, "in" + inExt);
      const outName = `${uuidv4()}.webm`;
      const uploadDir = path.join(process.cwd(), "uploads", "sales-promo");
      await mkdir(uploadDir, { recursive: true });
      const outPath = path.join(uploadDir, outName);

      await writeFile(inPath, buf);
      try {
        await convertToWebmFast(inPath, outPath);
      } catch (e) {
        console.error("promo ffmpeg fail", e);
        return NextResponse.json({ error: "Video donusturulemedi" }, { status: 500 });
      } finally {
        try { await unlink(inPath); } catch {}
      }

      videoUrl = `/api/sales/promo-video/file/${outName}`;
      mimeType = "video/webm";
      const { stat } = await import("fs/promises");
      const st = await stat(outPath);
      fileSize = st.size;
    }

    // Eski dosyayi sil (varsa, replace ediyorsak)
    const existing = await (prisma as any).promoVideo.findUnique({
      where: { targetType_targetId: { targetType, targetId } },
    });
    if (existing?.videoUrl && videoUrl) {
      const old = existing.videoUrl.split("/").pop();
      if (old) {
        try {
          await unlink(path.join(process.cwd(), "uploads", "sales-promo", old));
        } catch {}
      }
    }

    const promo = await (prisma as any).promoVideo.upsert({
      where: { targetType_targetId: { targetType, targetId } },
      create: {
        targetType,
        targetId,
        videoUrl,
        embedUrl,
        mimeType,
        fileSize,
      },
      update: {
        videoUrl: videoUrl ?? existing?.videoUrl ?? null,
        embedUrl,
        mimeType: mimeType ?? existing?.mimeType ?? null,
        fileSize: fileSize ?? existing?.fileSize ?? null,
      },
    });

    return NextResponse.json({ promo });
  } catch (err) {
    console.error("promo-video POST error", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

// DELETE ?targetType=&targetId=
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get("targetType");
    const targetId = searchParams.get("targetId");
    if (!targetType || !targetId)
      return NextResponse.json({ error: "Parametre eksik" }, { status: 400 });
    const existing = await (prisma as any).promoVideo.findUnique({
      where: { targetType_targetId: { targetType, targetId } },
    });
    if (existing?.videoUrl) {
      const old = existing.videoUrl.split("/").pop();
      if (old) {
        try {
          await unlink(path.join(process.cwd(), "uploads", "sales-promo", old));
        } catch {}
      }
    }
    await (prisma as any).promoVideo.delete({
      where: { targetType_targetId: { targetType, targetId } },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("promo-video DELETE error", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}
