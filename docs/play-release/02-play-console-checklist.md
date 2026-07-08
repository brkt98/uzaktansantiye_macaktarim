# 02 — Managed Google Play (Private) Console Checklist

> Bu uygulama **public Play Store'a çıkmayacak.** Sadece organizasyon kullanıcıları erişecek → **Managed Google Play / private app** mantığı.

## Organizasyon ID & erişim modeli (önce bunu anla)

- **Organization ID KODA GÖMÜLMEZ.** Uygulamanın içine yazılmaz, build'e girmez. Yalnızca **Play Console / Managed Google Play** tarafında bir ayardır.
- Kullanıcıların uygulamayı görebilmesi için şirketin **Managed Google Play / Android Enterprise** ortamı hazır olmalı.
- Çalışanlar uygulamayı **managed Google account / work profile / EMM (MDM)** üzerinden görür/indirir.
- Bu **kodla çözülen bir konu değildir** — Play Console + şirketin Android yönetimi (Android Enterprise) ayarıdır.
- Private app yayınlamanın iki yolu:
  1. **Managed Google Play'de private app** (Google Play Console'dan yayınla, sonra organizasyona kısıtla), veya
  2. **Managed Google Play Store'da custom/private app** (Play Console hesabını organizasyona bağlı yayınla).

## Uygulama oluşturma + zorunlu formlar

- [ ] Play Console > **All apps > Create app** — uygulama adı, varsayılan dil (Türkçe), App / Game = App, Free/Paid = Free
- [ ] **Store listing** minimum: kısa+uzun açıklama, uygulama ikonu (512×512), feature graphic, en az 2 telefon ekran görüntüsü
- [ ] **Privacy Policy URL** (App content) — Managed dağıtımda da gerekli → [06](06-open-questions.md)
- [ ] **App access** — uygulama login istiyor + **self-signup YOK** (hesaplar admin tarafından açılıyor). Reviewer için test kullanıcı adı + parola + giriş talimatı gir.
- [ ] **Ads** — reklam yok → "No ads" beyan et
- [ ] **Content rating** anketi (IARC)
- [ ] **Target audience** — yetişkin/iş uygulaması (13+ / yalnızca çalışanlar)
- [ ] **Data safety** formu → [04](04-data-safety.md)
- [ ] **App content > Data deletion** — public hesap-silme URL'i (örn. `https://uzaktansantiye.com/hesap-sil`) → [05](05-account-deletion.md)
- [ ] **Government apps / Financial features / Health** = ilgili değil

## Hassas izin / Foreground service declaration'ları (PRIVATE'te de ZORUNLU)

App content içinde şu beyanları doldur (gerekçe: kurumsal VoIP/gelen-arama + ekran paylaşımı):
- [ ] **Foreground service types**: `FOREGROUND_SERVICE_PHONE_CALL`, `FOREGROUND_SERVICE_MEDIA_PROJECTION` (+ kullanılacaksa `MICROPHONE`)
- [ ] **Full-screen intent** (`USE_FULL_SCREEN_INTENT`) — Android 14+ kısıtlı; "calling app / gelen arama" gerekçesiyle beyan
- Detay + atıl izin temizliği → [03](03-permissions.md)

## İmzalama
- [ ] **Play App Signing** etkin (önerilen)
- [ ] **Upload key** ile imzalı `app-release.aab` yüklendi → [01](01-signing-build.md)
- [ ] (Play App Signing sonrası) Eğer ileride SHA gerektiren bir Google servisi eklenirse, Play Console'daki **app signing certificate** SHA-1/SHA-256'sı ilgili serviste güncellenmeli. **Şu an FCM-only → gerekmez.**

## Test stratejisi (public/open test KULLANMA)

Private dağıtıma uygun sıra:
1. [ ] **Internal testing** track — ilk smoke test (en hızlı, ~birkaç dk yayın). Test cihazına kur.
2. [ ] **Closed testing (organizasyona kapalı)** — organizasyon test kullanıcılarıyla.
3. [ ] Test kullanıcılarının **managed account / work profile** üzerinden uygulamayı **görüp göremediğini** doğrula.
4. [ ] Production / Managed private'a **promote** etmeden önce **private app restriction / organizasyon kısıtının AKTİF** olduğunu doğrula. (Kısıt aktif olmadan production rollout YAPMA — yoksa public sızar.)

### Test senaryoları (her track'te)
- [ ] İlk kurulum + **crash-free launch**
- [ ] Login / Logout
- [ ] **Hesap silme / silme talebi** (eklenince)
- [ ] Push notification (FCM) — kilitli/arka plan/açık
- [ ] **Kamera + galeri** izin akışı (ilk kullanımda izin diyalogu çıkıyor mu?)
- [ ] **Mikrofon** (sesli mesaj + arama) izin akışı
- [ ] API bağlantısı (production)
- [ ] **Offline → online** geçiş (üst bant + yeniden bağlanma)
- [ ] Uygulama güncelleme (versionCode artışıyla)
- [ ] **Work profile içinde** çalışma
- [ ] **Permission reddi** senaryoları (reddedince uygulama çökmemeli, anlamlı mesaj)
- [ ] Android geri-gesture (önceki sayfa / modal kapatma — bkz. [[android-geri-navigasyon]])
