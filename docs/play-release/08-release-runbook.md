# 08 — Release Runbook (baştan sona sıralı adımlar)

> Managed Google Play **PRIVATE** dağıtım. Aşağıdaki sırayı takip et. Detaylar için ilgili dosyaya bakılır.

---

## Dağıtım modeli: **B — "Unlisted" (listelenmemiş) + uygulama-içi giriş kısıtı**

Kullanıcılar sadece **uygulama-içi hesaba** sahip (Workspace/managed hesap YOK). Bu yüzden:
- Uygulama Play'de **yayınlanır ama aranamaz/keşfedilemez** (unlisted) — sadece **paylaşılan direkt linkle** bulunur.
- Kullanıcılar **kendi normal Google hesabıyla**, linkten kurar. Managed hesap/EMM/Workspace GEREKMEZ.
- Gerçek erişim uygulamanın **kendi girişiyle** kısıtlı (hesaplar admin'in açtığı, self-signup yok) → linki bulan biri kursa bile **giriş yapamaz.**

## Ön koşul (tek)
- [ ] **Google Play Developer hesabı** — https://play.google.com/console ($25 tek seferlik). Model B için gereken tek altyapı budur.

---

## Aşama 0 — Kod finalizasyonu (bende)
- [ ] `/gizlilik` + `/hesap-sil` sayfalarındaki **gerçek şirket adı + destek e-postası** (şu an placeholder). → Bilgiyi ver, deploy edeyim (web, anında).
- [x] JWT_SECRET prod'da set + fail-fast ✓
- [x] Signing config, hesap silme, privacy policy, data deletion, ikonlar, bildirim/pil izinleri ✓

## Aşama 1 — İmzalı AAB üret (Mac veya Windows) → [01-signing-build.md](01-signing-build.md)
1. [ ] Keystore üret (bir kez): `keytool -genkeypair -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload` (android/app/ içinde)
2. [ ] `android/key.properties` oluştur (gerçek parolalar) — `key.properties.example`'dan kopyala
3. [ ] `npx cap sync android`
4. [ ] `cd android && ./gradlew bundleRelease` (Windows: `.\gradlew.bat bundleRelease`)
5. [ ] Çıktı: **`android/app/build/outputs/bundle/release/app-release.aab`**
6. [ ] 🔴 **Keystore + parolaları güvenli sakla** (parola yöneticisi/şifreli yedek). Kaybolursa güncelleme yayınlanamaz.

## Aşama 2 — Play Console: uygulama oluştur + formlar → [02-play-console-checklist.md](02-play-console-checklist.md)
1. [ ] **All apps → Create app**: ad="Uzaktan Şantiye", dil=Türkçe, App, Free
2. [ ] **Play App Signing** etkin (önerilen — AAB yükleyince Google app-signing key'i yönetir; sen upload key ile imzalarsın)
3. [ ] **Store listing**: kısa+uzun açıklama, **uygulama ikonu 512×512** (meşale), feature graphic 1024×500, en az **2 telefon ekran görüntüsü**
4. [ ] **App content** formları:
   - [ ] **Privacy Policy URL** = `https://uzaktansantiye.com/gizlilik`
   - [ ] **Data safety** → [04-data-safety.md](04-data-safety.md)
   - [ ] **Data deletion** = `https://uzaktansantiye.com/hesap-sil`
   - [ ] **App access**: login var + self-signup yok → reviewer için **test kullanıcı adı+şifre** + giriş talimatı gir
   - [ ] **Ads** = No ads
   - [ ] **Content rating** anketi
   - [ ] **Target audience** = yetişkin/iş
   - [ ] **Sensitive permissions / Foreground service** declaration'ları → [03-permissions.md](03-permissions.md): FGS phoneCall + mediaProjection, USE_FULL_SCREEN_INTENT, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (gerekçe: kurumsal gerçek-zamanlı iletişim — mesaj + VoIP arama bildirimleri)

## Aşama 3 — Test track (production'dan ÖNCE)
1. [ ] **Internal testing** track'e AAB yükle → hızlı yayın (dk), test cihazına kur, smoke test ([07-test-plan.md](07-test-plan.md))
2. [ ] Gerekirse **Closed testing** (organizasyona kapalı) → org test kullanıcıları
3. [ ] Test kullanıcıları **managed account / iş profili** üzerinden uygulamayı görebiliyor mu doğrula

## Aşama 4 — "Unlisted" yap + production
1. [ ] **Production** release hazırla (AAB + release notes) — ülke hedefi: **Türkiye**
2. [ ] 🔴 **Unlisted (listelenmemiş) durumu iste**: uygulama Play Console'da hazır olduktan sonra "unlisted apps" talebini gönder → uygulama Play **aramasında/önerilerde ÇIKMAZ**, sadece direkt linkle bulunur. (Google onayı gerekir.)
   - Form/rehber: Play Console → uygulama → App content/Publishing, veya "unlisted app" destek talebi.
3. [ ] Uygulama **login gate**'i zaten erişimi kısıtladığından, unlisted + kendi girişimiz = pratikte organizasyona özel.

## Aşama 5 — İnceleme + yayın
1. [ ] Production'a gönder → **Google incelemesi** (ilk sürüm birkaç saat–7 gün sürebilir)
2. [ ] Onaylanınca → **Play uygulama linkini** organizasyon kullanıcılarına paylaş (WhatsApp/e-posta). Kendi Google hesaplarıyla kurarlar, uygulamaya admin'in verdiği hesapla girerler.
3. [ ] versionCode her yeni yüklemede +1

> **Not (unlisted):** İnceleme + tüm App content formları (Privacy Policy, Data Safety, content rating, izin declaration'ları) **public uygulamayla AYNI** — unlisted yalnızca *keşfedilebilirliği* kapatır, inceleme/formları kaldırmaz.

---

## Sonrası (güncellemeler)
- **Web değişiklikleri** (UI/mantık) → deploy edince **anında** herkese gider, APK gerekmez (remote-URL).
- **Native değişiklik** (yeni plugin/izin/ikon) → versionCode +1 → yeni AAB → Play'e yükle.
- Update'lerde **staged rollout** (düşük %'den başla, crash/ANR temizse artır).
