# Faz 4 — iOS Ekran Paylaşımı (ReplayKit Broadcast Upload Extension + LiveKit)

**Amaç:** Görüntülü aramada sistem-geneli ekran paylaşımı — Android MediaProjection akışının iOS eşi. Ayrı `-screen` identity'li AYRI Room'a publish (sözleşme Android'le birebir; sunucu + web izleyici DEĞİŞMEDİ).

## Deprecation kararı (soruya cevap)
Apple docs'taki "Deprecated" ibaresi **iOS 27 SDK**'dan (WWDC Haziran 2026, şu an BETA). Önerilen replacement (ScreenCaptureKit `SCContentSharingPicker`) **yalnız iOS 27+**'da var — sahadaki cihazlar iOS 15-26. **Deprecated ≠ kaldırıldı**: `RPBroadcastSampleHandler` iOS 27'de de çalışır (yalnız derleme uyarısı). LiveKit/libwebrtc hâlâ bu deseni kullanıyor; SDK ReplayKit'i bizim yerimize sarmalıyor (`LKSampleHandler`). **Karar: bugün ReplayKit Broadcast Extension; iOS 27 yaygınlaşınca `#available(iOS 27,*)` arkasına SCK path'i eklenir (ayrı faz).** Min iOS 15 korunur.

## Mimari (LiveKit 2.15.1 kaynak-doğrulamalı)
- Kullanıcı MonitorUp butonuna basar (CallRoom, görüntülü arama) → `startScreenShare({token,url})` → native `BroadcastManager.requestActivation()` sistem picker'ını açar → "Yayını Başlat" → **BroadcastExtension süreci** doğar (`LKSampleHandler`) → kareler **App Group unix soketi** (`rtc_SSFD`) ile ANA app'e akar → ana app **ayrı screenRoom**'da publish eder. Extension WebRTC ÇALIŞTIRMAZ (50MB limitine takılmaz).
- **KRİTİK:** `BroadcastManager.shared.shouldPublishTrack = false` (prepareForCallKit'te) — yoksa açık HER Room (sesli arama dahil) broadcast başlayınca kendine publish etmeye kalkar; soket TEK alıcı kabul eder.
- Sistemden durdurma (status bar kırmızı gösterge) → `isBroadcastingPublisher` → screenRoom teardown + `screenShareState {active:false}` → web buton senkron (CallRoom listener).
- Konvansiyon (Info.plist anahtarı GEREKMEZ): extension bundle id = `com.mesalegrup.uzaktansantiye.broadcast`, App Group = `group.com.mesalegrup.uzaktansantiye`.

## Ben (kod) — YAPILDI
- `LiveKitCallManager.swift`: screenRoom + startScreenShare/stopScreenShare/wireBroadcastObserver/waitForBroadcastStart/teardownScreenRoom; disconnect'e screen teardown; prepareForCallKit'e observer.
- `LiveKitCallPlugin.swift`: getSdkInfo `screenShare:true`; start/stop gerçek implementasyon.
- `src/lib/liveKitCall.ts`: `nativeScreenShareSupported` iOS dalı (web-deploy; eski build'de SCREEN_FLAG=0 → güvenli).
- `CallRoom.tsx`: `screenShareState` listener (buton senkronu).

## Sen (Mac / Xcode) — SIRAYLA
1. **git pull** (güncel Swift + bu doküman).
2. **Extension target:** File > New > Target… > iOS > **"Broadcast Upload Extension"** > Next. Product Name: `BroadcastExtension`. **"Include UI Extension" işaretini KALDIR.** Team: ana app ile aynı. Finish. "Activate scheme?" → **Cancel**.
3. **Bundle id DÜZELT:** TARGETS > BroadcastExtension > Signing & Capabilities > Bundle Identifier → **`com.mesalegrup.uzaktansantiye.broadcast`** yap (Xcode `...BroadcastExtension` üretir; son segment birebir küçük harf `broadcast` olmalı — yoksa SDK extension'ı bulamaz, sessizce yalnız-kendi-app moduna düşer).
4. **App Groups (İKİ target):** TARGETS > App (Uzaktan Şantiye) > Signing & Capabilities > + Capability > App Groups > + > `group.com.mesalegrup.uzaktansantiye` (işaretli). AYNISINI BroadcastExtension target'ına da. *(Ücretli hesap + Automatic signing → Xcode portalda otomatik kaydeder. "Provisioning profile doesn't include App Groups" hatasında: developer.apple.com > Identifiers > App Groups'ta grubu elle oluştur + iki App ID'de işaretle + Xcode "Try Again".)*
5. **Deployment target:** BroadcastExtension > General > Minimum Deployments → **15.0**.
6. **LiveKit'i extension'a linkle:** BroadcastExtension > General > Frameworks and Libraries > + > **LiveKit** (SPM product).
7. **SampleHandler içeriği:** Xcode'un ürettiği `BroadcastExtension/SampleHandler.swift` dosyasının TÜM içeriğini şununla değiştir (Target Membership: YALNIZ BroadcastExtension):
```swift
// BroadcastExtension/SampleHandler.swift — TARGET: YALNIZ BroadcastExtension (App'e EKLEME).
// ReplayKit Broadcast Upload Extension giriş noktası. LiveKit LKSampleHandler tüm işi yapar:
// kareleri App Group unix soketi (rtc_SSFD) ile ANA APP'e iletir. WebRTC bu süreçte ÇALIŞMAZ
// (50MB extension limitine takılmaz). BAŞKA KOD EKLEME.
import LiveKit

#if os(iOS)
@available(macCatalyst 13.1, *)
class SampleHandler: LKSampleHandler {
    // Hata ayıklama: macOS Console app > cihaz > kategori "LKSampleHandler"
    override var enableLogging: Bool { true }
}
#endif
```
8. **Derle:** Şema **App** + gerçek iPhone → `Cmd+B`. `⚠️ Xcode'da doğrula` yorumlu satırları autocomplete ile teyit et (`ScreenShareCaptureOptions(dimensions:fps:appAudio:useBroadcastExtension:)`, `RoomOptions(defaultScreenShareCaptureOptions:)`, `BroadcastManager.shared`). Hata çıkarsa mesajı yolla.
9. **Commit:** pbxproj + BroadcastExtension dosyaları + entitlements + Package.resolved; iki mirror senkron.

> ⚠️ Her `npx cap sync ios` sonrası `packageClassList`'te `LiveKitCallPlugin` + `CallKitVoipPlugin` durmalı (bilinen risk). Sync extension target'ına DOKUNMAZ. `CapApp-SPM/Package.swift`'e LiveKit EKLEME.

## Test matrisi (gerçek iPhone şart — simülatörde broadcast çalışmaz)
| # | Senaryo | Beklenen |
|---|---|---|
| 1 | GÖRÜNTÜLÜ arama > MonitorUp > "Yayını Başlat" | Karşı cihaz iOS ekranını tam ekran görür |
| 2 | Picker'da İPTAL | ~3sn'de reject; buton değişmez; hemen tekrar denenebilir |
| 3 | App içi durdur | Görüntü kalkar; kırmızı gösterge söner |
| 4 | Status bar kırmızı gösterge > Durdur | Buton KENDİLİĞİNDEN "paylaş"a döner; görüntü kalkar |
| 5 | Paylaşım sırasında BAŞKA app aç | Karşı taraf o app'i CANLI görür; arama sesi sürer (KRİTİK) |
| 6 | Paylaşım açıkken aramayı kapat | Yayın + screenRoom + arama hepsi kapanır |
| 7 | 3x başlat/durdur | Sızıntı/çakışma yok |
| 8 | SESLİ aramada Kontrol Merkezi'nden elle yayın | Hiçbir Room publish etmez (shouldPublishTrack=false); ses bozulmaz |
| 9 | Android paylaşır, iOS izler | Regresyon yok |

Debug: macOS Console app > cihaz > kategori `LKSampleHandler`.

## Riskler
- Picker-iptal sezgisi (didBecomeActive+2.5sn grace): nadir false-negative → sorun görülürse grace 4sn'ye çıkarılır.
- Konvansiyon hatası belirtisi: karşı taraf yalnız uygulamanın kendisini görür (in-app'e sessiz düşüş) → Adım 3/4 kontrol; son çare `RTCScreenSharingExtension`/`RTCAppGroupIdentifier` override.
- iOS 27 deprecation: yalnız derleme uyarısı; SCK geçişi ayrı faz.

İlişki: [[03-native-audio-livekit.md]] · Android referans `android/.../LiveKitCallPlugin.kt`.
