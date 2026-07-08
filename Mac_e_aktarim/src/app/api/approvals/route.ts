import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isManagerOrAbove } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isManagerOrAbove(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { status, comment, workItemId, taskEntryId, documentId } = body;

    const approval = await prisma.approval.create({
      data: {
        userId: user.id,
        status: status || "PENDING",
        comment,
        workItemId,
        taskEntryId,
        documentId,
      },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    return NextResponse.json({ approval }, { status: 201 });
  } catch (error) {
    console.error("Approvals POST error:", error);
    return NextResponse.json({ error: "Onay kaydı oluşturulurken hata oluştu" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workItemId = searchParams.get("workItemId");
    const taskEntryId = searchParams.get("taskEntryId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (workItemId) where.workItemId = workItemId;
    if (taskEntryId) where.taskEntryId = taskEntryId;
    if (status) where.status = status;

    const approvals = await prisma.approval.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    return NextResponse.json({ approvals });
  } catch (error) {
    console.error("Approvals GET error:", error);
    return NextResponse.json({ error: "Onaylar getirilirken hata oluştu" }, { status: 500 });
  }
}
