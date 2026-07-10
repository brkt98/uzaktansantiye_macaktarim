# Faz 3 — iOS Native Sesli Arama (LiveKit Swift SDK)

**Amaç:** iOS'ta **sadece sesli** aramalarda ses motorunu WKWebView WebRTC'den native **LiveKit iOS SDK**'ya taşı — Android `LiveKitCall` mimarisinin birebir eşi. Böylece kilitli ekranda ses akar ve earpiece/hoparlör doğru route olur (CallKit `didActivate` ↔ `AudioManager.setEngineAvailability` el sıkışması). **Görüntülü aramalar WKWebView LiveKitRoom'da kalır** (dokunulmadı).

## Mimari (Android → iOS eşleme)
| Katman | Android | iOS (bu iş) |
|---|---|---|
| Gate | `liveKitCall.ts` android-only | aynı, `"ios"` dalı eklendi ✓ |
| UI | `NativeAudioCallRoom.tsx` | **DEĞİŞMEDİ** (platform-agnostik) |
| Motor | `LiveKitCallPlugin.kt` | **yeni** `LiveKitCallManager.swift` + `LiveKitCallPlugin.swift` |
| Ses odağı | AudioSwitchHandler | CallKit `didActivate` → `AudioManager.setEngineAvailability(.default)` |
| Çalan ekran | FullScreenIntent | CallKit/PushKit (mevcut `CallKitManager`) |

## Ben (kod) — YAPILDI
- **Yeni:** `ios/App/App/LiveKitCallManager.swift` (LiveKit SDK motoru + RoomDelegate→event köprüsü + sentetik participantConnected), `ios/App/App/LiveKitCallPlugin.swift` (Capacitor köprüsü, `jsName="LiveKitCall"`).
- `ios/App/App/CallKitManager.swift`: `didActivate`/`didDeactivate`/`perform(end)`'e **callType dalı** (audio→LiveKit motoru; video→mevcut WKWebView route).
- `ios/App/App/AppDelegate.swift`: açılışta `LiveKitCallManager.shared.prepareForCallKit()` (auto-config OFF + engine none).
- `ios/App/App/capacitor.config.json`: `packageClassList`'e `"LiveKitCallPlugin"` eklendi.
- `src/lib/liveKitCall.ts`: `checkNativeAudioEngine` + `nativeAudioCallSupported` iOS dalı. **DEPLOY edildi** (rebuild öncesi `getSdkInfo` reject → WKWebView fallback, güvenli).
- İki mirror (canonical + macaktarim) senkron.

## Sen (Mac / Xcode) — YAPILACAK
1. `ios/App/App.xcodeproj`'u Xcode'da aç (workspace yok, SPM modu).
2. Proje navigator > **App (mavi proje ikonu)** > **Package Dependencies** sekmesi > sol alt **+**.
3. URL: `https://github.com/livekit/client-sdk-swift` → **Up to Next Major** `2.15.1` → **Add Package** (ilk çözümde WebRTC + UniFFI xcframework indirir — **büyük, birkaç dk, app boyutu artar**).
4. "Choose Package Products": **LiveKit** ürününü **App** target'ına ekle.
5. Doğrula: **App target > General > Frameworks, Libraries, and Embedded Content**'te `LiveKit` görünmeli.
6. İki yeni Swift dosyasını App target'a **dahil et**: `LiveKitCallManager.swift` + `LiveKitCallPlugin.swift` diskte `ios/App/App/` içinde var; Xcode'da App/App grubunda görünmüyorsa sağ tık > Add Files to "App" → **Targets: App işaretli**. (`import Capacitor` + `import LiveKit` aynı target'ta çözülür.)
7. `Cmd+B` build. **SDK API doğrulaması:** kodda `⚠️ Xcode'da doğrula` yorumlu satırlar var (RoomDelegate imzaları, `AudioManager.shared.audioSession`, `participant.identity?.stringValue`, `remoteParticipants`). Derleme hatası olursa autocomplete ile o satırları 2.15.x imzasına göre düzelt.
8. `App.xcodeproj/.../swiftpm/Package.resolved`'ı commit et (sürüm sabitlensin).
9. Gerçek cihazda çalıştır + test (aşağıdaki matris).

## ⚠️ `npx cap sync ios` uyarısı
Her sync SONRASI `ios/App/App/capacitor.config.json` → `packageClassList`'te **hem `"CallKitVoipPlugin"` hem `"LiveKitCallPlugin"`** satırlarının durduğunu doğrula (sync bunları düşürür). LiveKit paketi (SPM) `.xcodeproj`'da olduğu için sync'ten sağ çıkar; `CapApp-SPM/Package.swift`'e **LiveKit EKLEME** (sync siler).

## Test matrisi (2 cihaz/2 hesap; gerçek cihaz şart)
- **Faz 1** giden SESLİ (app-açık): iki cihaz bağlanıyor mu, çift yönlü ses, hangup? Konsol: `[callkit]`/`[livekit]`.
- **Faz 2** route: varsayılan **ahize** mi, **hoparlör** butonu geçiş yapıyor mu, **mute** çalışıyor mu?
- **Faz 3** gelen SESLİ kilitli (CallKit'ten cevap): ses kilitli ekranda **çift yönlü** akıyor mu? `didActivate` sonrası bağlanıyor mu?
- **Regresyon** GÖRÜNTÜLÜ arama: WKWebView yolu (CallRoom + CallKitVoip route) hâlâ çalışıyor mu?

## Riskler / bilinen tuzaklar
- `setEngineAvailability(.default)` mic-izni `notDetermined` iken çağıran thread'i BLOKLAR (SDK #815) → `connect()` mic iznini önce ister (yapıldı).
- Giden yolda `setActive(true)` gerekliliği belirsiz (auto-config OFF) — cihazda ses gelmezse `connect()`'teki `setActive` satırını doğrula.
- Ringback (WebAudio beep) native AVAudioSession ile yan yana; minör route contention riski.
- VoIP cold-launch sonrası WKWebView çerezi geçersizse `/api/rtc/token` 401 → oda bağlanmaz (auth, ses değil). Test ederken önce oda CONNECTED oluyor mu bak.
- App boyutu: WebRTC xcframework büyük.

İlgili: [[02-incoming-calls.md]] · Android referans `android/.../LiveKitCallPlugin.kt`.
