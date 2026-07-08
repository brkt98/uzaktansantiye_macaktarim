# 06 — Senden İstenecek Bilgiler / Kararlar

Release'i tamamlamak için gerekenler. Kod tarafı hazır; bunlar senin kararın / Play Console / şirket Android yönetimi tarafı.

## Kararlar (kod davranışını belirler)
1. **Hesap silme semantiği** — Tam silme (hard) mı, soft-delete/anonimleştirme mi? (Öneri: soft-delete) → [05](05-account-deletion.md)
2. **Public silme yolu** — `https://uzaktansantiye.com/hesap-sil` sayfası mı yayınlansın, yoksa destek e-postası ile manuel talep mi beyan edilsin?
3. **Atıl izinler** — `MANAGE_OWN_CALLS` + `FOREGROUND_SERVICE_MICROPHONE` (+ `MicCallService`): Faz B native arama planı **var mı**? Yoksa kaldırayım mı? → [03](03-permissions.md)
4. **JWT_SECRET** — Production sunucuda `JWT_SECRET` env'i **set mi**? (Evetse fallback'i kaldırıp fail-fast yapabilirim — güvenlik artışı.)

## Doğrulamalar (sunucu/altyapı)
5. **REALTIME_INTERNAL_URL** env'i prod'da set mi?
6. **LiveKit Egress** (arama/ekran kaydı) etkin mi? → Data Safety'de kayıt beyanı değişir → [04](04-data-safety.md)
7. **nodejs-whisper** hangi sesleri transkribe ediyor + transkript saklanıyor mu?

## Play Console / şirket Android yönetimi (kod dışı)
8. **Managed Google Play / Android Enterprise (Organization) hesabı kurulu mu?** (Organization ID koda gömülmez — yalnızca Console ayarı.)
9. **Play App Signing** mi kullanacaksın (önerilen), yoksa kendi keystore'unla mı?
10. **Privacy Policy URL** — ✅ sayfa yayında: `https://uzaktansantiye.com/gizlilik` (public, TR/EN). Play Console'a bu URL'i gir. (İçindeki `COMPANY`/`EMAIL` placeholder'larını gerçek bilgiyle güncellet.)
11. **Reviewer / test hesabı** — self-signup yok; admin tarafından açılmış kullanıcı adı + parola (Play "App access" formuna girilecek).
12. **Keystore** — `keytool` ile üretildi mi, parolalar güvenli saklandı mı? → [01](01-signing-build.md)

## Bana verince ne yaparım
- Hesap silme kararı (1+2) → endpoint + settings kartı + public sayfa kodlarım.
- JWT_SECRET teyidi (4) → fallback'i kaldırırım.
- Atıl izin kararı (3) → manifest'i sadeleştiririm.
- Egress/whisper teyidi (6,7) → Data Safety taslağını kesinleştiririm.
