# 05 — Hesap Silme (Play Zorunluluğu) — ✅ TAMAMLANDI

> **Play policy:** Hesap oluşturan uygulama → uygulama-içi hesap silme + public web silme URL'i ZORUNLU. **Kod tarafı tamamlandı** (2026-06-24). Kalan: Play Console'da URL'i beyan etmek.

## Yaklaşım: soft-delete + anonimleştirme (+ kişisel dosya temizliği)
Kurumsal veri bütünlüğü için tam-silme (hard) yerine **anonimleştirme** seçildi: kullanıcı kaydı korunur ama kişisel veri temizlenir → başkalarının sohbet/kayıt geçmişi ve denetim izi bozulmaz.

## Kod (uygulanan)
| Dosya | İşlev |
|---|---|
| `src/app/api/account/route.ts` (YENİ, `DELETE`) | Parola doğrula → son-SUPER_ADMIN guard → transaction: **Note/NoteCategory/Notification/DeviceToken sil** + kullanıcıyı **anonimleştir** (firstName="Silinmiş", lastName="Kullanıcı", username/email=`deleted_<id>`, phone/avatar=null, passwordHash=geçersiz, role=USER, roles=[], isActive=false, **deletedAt=now**) → `invalidateUserCache` → auth-token cookie sıfır → **avatar + not foto/ses dosyalarını diskten sil** |
| `src/app/dashboard/settings/page.tsx` | "Hesabımı Sil" kırmızı kart (tüm roller) + tam-ekran onay modalı (uyarı: notlar/kişisel veri gider + parola + "Kalıcı Olarak Sil") → başarıda `/login` |
| `src/app/hesap-sil/page.tsx` (YENİ, public) | Login'siz bilgi sayfası → **Play Data deletion URL'i** |
| `src/middleware.ts` | `/hesap-sil` publicPaths'e eklendi (login muaf) |
| `prisma/schema.prisma` + prod DB | `User.deletedAt` alanı + `deleted_at` kolonu (additive ALTER, uygulandı) |

## Silinen vs korunan
- **Silinir (kişisel):** notlar + kategoriler, bildirimler, cihaz token'ları (push durur), profil (ad/e-posta/telefon/avatar), **avatar + not foto/ses DOSYALARI diskten**.
- **Anonim korunur (paylaşılan):** sohbet mesajları, şantiye kayıtları, denetim/işlem geçmişi → yazar "Silinmiş Kullanıcı".

## Oturum sonlandırma
- `isActive=false` → login 401 + `getCurrentUser` null. `invalidateUserCache` ile **anında** (60sn cache atlanır). Cookie sıfırlanır.
- ⚠️ **Not (çoklu-instance):** cache process-local; uygulama TEK `app` replica ile çalışmalı. Yatay ölçeklemeden önce `User.tokenVersion` tabanlı token-revocation eklenmeli (auth.ts'te uyarı notu var).

## Çekişmeli inceleme (6 ajan) — 3 bulgu, hepsi giderildi
1. (LOW) Çoklu-instance oturum iptali → auth.ts'e uyarı + tokenVersion önerisi.
2. (MED-HIGH) Avatar dosyası diskte kalıyordu → **unlink eklendi**.
3. (MED) Not eki (foto/ses) dosyaları diskte kalıyordu → **unlink eklendi**.

## Kalan (senin — Play Console)
- [ ] **App content > Data deletion** alanına public URL: `https://uzaktansantiye.com/hesap-sil`
- [ ] `src/app/hesap-sil/page.tsx` içindeki destek e-postasını (`destek@uzaktansantiye.com`) gerçek adresle güncelle.
