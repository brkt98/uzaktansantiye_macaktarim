import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Daire başına medya: GET listele, POST yükle, DELETE sil

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; daireId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { daireId } = await params;
    const media = await prisma.salesDaireMedia.findMany({
      where: { daireId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ media });
  } catch (err) {
    console.error("Sales daire media GET error:", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

// POST: FormData(file, title?, description?)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; daireId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { daireId } = await params;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || null;
    const description = (formData.get("description") as string) || null;
    if (!file) return NextResponse.json({ error: "Dosya zorunlu" }, { status: 400 });

    const exists = await prisma.salesDaire.findUnique({ where: { id: daireId } });
    if (!exists) return NextResponse.json({ error: "Daire bulunamadı" }, { status: 404 });

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

    const media = await prisma.salesDaireMedia.create({
      data: {
        daireId,
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
    console.error("Sales daire media POST error:", err);
    return NextResponse.json({ error: "Yüklenemedi" }, { status: 500 });
  }
}

// DELETE ?mediaId=
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; daireId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    await params;
    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get("mediaId");
    if (!mediaId) return NextResponse.json({ error: "mediaId zorunlu" }, { status: 400 });

    const media = await prisma.salesDaireMedia.findUnique({ where: { id: mediaId } });
    if (!media) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    try {
      const fname = media.fileUrl.split("/").pop();
      if (fname) {
        const fp = path.join(process.cwd(), "uploads", "sales", fname);
        await unlink(fp);
      }
    } catch {
      // ignore
    }

    await prisma.salesDaireMedia.delete({ where: { id: mediaId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Sales daire media DELETE error:", err);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
