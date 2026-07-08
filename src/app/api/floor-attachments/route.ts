import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/floor-attachments?blockId=xxx or ?documentId=xxx — kat-sayfa bağlantılarını getir
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const blockId = req.nextUrl.searchParams.get("blockId");
    const documentId = req.nextUrl.searchParams.get("documentId");

    if (!blockId && !documentId) {
      return NextResponse.json({ error: "blockId veya documentId gerekli" }, { status: 400 });
    }

    const where: Record<string, unknown> = {};
    if (blockId) where.floor = { blockId };
    if (documentId) where.documentId = documentId;

    let attachments = await prisma.floorPageAttachment.findMany({
      where,
      include: {
        floor: { select: { id: true, name: true, order: true } },
        document: { select: { id: true, fileName: true, fileUrl: true } },
      },
      orderBy: { pageNumber: "asc" },
    });

    // Kopya belge ise ve kendi kat ataması yoksa, kaynak belgenin kat atamalarını kullan
    if (documentId && attachments.length === 0) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { sourceDocumentId: true },
      });
      if (doc?.sourceDocumentId) {
        attachments = await prisma.floorPageAttachment.findMany({
          where: { documentId: doc.sourceDocumentId },
          include: {
            floor: { select: { id: true, name: true, order: true } },
            document: { select: { id: true, fileName: true, fileUrl: true } },
          },
          orderBy: { pageNumber: "asc" },
        });
      }
    }

    // floorId bazlı grupla
    const grouped: Record<string, typeof attachments> = {};
    for (const att of attachments) {
      if (!grouped[att.floorId]) grouped[att.floorId] = [];
      grouped[att.floorId].push(att);
    }

    // pageNumber bazlı floor labels (PdfViewer için)
    const pageLabels: Record<number, string> = {};
    for (const att of attachments) {
      pageLabels[att.pageNumber] = att.floor.name;
    }

    return NextResponse.json({ attachments: grouped, pageLabels });
  } catch (error) {
    console.error("Floor attachments GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/floor-attachments — yeni bağlantı oluştur
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { floorId, documentId, pageNumber } = await req.json();

    if (!floorId || !documentId || !pageNumber) {
      return NextResponse.json({ error: "floorId, documentId ve pageNumber gerekli" }, { status: 400 });
    }

    const attachment = await prisma.floorPageAttachment.create({
      data: { floorId, documentId, pageNumber: Number(pageNumber) },
      include: {
        document: { select: { id: true, fileName: true, fileUrl: true } },
      },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Bu sayfa zaten bu kata bağlı" }, { status: 409 });
    }
    console.error("Floor attachment POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/floor-attachments?id=xxx — bağlantı sil
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id gerekli" }, { status: 400 });
    }

    await prisma.floorPageAttachment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Floor attachment DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
