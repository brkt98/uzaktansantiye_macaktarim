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

// GET /api/annotations/[id] — pin detayı + medyalar
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;

    const annotation = await prisma.pdfAnnotation.findUnique({
      where: { id },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        media: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!annotation) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    return NextResponse.json({ annotation });
  } catch (error) {
    console.error("Annotation get error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/annotations/[id] — pin sil (çöp kutusuna taşı, medya dosyaları korunur)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;

    const annotation = await prisma.pdfAnnotation.findUnique({
      where: { id },
      include: {
        media: true,
        checklistMedia: true,
        document: { select: { block: { select: { siteId: true } } } },
      },
    });

    if (!annotation) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    // Get unit name if unitId exists
    let unitName: string | null = null;
    if (annotation.unitId) {
      const unit = await prisma.unit.findUnique({ where: { id: annotation.unitId }, select: { name: true } });
      unitName = unit?.name || null;
    }

    // Save to trash before deleting
    await prisma.trashItem.create({
      data: {
        siteId: annotation.document.block?.siteId || '',
        itemType: "annotation",
        itemName: annotation.label || (annotation.unitId ? `Pin (${unitName})` : "Pin"),
        documentId: annotation.documentId,
        pageNumber: annotation.pageNumber,
        xPercent: annotation.xPercent,
        yPercent: annotation.yPercent,
        label: annotation.label,
        color: annotation.color,
        pinSize: annotation.pinSize,
        unitId: annotation.unitId,
        unitName,
        type: annotation.unitId ? "unit_pin" : "pin",
        deletedBy: user.id,
        deletedByName: `${user.firstName} ${user.lastName}`,
        originalData: {
          id: annotation.id,
          documentId: annotation.documentId,
          pageNumber: annotation.pageNumber,
          xPercent: annotation.xPercent,
          yPercent: annotation.yPercent,
          label: annotation.label,
          color: annotation.color,
          pinSize: annotation.pinSize,
          unitId: annotation.unitId,
          createdBy: annotation.createdBy,
          media: annotation.media.map(m => ({
            fileName: m.fileName,
            fileUrl: m.fileUrl,
            mimeType: m.mimeType,
            fileSize: m.fileSize,
            title: m.title,
            description: m.description,
          })),
          checklistMedia: annotation.checklistMedia.map(cm => ({
            checklistItemId: cm.checklistItemId,
            fileName: cm.fileName,
            fileUrl: cm.fileUrl,
            mimeType: cm.mimeType,
            fileSize: cm.fileSize,
          })),
        },
      },
    });

    // DB'den sil (cascade ile media kayıtları silinir, dosyalar diskte kalır)
    await prisma.pdfAnnotation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Annotation delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/annotations/[id] — medya yükle
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;

    const annotation = await prisma.pdfAnnotation.findUnique({ where: { id } });
    if (!annotation) {
      return NextResponse.json({ error: "Pin bulunamadı" }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Dosya seçilmedi" }, { status: 400 });
    }

    const mediaDir = path.join(UPLOAD_DIR, "annotations", id);
    await mkdir(mediaDir, { recursive: true });

    const uploaded: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string; fileSize: number; title: string | null; description: string | null }> = [];

    for (const file of files) {
      if (file.size > MAX_MEDIA_SIZE) {
        continue; // 50MB'den büyük dosyaları atla
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_MEDIA.has(ext)) {
        continue; // İzin verilmeyen uzantıları atla
      }

      // Sanitize filename
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const timestamp = Date.now();
      const baseStored = `${timestamp}_${safeName}`;

      const buffer = Buffer.from(await file.arrayBuffer());
      const optimized = await maybeOptimizeImage(buffer, file.type || `image/${ext}`, baseStored);
      const storedName = optimized.fileName;
      const filePath = path.join(mediaDir, storedName);
      await writeFile(filePath, optimized.buffer);
      if (optimized.thumbnail) {
        await writeFile(path.join(mediaDir, thumbFileName(storedName)), optimized.thumbnail.buffer);
      }

      const fileUrl = `/api/annotations/${id}/media/${storedName}`;
      const mediaId = randomUUID();

      await prisma.annotationMedia.create({
        data: {
          id: mediaId,
          annotationId: id,
          fileName: file.name,
          fileUrl,
          mimeType: optimized.mimeType,
          fileSize: optimized.buffer.length,
        },
      });

      uploaded.push({
        id: mediaId,
        fileName: file.name,
        fileUrl,
        mimeType: optimized.mimeType,
        fileSize: optimized.buffer.length,
        title: null,
        description: null,
      });
    }

    return NextResponse.json({ uploaded }, { status: 201 });
  } catch (error) {
    console.error("Media upload error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH /api/annotations/[id] — pin güncelle (label, color)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (typeof body.label === "string") data.label = body.label;
    if (typeof body.color === "string") data.color = body.color;
    if (typeof body.pinSize === "string" && ["small", "medium", "large"].includes(body.pinSize)) data.pinSize = body.pinSize;
    if (typeof body.xPercent === "number" && body.xPercent >= 0 && body.xPercent <= 1) data.xPercent = body.xPercent;
    if (typeof body.yPercent === "number" && body.yPercent >= 0 && body.yPercent <= 1) data.yPercent = body.yPercent;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
    }

    const annotation = await prisma.pdfAnnotation.update({
      where: { id },
      data,
      include: {
        creator: { select: { firstName: true, lastName: true } },
        media: true,
      },
    });

    return NextResponse.json({ annotation });
  } catch (error) {
    console.error("Annotation patch error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
