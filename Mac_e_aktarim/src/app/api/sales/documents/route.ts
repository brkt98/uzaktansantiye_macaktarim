import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// Daire/Unit'e bagli belgeler (sozlesme, tapu, vb.). PDF + diger dosya
// turlerini kabul eder. fileName kullanici tarafindan inline edit edilebilir.
//
// GET ?targetType=&targetId=
// POST multipart: targetType, targetId, file, fileName?
// PATCH json: { documentId, fileName }
// DELETE ?documentId=

function validateTarget(t?: string | null) {
  return t === "unit" || t === "daire";
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get("targetType");
    const targetId = searchParams.get("targetId");
    if (!validateTarget(targetType) || !targetId) {
      return NextResponse.json(
        { error: "targetType & targetId zorunlu" },
        { status: 400 }
      );
    }

    const documents = await prisma.salesDocument.findMany({
      where: { targetType: targetType!, targetId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ documents });
  } catch (e) {
    console.error("SalesDocument GET error:", e);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const fd = await request.formData();
    const targetType = (fd.get("targetType") as string) || null;
    const targetId = (fd.get("targetId") as string) || null;
    const file = fd.get("file") as File | null;
    const customName = (fd.get("fileName") as string) || null;

    if (!validateTarget(targetType) || !targetId || !file) {
      return NextResponse.json(
        { error: "targetType/targetId/file zorunlu" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploadDir = path.join(UPLOAD_DIR, "sales-documents");
    await mkdir(uploadDir, { recursive: true });
    const ext = path.extname(file.name) || "";
    const uniqueName = `${uuidv4()}${ext}`;
    await writeFile(path.join(uploadDir, uniqueName), buffer);

    const document = await prisma.salesDocument.create({
      data: {
        targetType: targetType!,
        targetId: targetId!,
        fileName: customName?.trim() || file.name,
        fileUrl: `/api/sales/documents/file/${uniqueName}`,
        mimeType: file.type || "application/octet-stream",
        fileSize: buffer.length,
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (e) {
    console.error("SalesDocument POST error:", e);
    return NextResponse.json({ error: "Yuklenemedi" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await request.json();
    const { documentId, fileName } = body || {};
    if (!documentId || !fileName || !String(fileName).trim()) {
      return NextResponse.json(
        { error: "documentId & fileName zorunlu" },
        { status: 400 }
      );
    }

    const document = await prisma.salesDocument.update({
      where: { id: documentId },
      data: { fileName: String(fileName).trim() },
    });
    return NextResponse.json({ document });
  } catch (e) {
    console.error("SalesDocument PATCH error:", e);
    return NextResponse.json({ error: "Guncellenemedi" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json({ error: "documentId zorunlu" }, { status: 400 });
    }

    const doc = await prisma.salesDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) return NextResponse.json({ error: "Bulunamadi" }, { status: 404 });

    try {
      const fname = doc.fileUrl.split("/").pop();
      if (fname) {
        await unlink(
          path.join(UPLOAD_DIR, "sales-documents", fname)
        );
      }
    } catch {
      /* sessiz */
    }

    await prisma.salesDocument.delete({ where: { id: documentId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("SalesDocument DELETE error:", e);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
