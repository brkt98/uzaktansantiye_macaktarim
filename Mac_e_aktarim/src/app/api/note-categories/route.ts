import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/note-categories — Mevcut kullanıcının kategorileri (not sayılarıyla)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const categories = await prisma.noteCategory.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { notes: { where: { isTrashed: false } } } },
      },
    });

    const list = categories.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      noteCount: c._count.notes,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return NextResponse.json({ categories: list });
  } catch (error) {
    console.error("note-categories GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/note-categories — Yeni kategori
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "İsim zorunlu" }, { status: 400 });

    const last = await prisma.noteCategory.findFirst({
      where: { userId: user.id },
      orderBy: { sortOrder: "desc" },
    });
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    const category = await prisma.noteCategory.create({
      data: { userId: user.id, name, sortOrder },
    });
    return NextResponse.json({ category });
  } catch (error) {
    console.error("note-categories POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
