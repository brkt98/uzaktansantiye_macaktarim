import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Yorum ekle
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const body = await request.json();
    const { text, workItemId, taskEntryId, documentId } = body;

    if (!text) {
      return NextResponse.json({ error: "Yorum metni gereklidir" }, { status: 400 });
    }

    const comment = await prisma.comment.create({
      data: {
        userId: user.id,
        text,
        workItemId,
        taskEntryId,
        documentId,
      },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Comments POST error:", error);
    return NextResponse.json({ error: "Yorum eklenirken hata oluştu" }, { status: 500 });
  }
}

// Yorumları getir
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workItemId = searchParams.get("workItemId");
    const taskEntryId = searchParams.get("taskEntryId");
    const documentId = searchParams.get("documentId");

    const where: Record<string, unknown> = {};
    if (workItemId) where.workItemId = workItemId;
    if (taskEntryId) where.taskEntryId = taskEntryId;
    if (documentId) where.documentId = documentId;

    const comments = await prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Comments GET error:", error);
    return NextResponse.json({ error: "Yorumlar getirilirken hata oluştu" }, { status: 500 });
  }
}
