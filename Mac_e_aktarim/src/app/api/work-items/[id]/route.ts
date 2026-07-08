import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canEdit, isAdmin } from "@/lib/auth";

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

    const workItem = await prisma.workItem.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.progress !== undefined && { progress: body.progress }),
        ...(body.status && { status: body.status }),
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
        ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      },
    });

    return NextResponse.json({ workItem });
  } catch (error) {
    console.error("WorkItem PUT error:", error);
    return NextResponse.json({ error: "İş kalemi güncellenirken hata oluştu" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;

    await prisma.workItem.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WorkItem DELETE error:", error);
    return NextResponse.json({ error: "İş kalemi silinirken hata oluştu" }, { status: 500 });
  }
}
