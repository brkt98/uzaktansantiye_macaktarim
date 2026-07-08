import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isManagerOrAbove } from "@/lib/auth";

// Kategorileri getir (şantiye bazlı)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const parentId = searchParams.get("parentId");

    if (!siteId) {
      return NextResponse.json({ error: "siteId gereklidir" }, { status: 400 });
    }

    const where: Record<string, unknown> = { siteId };
    if (parentId === "null" || parentId === null) {
      where.parentCategoryId = null;
    } else if (parentId) {
      where.parentCategoryId = parentId;
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: { order: "asc" },
      include: {
        subCategories: {
          orderBy: { order: "asc" },
          include: {
            subCategories: {
              orderBy: { order: "asc" },
            },
            workItems: {
              orderBy: { name: "asc" },
            },
            _count: { select: { subCategories: true, workItems: true } },
          },
        },
        workItems: {
          orderBy: { name: "asc" },
          include: {
            _count: { select: { taskEntries: true, documents: true, comments: true } },
          },
        },
        _count: {
          select: { subCategories: true, workItems: true, taskEntries: true },
        },
      },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Categories GET error:", error);
    return NextResponse.json({ error: "Kategoriler getirilirken hata oluştu" }, { status: 500 });
  }
}

// Yeni kategori oluştur
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isManagerOrAbove(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { siteId, name, description, parentCategoryId, order, color, imageUrl } = body;

    if (!siteId || !name) {
      return NextResponse.json({ error: "siteId ve name gereklidir" }, { status: 400 });
    }

    const category = await prisma.category.create({
      data: {
        siteId,
        name,
        description,
        parentCategoryId: parentCategoryId || null,
        order: order || 0,
        color,
        imageUrl,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "Category",
        entityId: category.id,
        details: { name, siteId },
      },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error("Categories POST error:", error);
    return NextResponse.json({ error: "Kategori oluşturulurken hata oluştu" }, { status: 500 });
  }
}
