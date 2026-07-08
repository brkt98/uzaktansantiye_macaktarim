import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/notes — Mevcut kullanıcının notları
//   ?filter=all|favorites|trash (default: all)
//   ?categoryId=<id|none>     (none = kategorisiz)
//   ?search=<text>             (başlık veya içerikte ara)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = (searchParams.get("filter") || "all").toLowerCase();
    const categoryId = searchParams.get("categoryId");
    const search = (searchParams.get("search") || "").trim();

    const where: Record<string, unknown> = { userId: user.id };

    if (filter === "trash") {
      where.isTrashed = true;
    } else {
      where.isTrashed = false;
      if (filter === "favorites") where.isFavorite = true;
    }

    if (categoryId) {
      if (categoryId === "none") where.categoryId = null;
      else where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        content: true,
        categoryId: true,
        isFavorite: true,
        isTrashed: true,
        trashedAt: true,
        sharedNoteId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("notes GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/notes — Yeni not oluştur
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : "";
    const content = typeof body.content === "string" ? body.content : "";
    const categoryId =
      typeof body.categoryId === "string" && body.categoryId ? body.categoryId : null;

    // Kategori başka kullanıcıya aitse engelle
    if (categoryId) {
      const cat = await prisma.noteCategory.findUnique({ where: { id: categoryId } });
      if (!cat || cat.userId !== user.id) {
        return NextResponse.json({ error: "Kategori bulunamadı" }, { status: 400 });
      }
    }

    const note = await prisma.note.create({
      data: {
        userId: user.id,
        title,
        content,
        categoryId,
      },
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("notes POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
