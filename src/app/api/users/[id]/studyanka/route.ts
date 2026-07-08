import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin, invalidateUserCache } from "@/lib/auth";

// PATCH /api/users/[id]/studyanka — Toggle StudyAnka access
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { studyankaAccess } = body;

    if (typeof studyankaAccess !== "boolean") {
      return NextResponse.json({ error: "Geçersiz değer" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { studyankaAccess },
      select: { id: true, studyankaAccess: true },
    });

    invalidateUserCache(id);

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("StudyAnka toggle error:", error);
    return NextResponse.json({ error: "Güncelleme hatası" }, { status: 500 });
  }
}
