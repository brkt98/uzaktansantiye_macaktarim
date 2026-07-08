import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// GET /api/sites/[id]/checklist — get checklist templates for a site (optionally per unit+category)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const unitId = req.nextUrl.searchParams.get("unitId");
    const categoryId = req.nextUrl.searchParams.get("categoryId");
    const checkCategoryIds = req.nextUrl.searchParams.get("checkCategoryIds");

    // Kategori silme kontrolü: sitede unit özelleştirmesi var mı?
    if (checkCategoryIds) {
      // Belirli bir daire için kontrol
      if (unitId) {
        const count = await prisma.unitChecklistTemplate.count({
          where: { siteId: id, unitId, parentId: null },
        });
        return NextResponse.json({ affectedCount: count });
      }
      const count = await prisma.unitChecklistTemplate.count({
        where: { siteId: id, unitId: { not: null }, parentId: null },
      });
      return NextResponse.json({ affectedCount: count });
    }

    const templates = await prisma.unitChecklistTemplate.findMany({
      where: { siteId: id, parentId: null, unitId: unitId || null, categoryId: categoryId || null },
      include: {
        children: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Checklist GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PUT /api/sites/[id]/checklist — update checklist templates (admin only, optionally per unit+category)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    const { id } = await params;
    const { templates, unitId, categoryId } = await req.json();

    if (!Array.isArray(templates)) {
      return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
    }

    // Delete existing templates for this site (and unit/category if specified)
    await prisma.unitChecklistTemplate.deleteMany({
      where: { siteId: id, unitId: unitId || null, categoryId: categoryId || null },
    });

    // Create new templates
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const parent = await prisma.unitChecklistTemplate.create({
        data: {
          siteId: id,
          name: t.name,
          order: i,
          unitId: unitId || null,
          categoryId: categoryId || null,
        },
      });

      if (Array.isArray(t.children)) {
        for (let j = 0; j < t.children.length; j++) {
          await prisma.unitChecklistTemplate.create({
            data: {
              siteId: id,
              name: t.children[j].name,
              parentId: parent.id,
              order: j,
              unitId: unitId || null,
              categoryId: categoryId || null,
            },
          });
        }
      }
    }

    // Return updated templates
    const updated = await prisma.unitChecklistTemplate.findMany({
      where: { siteId: id, parentId: null, unitId: unitId || null, categoryId: categoryId || null },
      include: {
        children: { orderBy: { order: "asc" } },
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ templates: updated });
  } catch (error) {
    console.error("Checklist PUT error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
