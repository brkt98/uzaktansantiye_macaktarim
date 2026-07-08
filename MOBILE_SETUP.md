# Mobil Uygulama Kurulumu — Faz 1 (Capacitor Kabuğu)

Bu doküman, uzaktansantiye.com'un Capacitor ile iOS/Android native uygulamasına dönüştürülmesinin **Faz 1** durumunu ve nasıl test edileceğini anlatır.

## ✅ Bu fazda yapılanlar

- **Capacitor 8.4** kuruldu (core, cli, ios, android + app/network/status-bar/splash-screen/preferences eklentileri).
- `capacitor.config.ts` — **remote-URL** deseni: native kabuk `https://uzaktansantiye.com`'u WebView'de yükler.
- `ios/` ve `android/` native projeleri üretildi (her ikisi de Windows'ta oluştu — Capacitor 8 CocoaPods yerine Swift Package Manager kullanıyor).
- `src/components/NativeBridge.tsx` — splash gizleme, status bar, **çevrimdışı bandı**, Android geri tuşu ve deep-link yönetimi. `src/app/layout.tsx`'e bağlandı (tarayıcıda no-op).
- iOS `Info.plist` — `WKAppBoundDomains` (cookie/WebRTC için) + kamera/mikrofon/galeri izin açıklamaları.
- `package.json`'a kolaylık script'leri: `cap:sync`, `cap:android`, `cap:open:android`, `cap:open:ios`.
- Web build doğrulandı: `/login` HTTP 200, hatasız derlendi.

> **Not:** Remote-URL deseninde uygulama mantığı web'de yaşar. Yani siteye yaptığın her deploy, mobil uygulamada da anında geçerli olur — sadece native kısım (eklenti/izin) değişince yeni build gerekir.

---

## 📱 Test Yolları

### 1. iPhone/iPad'de HEMEN test (Mac/build gerekmez)
Site zaten yayında olduğu için native hissi bugün görebilirsin:
1. iPhone/iPad'de **Safari** ile `https://uzaktansantiye.com` aç.
2. Paylaş → **"Ana Ekrana Ekle"**.
3. Ana ekrandaki ikondan aç → tam ekran, adres çubuğu olmadan açılır (PWA modu).

Bu, gerçek Capacitor build'i değil ama arayüzün mobilde nasıl görüneceğini gösterir.

### 2. Android — Windows'ta gerçek native test
Gereksinim: **Android Studio** (+ JDK). Sonra:
```powershell
npm run cap:open:android   # Android Studio'da açar → Run (emülatör/USB cihaz)
# veya doğrudan:
npm run cap:android
```
Uygulama açılır, `uzaktansantiye.com`'u yükler, giriş yaparsın; uygulamayı kapatıp açınca oturum (cookie) korunur.

### 3. iOS — gerçek native build (Mac gerekir)
Windows'ta iOS **derlenemez**. Seçenekler:
- **Codemagic / Ionic Appflow** (önerilen): repoyu bağla → bulut macOS'ta build → otomatik TestFlight. Mac satın almaya gerek yok.
- **GitHub Actions** `macos-latest` runner + fastlane.
- Fiziksel/kiralık Mac + Xcode → `npm run cap:open:ios`.

Gerekli: **Apple Developer hesabı ($99/yıl)** + iç dağıtım için **Apple Business Manager**.

---

## 🔧 Faydalı komutlar
| Komut | İş |
|---|---|
| `npm run cap:sync` | Config + eklentileri native projelere işle (eklenti ekledikçe çalıştır) |
| `npm run cap:android` | Android'i emülatör/cihazda çalıştır |
| `npm run cap:open:android` | Android Studio'da aç |
| `npm run cap:open:ios` | Xcode'da aç (Mac) |

---

## ⏭️ Sonraki adımlar
- **Faz 0 (paralel):** Apple Developer + Business Manager + Google Play hesapları; Codemagic/Appflow kurulumu. (D-U-N-S onayı gün alabilir → erken başla.)
- **Faz 2:** Push bildirim (FCM/APNs) + `DeviceToken` modeli + kamera/dosya eklentileri + biyometrik giriş.
- **Faz 3:** Chat (Postgres + Socket.io). **Ön koşul:** `src/middleware.ts` CSP `connect-src` genişletmesi.
- **Faz 4:** Self-hosted LiveKit ile sesli/görüntülü arama.

Detaylı plan: `C:\Users\Berk Ata Ozer\.claude\plans\uzaktansantiye-com-sitesi-var-ya-reactive-lemon.md`

## ⚠️ Sürüm kontrolü (git) notu
`ios/` ve `android/` klasörleri repoya **dahil edilmeli** (build için gerekli). Bu proje şu an git deposu değil; git'e geçilirse `node_modules`, `.next`, `android/app/build`, `ios/App/Pods`, `ios/DerivedData` gibi build çıktıları `.gitignore`'a eklenmeli (native proje kaynakları değil).
