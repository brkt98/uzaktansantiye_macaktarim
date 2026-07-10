# iOS Faz 2 — Gelen Arama (CallKit + PushKit)

> Hedef: iPhone kilitli/uygulama kapalıyken bile **gerçek arama gibi çalan** native ekran (kabul/reddet) — Android'deki `IncomingCallActivity` akışının iOS karşılığı. Faz 1 push (docs/ios/01) çalışıyor; bu faz onun üstüne kurulur.

## 0. En kritik gerçek (mimariyi bu şekillendirir)
**VoIP push (PushKit) FCM ile GÖNDERİLEMEZ.** Sunucumuz şu an her şeyi firebase-admin/FCM ile gönderiyor (`src/lib/push.ts`), ama FCM `apns-push-type: voip` set edemez. Bu yüzden gelen arama için sunucuya **doğrudan-APNs VoIP push** yolu eklenmeli (ES256 JWT + `.p8` ile `api.push.apple.com`'a HTTP/2).

**İyi haber:** Ayrı "VoIP sertifikası" GEREKMEZ — elimizdeki **`.p8` APNs auth key hem alert hem VoIP için çalışır** (token-tabanlı auth). VoIP background mode zaten `Info.plist`'te var. (docs/ios/00'daki "PushKit VoIP cert" ifadesi yanlış — düzeltilecek.)

## 1. Mevcut arama akışı (mirror'lanacak)
- **Arayan** socket `call:ring` yayar → sunucu (`realtime/server.js:277-320`): (a) `call:incoming` socket'i (ön planda in-app modal), (b) `/api/push/send`'e `data{type:"call", conversationId, callerName, callType, fromUserId, relatedUrl}` POST'lar. `relatedUrl = /dashboard/arama/<convId>?video=<0|1>`.
- **Cevapla** = deep-link `/dashboard/arama/<convId>?video=<0|1>&accept=1` → sayfa `call:accept` yayar + **web LiveKit odasına** bağlanır. (`accept=1` şart: arayanın çalması durur + diğer cihazlar susar + bitince uygulamayı minimize eder.)
- **Reddet** (kapalı uygulama) = tokensız `POST /api/call/reject {conversationId, fromUserId}`.
- **İptal/bitir** = `data{type:"call_cancel"}`.

**KİLİT BULGU — medya:** iOS'ta `nativeAudioCallSupported()` sadece Android → iOS aramalar **hem ses hem görüntü için WKWebView WebRTC (web LiveKit SDK)** yolunu kullanır. Yani **Faz 2 için native LiveKit iOS SDK GEREKMEZ** — cevaplama sadece mevcut web odasına deep-link atar. (Native iOS LiveKit = Faz 3, opsiyonel.)

## 2. Zorunlu iOS kuralı (en büyük tuzak)
iOS 13+: `pushRegistry(_:didReceiveIncomingPushWith:)` içinde gelen HER VoIP push **senkron olarak** `CXProvider.reportNewIncomingCall(...)` çağırmalı — yoksa sistem uygulamayı öldürür ve **sonraki VoIP push'ları teslim etmeyi durdurur.** Bu yüzden PushKit handler + CallKit tek, sıkı bağlı bir birim olmalı. `call_cancel` VoIP push'u da gelen çağrıyı raporlamalı (veya `reportCall(with:endedReason)` ile bitirmeli).

## 3. Fazlı plan
### Faz 2a — Native Swift (PushKit + CallKit, MEDYASIZ) *(ben yazarım, sen Mac'te test)*
- `PKPushRegistry` (.voip): VoIP token'ı al (`didUpdate pushCredentials`) → JS'e ver; `didReceiveIncomingPushWith` → payload'ı parse et → **`reportNewIncomingCall`** (çalan ekran) → completion.
- `CXProvider` + `CXProviderConfiguration` (uygulama adı, ikon, `supportsVideo`, zil sesi) + `CXProviderDelegate`: `CXAnswerCallAction` (kabul), `CXEndCallAction` (reddet/bitir), `didActivate/didDeactivate audioSession`.
- **Capacitor plugin** (`registerPlugin("CallKitVoip")` deseni): VoIP token'ı JS'e event'ler + `callAnswered{conversationId,callType,relatedUrl}` / `callEnded{conversationId}` event'leri yayar.
- Test: geçici debug tetikleyiciyle `reportNewIncomingCall` → çalan ekran görünüyor mu.

### Faz 2b — Sunucu: VoIP token + doğrudan-APNs VoIP push *(ben yazarım)*
- **VoIP token depolama:** `platform="ios-voip"` satırı (şema değişikliği YOK, mevcut upsert'i kullanır). ⚠️ `push.ts:99-100` split filtresi güncellenmeli (şu an `ios` olmayan her şeyi `android` sayıyor → `ios-voip` yanlışlıkla android'e düşerdi).
- **`/api/push/register`**: `ios-voip` platformunu kabul et (şu an `ios|android`'e zorluyor).
- **`src/lib/apnsVoip.ts`** (yeni; Node `node:crypto`+`node:http2`, ek paket yok): ES256 JWT (kid=Key ID, iss=Team ID, `.p8` ile imzalı, <60dk cache) → `POST /3/device/<voipToken>` headers `apns-topic: com.mesalegrup.uzaktansantiye.voip` (**`.voip` suffix ZORUNLU**), `apns-push-type: voip`, `apns-priority: 10`, kısa `apns-expiration`. Gövde = aynı arama sözleşmesi.
- **Wire-in:** `sendPushToUser` içinde `data.type==="call"` (veya `call_cancel`) ise → `ios-voip` token'a VoIP push + iOS alert push'unu ATLA (çift çalma olmasın).
- **Yeni env** (`.env.production`): `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_P8` (ham içerik, `FIREBASE_SERVICE_ACCOUNT` gibi tek satır), `APNS_BUNDLE_ID=com.mesalegrup.uzaktansantiye`, `APNS_ENV` (dev build→`sandbox` / release→`production`). **`.p8`'i sen zaten Firebase için ürettin** — sadece app sunucusuna da eklenecek.

### Faz 2c — Cevaplama → web odasına köprü + iptal/reddet *(ben yazarım)*
- CallKit `answer` → WebView'i öne al + `/dashboard/arama/<convId>?video=<0|1>&accept=1`'e git (Android'in `IncomingCallActivity.accept()` deep-link'inin aynısı) → mevcut web LiveKit odası bağlanır.
- CallKit `end` (çalarken) → `POST /api/call/reject {conversationId, fromUserId}` (Android'le aynı).
- `call_cancel` → VoIP push → `reportCall(with:endedReason)` (çalan ekranı kapat).
- **AVAudioSession:** WKWebView WebRTC sesi, CallKit `didActivate audioSession`'dan SONRA route edilmeli (Faz 2'nin ana medya riski).
- ⚠️ **Auth:** VoIP cold-launch sonrası WKWebView'in çerezi geçerli olmalı (yoksa `/api/rtc/token` 401 → arama bağlanmaz). Gerekirse cevaplamadan önce auth yenile.

## 4. Kim ne yapar
| Sen (Apple/Mac) | Ben (kod) |
|---|---|
| `.p8` **Key ID + Team ID**'yi sunucuya ekle (`.p8` sende var) | Swift: PKPushRegistry + CallKit + Capacitor plugin |
| Release'de `aps-environment` → `production` | Sunucu: VoIP token depolama + `apnsVoip.ts` + wire-in |
| Mac'te build/test (gerçek cihaz — VoIP simülatörde sınırlı) | Web: VoIP token kaydı (NativeBridge) + callAnswered/Ended → deep-link |
| (Yeni capability/sertifika GEREKMEZ) | Cevapla/reddet/iptal sinyalleşmesi mevcut sözleşmeyi yeniden kullanır |

## 5. Kararlar (varsayılan)
- VoIP token = `platform="ios-voip"` satırı (migration yok).
- APNs/VoIP gönderimi **Next.js app'te** kalır (realtime değil) → `.p8` sadece app container'da; realtime yine `/api/push/send` çağırır.
- Grup araması: CallKit `reportNewIncomingCall` başına 1:1 — her callee kendi VoIP push'u + çalan ekranını alır (herkes çalar).
- İlk test build'i **sandbox** APNs (dev `aps-environment`) → `api.sandbox.push.apple.com`.

## 6. Açık sorular (ilerledikçe)
- VoIP cold-launch sonrası WKWebView çerezi hayatta mı (yoksa cevaplamadan önce auth refresh).
- Video WKWebView WebRTC performansı kabul edilebilir mi (yoksa Faz 2 audio-only, video Faz 3'e).

**Sıradaki adım:** Faz 2a (native Swift) — ben yazmaya başlarım; sen paralelde `.p8` Key ID + Team ID'yi hazırla. İlişki: docs/ios/01-push-notifications.md · [[ios-native]].
