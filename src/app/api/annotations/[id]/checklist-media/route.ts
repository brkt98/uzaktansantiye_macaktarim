import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_MEDIA_SIZE = 104857600; // 100MB

const ALLOWED_MEDIA = new Set([
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
  "mp4", "mov", "webm", "avi", "mkv",
  "heic", "heif",
]);

// GET /api/annotations/[id]/checklist-media — get all checklist media for a pin
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;

    const media = await prisma.unitChecklistMedia.findMany({
      where: { annotationId: id },
      orderBy: { createdAt: "desc" },
    });

    // Group by checklistItemId
    const grouped: Record<string, typeof media> = {};
    for (const m of media) {
      if (!grouped[m.checklistItemId]) grouped[m.checklistItemId] = [];
      grouped[m.checklistItemId].push(m);
    }

    return NextResponse.json({ media: grouped });
  } catch (error) {
    console.error("Checklist media GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/annotations/[id]/checklist-media — upload media to a checklist item
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;

    // Verify annotation exists
    const annotation = await prisma.pdfAnnotation.findUnique({ where: { id } });
    if (!annotation) return NextResponse.json({ error: "Pin bulunamadı" }, { status: 404 });

    const formData = await req.formData();
    const checklistItemId = formData.get("checklistItemId") as string;
    const file = formData.get("file") as File | null;

    if (!checklistItemId || !file) {
      return NextResponse.json({ error: "Eksik alanlar" }, { status: 400 });
    }

    // Verify checklist item exists (can be UnitChecklistTemplate or Category)
    const templateItem = await prisma.unitChecklistTemplate.findUnique({ where: { id: checklistItemId } });
    const categoryItem = templateItem ? null : await prisma.category.findUnique({ where: { id: checklistItemId } });
    if (!templateItem && !categoryItem) return NextResponse.json({ error: "Kontrol listesi maddesi bulunamadı" }, { status: 404 });

    if (file.size > MAX_MEDIA_SIZE) {
      return NextResponse.json({ error: "Dosya çok büyük (max 100MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_MEDIA.has(ext)) {
      return NextResponse.json({ error: "Desteklenmeyen dosya türü" }, { status: 400 });
    }

    // Save file
    const dirPath = path.join(UPLOAD_DIR, "checklist-media", id);
    await mkdir(dirPath, { recursive: true });

    const safeFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await maybeOptimizeImage(buffer, file.type || `image/${ext}`, safeFileName);
    const finalName = optimized.fileName;
    const filePath = path.join(dirPath, finalName);
    await writeFile(filePath, optimized.buffer);
    if (optimized.thumbnail) {
      await writeFile(path.join(dirPath, thumbFileName(finalName)), optimized.thumbnail.buffer);
    }

    const fileUrl = `/api/annotations/${id}/checklist-media/${finalName}`;

    const media = await prisma.unitChecklistMedia.create({
      data: {
        id: randomUUID(),
        annotationId: id,
        checklistItemId,
        fileName: file.name,
        fileUrl,
        mimeType: optimized.mimeType,
        fileSize: optimized.buffer.length,
      },
    });

    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    console.error("Checklist media upload error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
