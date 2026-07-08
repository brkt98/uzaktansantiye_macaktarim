import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/annotations/by-document/[docId] — bir dokümana ait tüm pin'leri getir
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { docId } = await params;

    // Bu dokümanın kendi annotation'ları
    const annotations = await prisma.pdfAnnotation.findMany({
      where: { documentId: docId },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        media: {
          select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true, title: true, description: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Eğer bu doküman bir kopya ise, orijinal dokümanın annotation'larını da getir
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { sourceDocumentId: true },
    });

    if (doc?.sourceDocumentId) {
      const sourceAnnotations = await prisma.pdfAnnotation.findMany({
        where: { documentId: doc.sourceDocumentId },
        include: {
          creator: { select: { firstName: true, lastName: true } },
          media: {
            select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true, title: true, description: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      // Orijinal pin'leri 'inherited' olarak işaretle
      const inheritedAnnotations = sourceAnnotations.map((a) => ({
        ...a,
        inherited: true,
      }));

      const ownAnnotations = annotations.map((a) => ({
        ...a,
        inherited: false,
      }));

      return NextResponse.json({
        annotations: [...inheritedAnnotations, ...ownAnnotations],
      });
    }

    return NextResponse.json({ annotations });
  } catch (error) {
    console.error("Annotations fetch error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
