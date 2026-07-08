# iOS Native Roadmap — Uzaktan Şantiye (iPhone + iPad)

> Bu klasör (`docs/ios/`) iOS native geliştirmenin plan + rehberidir. Native Swift kodu `ios/` (Capacitor iOS projesi) içine yazılır. "iOS release dökümanları nerede?" → `docs/ios/`.

---

## 0. ÖNCE: Mimari ilke (yanlış yola sapmayalım)

⚠️ **Frontend'i iOS için AYRI bir klasöre KOPYALAMIYORUZ.** Bu bir **Capacitor remote-URL** uygulaması: tüm arayüz/iş mantığı (`src/`) tek bir web kod tabanıdır ve **hem Android hem iOS** aynı `https://uzaktansantiye.com`'u yükler. İki kopya = her değişikliği iki kez yapmak (daha önce "projeleri ayıralım mı?" diye konuştuk, cevap: **hayır, tek proje**).

**iPhone vs iPad farkı zaten hazır:**
- `useDevice()` hook'u → `{ isMobile, isTablet }` (fiziksel ekran tabanlı). **iPad = `isTablet`**, iPhone = `isMobile`. Uygulama zaten bunu kullanıyor (örn. tablette 2-panel sohbet).
- iOS'a ÖZEL bir davranış gerekirse: `Capacitor.getPlatform() === "ios"` runtime kontrolü. **Klasör bölmeye gerek yok.**

**iOS'a özel olan tek şey → `ios/` içindeki native Swift** (Android'in `android/` Java/Kotlin karşılığı). Bu roadmap onu kuruyor.

---

## 1. Gerçekler & kısıtlar

- 🖥️ **iOS build SADECE Mac + Xcode'da yapılır.** (Sende Mac + Xcode var ✓.) Ben (asistan) **Swift + config yazarım**, ama **derleme/test + Xcode-tarafı adımlar (capability, extension target, provisioning, imzalama) Mac'te** yapılır.
- 🍎 **Apple Developer Program** ($99/yıl) şart (push, dağıtım, extension'lar için).
- 📦 Capacitor 8 iOS **Swift Package Manager (SPM)** kullanır (Podfile yok). Bağımlılıklar `ios/App/CapApp-SPM/Package.swift`.
- 📱 `applicationId` iOS'ta **bundle identifier** = `com.mesalegrup.uzaktansantiye` (Apple Developer'da App ID olarak kaydedilir; DEĞİŞTİRME).

### Çalışma yöntemi (öneri): **faz faz**
Binlerce satır test edilmemiş Swift'i tek seferde dökmek yerine, her fazı **Mac'te derleyip test ederek** ilerleyeceğiz. Sıradaki faza, öncekini çalıştırdıktan sonra geçeriz. Böylece Mac zamanın boşa gitmez.

---

## 2. Android → iOS native özellik haritası

| # | Android (mevcut) | iOS karşılığı | Zorluk | Xcode/Apple tarafı gereken |
|---|---|---|---|---|
| **Push (temel)** | FCM (@capacitor/push-notifications) + CallMessagingService | **Firebase iOS SDK (FirebaseMessaging)** → FCM token; APNs üzerinden teslim | Orta | Push capability, APNs .p8 key → Firebase, GoogleService-Info.plist |
| **Sohbet bildirimi** | ChatNotif (MessagingStyle + Yanıtla/Okundu aksiyon) | `UNNotificationCategory` + `UNTextInputNotificationAction` (yanıt) + action (okundu) + **Communication Notifications** (INSendMessageIntent) zengin görünüm | Orta-Yüksek | (opsiyonel) Notification Service Extension target |
| **Gelen arama (çalan ekran)** | IncomingCallActivity + CallForegroundService + FullScreenIntent | **CallKit** (CXProvider — kilit ekranı native arama UI) + **PushKit** (PKPushRegistry — VoIP push ile uyandırma) | Yüksek | VoIP background mode, PushKit VoIP cert, CallKit |
| **Sesli/görüntülü arama (medya)** | LiveKitCallPlugin.kt (LiveKit Android SDK) | **LiveKit iOS SDK** (Swift, SPM) — Room, audio/video track | Yüksek | Mikrofon/kamera capability (Info.plist hazır) |
| **Ekran paylaşımı** | LiveKit ScreenCapture (MediaProjection) | **ReplayKit + Broadcast Upload Extension** (ayrı target) + LiveKit iOS screen-share track | **En yüksek** | Broadcast Extension target, App Group |
| **PiP (görüntülü arama)** | PipPlugin (PictureInPictureParams) | **AVPictureInPictureController** — WebRTC video için özel (AVSampleBufferDisplayLayer) | Yüksek | — |
| **Biyometrik kilit** | BiometricPlugin (BiometricPrompt) | **LocalAuthentication** (Face ID/Touch ID) + `NSFaceIDUsageDescription` | Düşük | — |
| **Ses yönlendirme** | AudioRoutePlugin | **AVAudioSession** (hoparlör/ahize/route) | Düşük-Orta | — |
| **Paylaşım hedefi** | ShareTargetPlugin | **Share Extension** (ayrı target) | Orta | Share Extension target, App Group |
| **Pil optimizasyonu** | BatteryOptPlugin | **N/A** — iOS'ta karşılığı yok; arka plan teslim VoIP push (PushKit) ile güvenilir | — | — |
| **Full-screen intent** | FullScreenIntentPlugin | **N/A** — CallKit zaten kilit-ekranı arama UI'ını sağlar | — | — |

> **Ortak JS arayüzü korunur:** iOS plugin'leri Android'le AYNI plugin adı + method imzasını sunar (`registerPlugin("LiveKitCall")` vb.) → `src/lib/liveKitCall.ts`, `NativeBridge.tsx` gibi web kodu **değişmez**, runtime `getPlatform()` ile çalışır.

---

## 3. Fazlar (sıralı)

### Faz 0 — Apple Developer + Xcode temeli *(Mac, senin)*
- [ ] Apple Developer Program üyeliği
- [ ] App ID kaydı: `com.mesalegrup.uzaktansantiye`
- [ ] Capabilities: **Push Notifications**, **Background Modes** (voip, remote-notification, audio)
- [ ] **APNs Authentication Key (.p8)** üret → **Firebase Console** iOS app'ine yükle
- [ ] **GoogleService-Info.plist** (Firebase iOS) indir → `ios/App/App/`'e ekle
- [ ] Provisioning profiles (dev + distribution)
- [ ] Uygulama ikonu (meşale) iOS Asset Catalog'una (App icon set) — Android'de üretilenden türetilebilir

### Faz 1 — Push bildirimleri → **[01-push-notifications.md](01-push-notifications.md)** *(ilk iş)*
Firebase iOS SDK (SPM) + FCM token + APNs teslim + bildirim gösterimi + tıklama yönlendirme + Yanıtla/Okundu aksiyonları. Sunucu tarafı (FCM gönderimi) **aynen çalışır** — iOS de FCM token kaydeder (`/api/push/register`).

### Faz 2 — Gelen arama (CallKit + PushKit)
VoIP push (PushKit) → CallKit ile kilit ekranı native arama ekranı (çalma/kabul/reddet). Android'in IncomingCallActivity+FullScreenIntent akışının iOS-native, daha entegre karşılığı.

### Faz 3 — LiveKit iOS (sesli/görüntülü arama medyası)
LiveKit iOS SDK (SPM) → `LiveKitCall` plugin'inin iOS Swift implementasyonu (connect/mic/speaker/disconnect/video). Android `LiveKitCallPlugin.kt` ile aynı JS arayüzü.

### Faz 4 — Ekran paylaşımı (ReplayKit + Broadcast Extension)
En karmaşık: ayrı **Broadcast Upload Extension** target + App Group + LiveKit iOS screen-share track. Faz faz test şart.

### Faz 5 — PiP + biyometrik + ses route + paylaşım hedefi
AVPictureInPictureController, LocalAuthentication, AVAudioSession, Share Extension.

---

## 4. iOS dağıtımı (private analog — Model B)
Android'de "unlisted + login gate" seçtik. iOS karşılığı:
- **TestFlight** (dahili/harici test — hızlı, hesap login'imizle kısıtlı) → ilk dağıtım.
- App Store **unlisted** dağıtım (Apple'dan talep) **veya** Apple Business Manager **Custom Apps** (organizasyona özel) → kalıcı.
- Uygulamanın kendi girişi (admin'in açtığı hesap) erişimi zaten kısıtlar.

---

## 5. Ben ne yaparım / sen ne yaparsın
| Ben (Windows'tan) | Sen (Mac/Apple Developer) |
|---|---|
| Swift plugin + AppDelegate kodu | Xcode'da capability/entitlement aç |
| Info.plist / entitlements | Extension target'ları ekle (Broadcast/Share/NotifService) |
| Package.swift (SPM bağımlılık) | Provisioning + imzalama |
| Her fazın rehberi + adımları | Build/test/run + Apple Developer setup (App ID, APNs key, GoogleService-Info.plist) |

**Sıradaki adım:** Faz 0 (Apple Developer setup) + Faz 1 (push) → [01-push-notifications.md](01-push-notifications.md).
