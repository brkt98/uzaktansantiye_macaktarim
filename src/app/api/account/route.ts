import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPassword, hashPassword, invalidateUserCache } from "@/lib/auth";
import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import path from "path";
import { thumbFileName } from "@/lib/imageOptimize";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// Kullanıcının kendi yüklediği kişisel medya dosyasını (URL biçiminden) diskten güvenle siler.
// DB satırı silinince dosya yetim kalıyordu → Play "veri silme" için fiziksel dosya da gitmeli.
// Yalnız bilinen kendi-medya formatları; path-traversal engelli; hata yutulur (silme akışı bozulmasın).
async function safeUnlinkByUrl(url: string) {
  const routes: Array<{ re: RegExp; subdir: string; thumb: boolean }> = [
    { re: /^\/api\/chat\/media\/([^/?#\\]+)$/, subdir: "chat", thumb: true }, // avatar (+ thumbnail)
    { re: /^\/api\/notes\/images\/([^/?#\\]+)$/, subdir: "notes-images", thumb: false },
    { re: /^\/api\/notes\/audio\/([^/?#\\]+)$/, subdir: "notes-audio", thumb: false },
  ];
  for (const r of routes) {
    const m = url.match(r.re);
    if (!m) continue;
    const name = m[1];
    if (name.includes("..") || name.includes("/") || name.includes("\\")) return;
    const dir = path.join(UPLOAD_DIR, r.subdir);
    await unlink(path.join(dir, name)).catch(() => {});
    if (r.thumb) await unlink(path.join(dir, thumbFileName(name))).catch(() => {});
    return;
  }
}

/**
 * DELETE /api/account — kullanıcının KENDİ hesabını silmesi (Play policy: hesap silme zorunlu).
 *
 * Soft-delete + anonimleştirme:
 *  - Kullanıcı kaydı ANONİMLEŞTİRİLİR (isActive=false, kişisel alanlar temizlenir, deletedAt set) →
 *    paylaşılan veri (başkalarının gördüğü mesajlar, denetim kaydı, şantiye atamaları) BOZULMAZ;
 *    o içeriklerde yazar artık "Silinmiş Kullanıcı" görünür.
 *  - Kişisel/tek-sahipli veri GERÇEKTEN silinir: notlar, not kategorileri, bildirimler, cihaz token'ları
 *    (kullanıcıya "notlarınız, size özel bilgiler gider" diye söz verildiği için).
 *  - Oturum anında ölür: isActive=false + cache invalidation + auth-token cookie sıfırlanır.
 */
export async function DELETE(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }
  const id = current.id;

  // Parola doğrulaması — yanlışlıkla/başkası silmesin.
  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    /* gövde yok */
  }
  if (!password) {
    return NextResponse.json({ error: "Hesabı silmek için parolanızı girin." }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
  if (!dbUser) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  }
  const ok = await verifyPassword(password, dbUser.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Parola hatalı." }, { status: 403 });
  }

  // Organizasyon kilitlenmesin: son aktif SUPER_ADMIN kendini silemesin.
  const isSuper = current.role === "SUPER_ADMIN" || (current.roles || []).includes("SUPER_ADMIN");
  if (isSuper) {
    const otherSupers = await prisma.user.count({
      where: {
        isActive: true,
        id: { not: id },
        OR: [{ role: "SUPER_ADMIN" }, { roles: { has: "SUPER_ADMIN" } }],
      },
    });
    if (otherSupers === 0) {
      return NextResponse.json(
        { error: "Son SUPER_ADMIN hesabı silinemez. Önce başka bir yönetici atayın." },
        { status: 409 }
      );
    }
  }

  // Silinecek kişisel dosyaları (avatar + not foto/ses ekleri) transaction ÖNCESİ topla — sonra diskten sil.
  const fileUrls = new Set<string>();
  const prevUser = await prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } });
  if (prevUser?.avatarUrl) fileUrls.add(prevUser.avatarUrl);
  const userNotes = await prisma.note.findMany({ where: { userId: id }, select: { content: true } });
  for (const n of userNotes) {
    for (const m of (n.content || "").matchAll(/\[\[(?:image|audio):([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      fileUrls.add(m[1]);
    }
  }

  const anonPasswordHash = await hashPassword(randomUUID()); // login tamamen imkânsız
  const marker = id.replace(/-/g, "").slice(0, 12);

  await prisma.$transaction(async (tx) => {
    // Kişisel & tek-sahipli veri: gerçekten sil.
    await tx.note.deleteMany({ where: { userId: id } });
    await tx.noteCategory.deleteMany({ where: { userId: id } });
    await tx.notification.deleteMany({ where: { userId: id } });
    await tx.deviceToken.deleteMany({ where: { userId: id } }); // push dursun

    // Kullanıcıyı anonimleştir + erişimi kapat.
    await tx.user.update({
      where: { id },
      data: {
        firstName: "Silinmiş",
        lastName: "Kullanıcı",
        username: `deleted_${marker}`,
        email: `deleted_${marker}@deleted.invalid`,
        phone: null,
        avatarUrl: null,
        passwordHash: anonPasswordHash,
        role: "USER",
        roles: { set: [] },
        studyankaAccess: false,
        isActive: false,
        deletedAt: new Date(),
      },
    });
  });

  invalidateUserCache(id); // 60sn oturum cache'ini atla → oturum ANINDA geçersiz

  // Yetim kalan kişisel dosyaları diskten sil (transaction dışı, best-effort — Play "veri silme").
  for (const url of fileUrls) await safeUnlinkByUrl(url);

  const response = NextResponse.json({ success: true });
  response.cookies.set("auth-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
