import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "crypto";

// POST /api/annotations — yeni pin oluştur
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const body = await req.json();
    const { documentId, pageNumber, xPercent, yPercent, label, unitId } = body;

    if (!documentId || xPercent == null || yPercent == null) {
      return NextResponse.json({ error: "Eksik alanlar" }, { status: 400 });
    }

    // Doküman var mı kontrol et
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      return NextResponse.json({ error: "Doküman bulunamadı" }, { status: 404 });
    }

    const annotation = await prisma.pdfAnnotation.create({
      data: {
        id: randomUUID(),
        documentId,
        pageNumber: pageNumber || 1,
        xPercent: Number(xPercent),
        yPercent: Number(yPercent),
        label: label || null,
        unitId: unitId || null,
        createdBy: user.id,
      },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        media: true,
      },
    });

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (error) {
    console.error("Annotation create error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
