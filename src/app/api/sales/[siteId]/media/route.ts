import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Daire başına medya: GET listele, POST yükle, DELETE sil
// Medyalar SalesUnit'e bağlı; SalesUnit yoksa upsert ediyoruz.

// GET ?blockId=&daireName=
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const blockId = searchParams.get("blockId");
    const daireName = searchParams.get("daireName");
    if (!blockId || !daireName)
      return NextResponse.json(
        { error: "blockId & daireName zorunlu" },
        { status: 400 }
      );

    const unit = await prisma.salesUnit.findUnique({
      where: { siteId_blockId_daireName: { siteId, blockId, daireName } },
      include: { media: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json({ media: unit?.media ?? [] });
  } catch (err) {
    console.error("Sales media GET error:", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

// POST: FormData(file, blockId, daireName, title?, description?)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { siteId } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const blockId = formData.get("blockId") as string | null;
    const daireName = formData.get("daireName") as string | null;
    const title = (formData.get("title") as string) || null;
    const description = (formData.get("description") as string) || null;

    if (!file || !blockId || !daireName) {
      return NextResponse.json(
        { error: "file/blockId/daireName zorunlu" },
        { status: 400 }
      );
    }

    // SalesUnit'i upsert et
    const unit = await prisma.salesUnit.upsert({
      where: { siteId_blockId_daireName: { siteId, blockId, daireName } },
      update: {},
      create: { siteId, blockId, daireName },
    });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const optimized = await maybeOptimizeImage(buffer, file.type, file.name);

    const uploadDir = path.join(process.cwd(), "uploads", "sales");
    await mkdir(uploadDir, { recursive: true });

    const ext = path.extname(optimized.fileName) || path.extname(file.name);
    const uniqueName = `${uuidv4()}${ext}`;
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, optimized.buffer);
    if (optimized.thumbnail) {
      await writeFile(path.join(uploadDir, thumbFileName(uniqueName)), optimized.thumbnail.buffer);
    }

    const media = await prisma.salesUnitMedia.create({
      data: {
        unitId: unit.id,
        fileName: file.name,
        fileUrl: `/api/sales/media/${uniqueName}`,
        mimeType: optimized.mimeType,
        fileSize: optimized.buffer.length,
        title,
        description,
      },
    });

    return NextResponse.json({ media }, { status: 201 });
  } catch (err) {
    console.error("Sales media POST error:", err);
    return NextResponse.json({ error: "Yüklenemedi" }, { status: 500 });
  }
}

// DELETE ?mediaId=
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    await params; // siteId not needed for delete-by-id but keep API shape
    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get("mediaId");
    if (!mediaId)
      return NextResponse.json({ error: "mediaId zorunlu" }, { status: 400 });

    const media = await prisma.salesUnitMedia.findUnique({ where: { id: mediaId } });
    if (!media)
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    // Disk'ten sil
    try {
      const fname = media.fileUrl.split("/").pop();
      if (fname) {
        const fp = path.join(process.cwd(), "uploads", "sales", fname);
        await unlink(fp);
      }
    } catch {
      // sessizce devam
    }

    await prisma.salesUnitMedia.delete({ where: { id: mediaId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Sales media DELETE error:", err);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
