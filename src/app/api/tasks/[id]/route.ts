import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !canEdit(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const task = await prisma.taskEntry.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.progress !== undefined && { progress: body.progress }),
        ...(body.status && { status: body.status }),
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
        ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
        ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Task PUT error:", error);
    return NextResponse.json({ error: "Görev güncellenirken hata oluştu" }, { status: 500 });
  }
}
