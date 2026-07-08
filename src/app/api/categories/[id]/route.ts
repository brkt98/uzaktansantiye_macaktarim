import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isManagerOrAbove, isAdmin } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isManagerOrAbove(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error("Category PUT error:", error);
    return NextResponse.json({ error: "Kategori güncellenirken hata oluştu" }, { status: 500 });
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

    await prisma.category.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Category DELETE error:", error);
    return NextResponse.json({ error: "Kategori silinirken hata oluştu" }, { status: 500 });
  }
}
