import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PATCH /api/note-categories/[id] — Kategori adını güncelle
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const existing = await prisma.noteCategory.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });
      data.name = name;
    }
    if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

    const category = await prisma.noteCategory.update({ where: { id }, data });
    return NextResponse.json({ category });
  } catch (error) {
    console.error("note-categories PATCH error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/note-categories/[id] — Kategoriyi sil (içindeki notların kategorisi sıfırlanır)
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const existing = await prisma.noteCategory.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    await prisma.noteCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("note-categories DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
