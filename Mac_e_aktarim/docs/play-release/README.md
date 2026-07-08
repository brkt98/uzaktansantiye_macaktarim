# Google Play — Private / Managed Google Play Release Rehberi

**Uygulama:** Uzaktan Şantiye — `com.mesalegrup.uzaktansantiye`
**Tip:** Capacitor 8.4 remote-URL kabuk (`server.url = https://uzaktansantiye.com`) + Next.js App Router web
**Hedef:** Google Play'de **PRIVATE / Managed Google Play** dağıtım (public release DEĞİL) · imzalı release **AAB**
**Son güncelleme:** 2026-06-24

> Bu klasör release hazırlığının tek doğruluk kaynağıdır. "Play release dökümanları nerede?" diye sorulduğunda: **`docs/play-release/`**.

## İçindekiler
- [01-signing-build.md](01-signing-build.md) — Keystore üretimi, key.properties, imzalama, build komutları, AAB yolu, Play App Signing
- [02-play-console-checklist.md](02-play-console-checklist.md) — Managed Google Play private dağıtım adımları, Organization ID, declaration'lar, test stratejisi + senaryoları
- [03-permissions.md](03-permissions.md) — Tüm izinlerin analizi + Play policy riskleri
- [04-data-safety.md](04-data-safety.md) — Data Safety formu taslağı + Privacy Policy teknik başlıkları
- [05-account-deletion.md](05-account-deletion.md) — Hesap silme (Play zorunluluğu) tasarımı + karar bekleyen noktalar
- [06-open-questions.md](06-open-questions.md) — Senden istenecek bilgiler (Organization ID, Privacy Policy URL, vb.)
- [07-test-plan.md](07-test-plan.md) — **Full app test planı** (APK build sonrası adım adım, checkbox'lı)
- [08-release-runbook.md](08-release-runbook.md) — **Release runbook** (keystore → AAB → Play Console → private dağıtım, baştan sona sıralı)

---

## A) Mevcut Durum

| | Değer |
|---|---|
| Proje tipi | **Capacitor** (Next.js web + native Android/iOS). RN/Expo/Flutter DEĞİL. |
| Gradle | `android/` (AGP 8.13, Java 21, Kotlin) |
| **applicationId / package** | **`com.mesalegrup.uzaktansantiye`** — ⚠️ İlk release sonrası DEĞİŞTİRİLEMEZ. Asla dokunma. |
| versionCode / versionName | `1` / `1.0.0` (ilk release; her yüklemede versionCode +1) |
| minSdk / compileSdk / targetSdk | `24` / `36` / `36` — targetSdk ≥35 şartı **fazlasıyla karşılanıyor** ✓ |
| Build sistemi | Gradle, `bundleRelease` → AAB |
| Signing | Artık **key.properties tabanlı release signingConfig var** (aşağıda); keystore'u SEN üreteceksin |
| API base URL | `https://uzaktansantiye.com` — production ✓ (cleartext kapalı, HTTPS-only CSP) |
| Firebase | Yalnızca **FCM** (push). Analytics/Crashlytics/Auth YOK → SHA fingerprint şu an gerekmez |
| Hijyen | console.log/debug/info = 0; mock/test-user/staging/dev-API/hardcoded key YOK ✓ |

**Remote-URL notu:** `src/` tamamı production sunucusunda çalışır, native binary'ye gömülmez. Koddaki `http://` adresleri sunucu-içi (Docker) çağrılardır, zararsızdır.

## B) Yapılan / Yapılacak Değişiklikler

### ✅ Bu turda UYGULANANLAR (kod)
| Dosya | Değişiklik | Neden |
|---|---|---|
| `android/app/build.gradle` | `key.properties` yükleme + `signingConfigs.release` + release'e `signingConfig` (key.properties yoksa debug'a düşer) | İmzalı AAB için release signingConfig yoktu — Play imzasız AAB'yi reddeder. Sırlar hardcode DEĞİL. |
| `android/app/build.gradle` | `versionName "1.0"` → `"1.0.0"` | Semantik sürüm |
| `android/.gitignore` | `*.jks`, `*.keystore`, `key.properties` aktif edildi | İmzalama sırlarının sızmasını engeller |
| `android/key.properties.example` | Şablon (placeholder) eklendi | key.properties'in nasıl doldurulacağı |

### ⏳ Senin onayını/kararını bekleyenler (uygulamadım — kod kırma/karar riski)
| # | İş | Neden onay gerekiyor |
|---|---|---|
| 1 | **Keystore + key.properties üret** | Gerçek sır gerektirir, SEN üreteceksin → [01](01-signing-build.md) |
| 2 | ~~Hesap silme akışı~~ ✅ **TAMAMLANDI** (soft-delete/anonimleştir + kişisel dosya temizliği + public `/hesap-sil`) — kalan: Play Console'da URL beyanı → [05](05-account-deletion.md) |
| 3 | `src/lib/auth.ts` JWT_SECRET fallback'i kaldır (fail-fast) | Prod'da `JWT_SECRET` env'i set DEĞİLSE fallback'i kaldırmak uygulamayı kırar — önce prod env'i teyit et |
| 4 | CAMERA/RECORD_AUDIO runtime izin akışı | WebView getUserMedia ilk kullanımda izin diyalogu çıkmayabilir → [03](03-permissions.md) |
| 5 | Atıl izinler (`MANAGE_OWN_CALLS`, `FOREGROUND_SERVICE_MICROPHONE`) | Faz B native arama planına bağlı ürün kararı → [03](03-permissions.md) |

## C–H

- **C) Private Play checklist** → [02-play-console-checklist.md](02-play-console-checklist.md)
- **D) Build komutları** → [01-signing-build.md](01-signing-build.md)
- **E) Güvenlik / signing** → [01-signing-build.md](01-signing-build.md)
- **F) Permission / policy riskleri** → [03-permissions.md](03-permissions.md)
- **G) Data Safety taslağı** → [04-data-safety.md](04-data-safety.md)
- **H) Eksikler / istenecek bilgiler** → [06-open-questions.md](06-open-questions.md)

## Release blokajları (özet)
1. **Keystore + key.properties** üretimi (sende) — onsuz imzalı AAB çıkmaz.
2. **Hesap silme akışı** — Play zorunluluğu, repoda yok.
3. **Play Console declaration formları** (FGS tipleri, full-screen-intent, Data Safety, Data deletion, Privacy Policy) — private dağıtımda da zorunlu.
