import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";

// İş kalemlerini getir
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId gereklidir" }, { status: 400 });
    }

    const workItems = await prisma.workItem.findMany({
      where: { categoryId },
      orderBy: { name: "asc" },
      include: {
        taskEntries: {
          orderBy: { name: "asc" },
          include: {
            unit: true,
            _count: { select: { documents: true, comments: true, approvals: true } },
          },
        },
        _count: {
          select: { taskEntries: true, documents: true, comments: true, approvals: true },
        },
      },
    });

    return NextResponse.json({ workItems });
  } catch (error) {
    console.error("WorkItems GET error:", error);
    return NextResponse.json({ error: "İş kalemleri getirilirken hata oluştu" }, { status: 500 });
  }
}

// Yeni iş kalemi oluştur
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canEdit(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { categoryId, name, description, startDate, endDate, imageUrl } = body;

    if (!categoryId || !name) {
      return NextResponse.json({ error: "categoryId ve name gereklidir" }, { status: 400 });
    }

    const workItem = await prisma.workItem.create({
      data: {
        categoryId,
        name,
        description,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        imageUrl,
      },
    });

    return NextResponse.json({ workItem }, { status: 201 });
  } catch (error) {
    console.error("WorkItems POST error:", error);
    return NextResponse.json({ error: "İş kalemi oluşturulurken hata oluştu" }, { status: 500 });
  }
}
