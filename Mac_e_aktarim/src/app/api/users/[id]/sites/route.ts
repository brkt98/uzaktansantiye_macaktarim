import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// GET /api/users/[id]/sites - Kullanıcıya atanmış şantiyeleri getir
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await params;

    // Admin veya kendi atamalarını görebilir
    if (!isAdmin(user.roles) && user.id !== id) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const members = await prisma.siteMember.findMany({
      where: { userId: id },
      include: {
        site: { select: { id: true, name: true, status: true } },
      },
    });

    const siteIds = members.map((m) => m.site.id);
    return NextResponse.json({ siteIds, sites: members.map((m) => m.site) });
  } catch (error) {
    console.error("User sites GET error:", error);
    return NextResponse.json({ error: "Hata oluştu" }, { status: 500 });
  }
}

// PUT /api/users/[id]/sites - Kullanıcıya şantiye ata (sadece admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { siteIds } = body;

    if (!Array.isArray(siteIds)) {
      return NextResponse.json({ error: "siteIds dizisi gerekli" }, { status: 400 });
    }

    // Mevcut atamaları sil ve yenilerini oluştur
    await prisma.$transaction(async (tx) => {
      await tx.siteMember.deleteMany({ where: { userId: id } });

      if (siteIds.length > 0) {
        // Kullanıcının rolünü al
        const targetUser = await tx.user.findUnique({
          where: { id },
          select: { role: true },
        });

        await tx.siteMember.createMany({
          data: siteIds.map((siteId: string) => ({
            userId: id,
            siteId,
            role: targetUser?.role || "USER",
          })),
        });
      }
    });

    return NextResponse.json({ success: true, siteIds });
  } catch (error) {
    console.error("User sites PUT error:", error);
    return NextResponse.json({ error: "Hata oluştu" }, { status: 500 });
  }
}
