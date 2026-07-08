import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const workItemId = searchParams.get("workItemId");

    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = categoryId;
    if (workItemId) where.workItemId = workItemId;

    const tasks = await prisma.taskEntry.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        unit: true,
        _count: { select: { documents: true, comments: true, approvals: true } },
      },
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Tasks GET error:", error);
    return NextResponse.json({ error: "Görevler getirilirken hata oluştu" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canEdit(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { workItemId, categoryId, unitId, name, startDate, endDate } = body;

    const task = await prisma.taskEntry.create({
      data: {
        workItemId,
        categoryId,
        unitId,
        name,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Tasks POST error:", error);
    return NextResponse.json({ error: "Görev oluşturulurken hata oluştu" }, { status: 500 });
  }
}
