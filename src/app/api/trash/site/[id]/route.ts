import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// POST /api/trash/site/[id] — restore a soft-deleted site (admin only)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    const { id } = await params;

    const site = await prisma.constructionSite.findUnique({ where: { id } });
    if (!site || !site.deletedAt) {
      return NextResponse.json({ error: "Silinmiş şantiye bulunamadı" }, { status: 404 });
    }

    // Geri yükle: deletedAt'ı temizle
    await prisma.constructionSite.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedBy: null,
        deletedByName: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "RESTORE",
        entityType: "ConstructionSite",
        entityId: id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Site restore error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/trash/site/[id] — permanently delete a soft-deleted site (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    const { id } = await params;

    const site = await prisma.constructionSite.findUnique({ where: { id } });
    if (!site || !site.deletedAt) {
      return NextResponse.json({ error: "Silinmiş şantiye bulunamadı" }, { status: 404 });
    }

    // İlişkili çöp kutusu öğelerini de temizle
    await prisma.trashItem.deleteMany({ where: { siteId: id } });

    // Kalıcı olarak sil (cascade ile tüm alt veriler silinir)
    await prisma.constructionSite.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PERMANENT_DELETE",
        entityType: "ConstructionSite",
        entityId: id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Site permanent delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
