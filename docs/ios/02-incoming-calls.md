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
- ⚠️ **KRİTİK — local plugin kaydı:** Capacitor 8 iOS'ta plugin kaydı SADECE `ios/App/App/capacitor.config.json` → `packageClassList`'ten yapılır (ObjC runtime taraması YOK, bkz. `@capacitor/ios .../CapacitorBridge.swift:305-334`). `cap sync` bu listeyi yalnızca npm/SPM plugin'lerinden üretir → **local app-target Swift plugin'imizi eklemez.** `CallKitVoipPlugin` (`@objc(CallKitVoipPlugin)` sayesinde ObjC adı birebir bu) elle `packageClassList`'e eklenmeli, yoksa JS'te "not implemented" alır (`window.__testCallRing` set edilmez, `ios-voip` token kaydolmaz). **Her `npx cap sync ios`'tan SONRA bu satırı tekrar ekle.**
- Test: geçici debug tetikleyiciyle `reportNewIncomingCall` → çalan ekran görünüyor mu (Mac Safari Web Inspector konsolu: `window.__testCallRing("Test Arayan", false)`).

### Faz 2b — Sunucu: VoIP token + doğrudan-APNs VoIP push ✅ *(YAZILDI + review-sertleştirildi, 2026-07-10)*
- **VoIP token:** `platform="ios-voip"` satırı (migration yok). `/api/push/register` `ios-voip`'i kabul ediyor; sunucuda kayıtlı (doğrulandı).
- **`src/lib/apnsVoip.ts`** (yeni; `node:crypto`+`node:http2`, ek paket YOK): ES256 JWT (`dsaEncoding:'ieee-p1363'` → ham 64-bayt R‖S; DER olursa 403 InvalidProviderToken) + JWT ~50dk cache; uzun-ömürlü HTTP/2 session (lazy reconnect); `POST /3/device/<token>` headers `apns-topic: com.mesalegrup.uzaktansantiye.voip` (`.voip` ZORUNLU), `apns-push-type: voip`, `apns-priority:10`, `apns-expiration: now+20`. Payload = `{aps:{}, ...data}` **ÜST DÜZEY** (CallKitManager `d["type"]` vb. okur). Tek-sefer retry (JWT yenile / stream); **yalnız 410 Unregistered'da** token sil (BadDeviceToken=env uyumsuzluğu → silme). APNS_* yoksa **no-op**.
- **Wire-in (`push.ts` `sendPushToUser`):** `data.type==="call"||"call_cancel"` ise `ios-voip` token'lara VoIP push. iOS FCM-alert dalı `suppressIosCallAlert = isCall && (isCancel || voipDelivered)` ile atlanır → **VoIP gerçekten teslim edildiyse** çift bildirim yok; **teslim edilmediyse** (token yok/APNS kapalı/APNs reddi) eski FCM-alert'e **fallback**. Android dalı ve `type==="message"` iOS davranışı AYNEN.
- **Env** (server `.env`): `APNS_KEY_ID=57T2884RPR`, `APNS_TEAM_ID=M254VNMF38`, `APNS_P8` (tek satır `\n`), `APNS_BUNDLE_ID=com.mesalegrup.uzaktansantiye`, `APNS_ENV=sandbox` (dev build). docker-compose `app` servisine passthrough eklendi (`:-` default → no-op).
- **Adversarial review düzeltmeleri (2 high + 2 med):** (A) retry paylaşılan HTTP/2 session'ı yıkmıyor (eşzamanlı aramaları düşürüyordu); (B) VoIP teslim edilmezse FCM fallback; (C) `call_cancel` PushKit sözleşmesi (aşağıda).
- ⚠️ **`call_cancel` = VoIP push → PushKit sözleşmesi (Fix C, Swift):** iOS 13+ alınan HER VoIP push senkron `reportNewIncomingCall` çağırmalı, yoksa app öldürülür + VoIP kısıtlanır. `CallKitManager` call_cancel dalı: asıl çağrıyı bitir + görünmez placeholder'ı report-then-immediately-end (`completion()` bitirme bloğunun İÇİNDE) + `maximumCallsPerCallGroup=2`. **Mimari not (gelecek):** Apple iptali 2. VoIP push yerine açık WebSocket'ten iletmeyi önerir (placeholder Recents izini kaldırır) — Faz 2c/sonrası iyileştirme.

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
