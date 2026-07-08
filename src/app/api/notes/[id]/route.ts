import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/notes/[id] — Tek not (sadece sahibi)
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note || note.userId !== user.id) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }
    return NextResponse.json({ note });
  } catch (error) {
    console.error("notes GET[id] error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH /api/notes/[id] — Not güncelle
//   body alanları: title, content, isFavorite, isTrashed, categoryId, share
//   - share: true  → Paylaşımlar'a ekle (yeni SharedNote oluşturur, note.sharedNoteId set eder)
//   - share: false → Paylaşımdan kaldır (sadece note.sharedNoteId temizlenir;
//                    SharedNote kaydı diğer kullanıcılarda görünmeye devam etsin diye silinmez)
//   - title/content değişince ve note halen paylaşımda ise SharedNote da güncellenir
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (typeof body.title === "string") data.title = body.title;
    if (typeof body.content === "string") data.content = body.content;
    if (typeof body.isFavorite === "boolean") data.isFavorite = body.isFavorite;
    if (typeof body.isTrashed === "boolean") {
      data.isTrashed = body.isTrashed;
      data.trashedAt = body.isTrashed ? new Date() : null;
    }

    if ("categoryId" in body) {
      if (body.categoryId === null || body.categoryId === "") {
        data.categoryId = null;
      } else if (typeof body.categoryId === "string") {
        const cat = await prisma.noteCategory.findUnique({ where: { id: body.categoryId } });
        if (!cat || cat.userId !== user.id) {
          return NextResponse.json({ error: "Kategori bulunamadı" }, { status: 400 });
        }
        data.categoryId = body.categoryId;
      }
    }

    // ── Paylaşım toggle'ı ──
    let createdSharedNoteId: string | null = null;
    if (typeof body.share === "boolean") {
      if (body.share) {
        // Zaten paylaşımda değilse yeni snapshot oluştur
        if (!existing.sharedNoteId) {
          const sharerName = `${user.firstName} ${user.lastName}`.trim() || user.username;
          // Güncel başlık/içerik (PATCH'te değiştiyse onu kullan, yoksa mevcut)
          const snapTitle =
            typeof body.title === "string" ? body.title : existing.title;
          const snapContent =
            typeof body.content === "string" ? body.content : existing.content;
          const shared = await prisma.sharedNote.create({
            data: {
              originalNoteId: existing.id,
              sharedByUserId: user.id,
              sharedByName: sharerName,
              title: snapTitle,
              content: snapContent,
            },
          });
          createdSharedNoteId = shared.id;
        }
      } else {
        // Paylaşımdan kaldır → SharedNote kaydı silinmez, sadece bağlantı kopar
        data.sharedNoteId = null;
      }
    }

    if (createdSharedNoteId) {
      data.sharedNoteId = createdSharedNoteId;
    }

    // Önce notu güncelle
    const note = await prisma.note.update({ where: { id }, data });

    // Eğer not halen paylaşımda ise (share=false yapılmadıysa) ve title/content değiştiyse
    // SharedNote'u da güncelle
    const updatedTitle = typeof body.title === "string";
    const updatedContent = typeof body.content === "string";
    if (note.sharedNoteId && (updatedTitle || updatedContent)) {
      const sharedUpdate: Record<string, unknown> = {};
      if (updatedTitle) sharedUpdate.title = note.title;
      if (updatedContent) sharedUpdate.content = note.content;
      try {
        await prisma.sharedNote.update({
          where: { id: note.sharedNoteId },
          data: sharedUpdate,
        });
      } catch {
        // SharedNote silinmiş olabilir; not'taki referans geçersiz olabilir
        await prisma.note.update({ where: { id }, data: { sharedNoteId: null } });
      }
    }

    return NextResponse.json({ note });
  } catch (error) {
    console.error("notes PATCH error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/notes/[id] — Kalıcı olarak sil
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await context.params;

    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    // Not kalıcı silinince, paylaşım kaydı (SharedNote) silinmez —
    // diğer kullanıcıların görüntüsünde kalmaya devam etsin diye.
    await prisma.note.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("notes DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
