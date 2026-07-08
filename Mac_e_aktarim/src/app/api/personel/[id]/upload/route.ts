import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deleteMatchedPersonnelDocumentReferences, syncMatchedPersonnel } from "@/lib/personnel-sync";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// POST /api/personel/[id]/upload - yeni belge ekle (mevcutlari silmez)
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

    const personnel = await prisma.sitePersonnel.findUnique({ where: { id } });
    if (!personnel) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Dosya gerekli" }, { status: 400 });
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Desteklenmeyen dosya formatı. PDF, JPEG, PNG, WEBP veya Word dosyası yükleyin." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Dosya boyutu 10MB'ı geçemez" }, { status: 400 });
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const optimized = await maybeOptimizeImage(inputBuffer, file.type, sanitizedName);
    const fileName = `${Date.now()}_${optimized.fileName}`;
    const relDir = path.join("personel", id);
    const absDir = path.join(UPLOAD_DIR, relDir);
    await fs.mkdir(absDir, { recursive: true });

    const absPath = path.join(absDir, fileName);

    const resolvedBase = path.resolve(UPLOAD_DIR);
    const resolvedPath = path.resolve(absPath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Geçersiz dosya yolu" }, { status: 400 });
    }

    await fs.writeFile(absPath, optimized.buffer);
    if (optimized.thumbnail) {
      await fs.writeFile(path.join(absDir, thumbFileName(fileName)), optimized.thumbnail.buffer);
    }

    const relPath = path.join(relDir, fileName).replace(/\\/g, "/");

    const doc = await prisma.personnelDocument.create({
      data: {
        personnelId: id,
        url: relPath,
        fileName: file.name,
        mimeType: optimized.mimeType,
      },
    });

    await prisma.sitePersonnel.update({
      where: { id },
      data: { sgkDocUrl: relPath },
    });

    await syncMatchedPersonnel(id);

    return NextResponse.json({ document: doc });
  } catch (error) {
    console.error("Personel upload error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/personel/[id]/upload?docId=xxx - tek belge sil
// DELETE /api/personel/[id]/upload - tum belgeleri sil (legacy)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;
    const docId = req.nextUrl.searchParams.get("docId") || undefined;

    const personnel = await prisma.sitePersonnel.findUnique({ where: { id } });
    if (!personnel) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    const resolvedBase = path.resolve(UPLOAD_DIR);

    const tryUnlink = async (relUrl: string | null | undefined) => {
      if (!relUrl) return;
      try {
        const filePath = path.resolve(path.join(UPLOAD_DIR, relUrl));
        if (filePath.startsWith(resolvedBase)) {
          await fs.unlink(filePath).catch(() => {});
        }
      } catch {
        // ignore
      }
    };

    const result = await deleteMatchedPersonnelDocumentReferences(id, docId);
    if (!result.documentFound) {
      return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });
    }

    for (const url of result.unreferencedUrls) {
      await tryUnlink(url);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Personel delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
