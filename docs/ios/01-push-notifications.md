# iOS Faz 1 — Push Bildirimleri (APNs + FCM)

> Hedef: Android'deki bildirim akışının **aynısı** iOS'ta. Sunucu tarafı (FCM gönderimi) **değişmiyor** — iOS de bir **FCM token** üretip `/api/push/register`'a kaydeder; `sendPushToUser` iOS'a APNs üzerinden ulaşır.

## Neden Firebase iOS SDK? (kritik nokta)
`@capacitor/push-notifications` iOS'ta **APNs token** döndürür — ama sunucumuz **FCM token**'a gönderiyor. FCM token'ı iOS'ta almak için **Firebase iOS SDK (FirebaseMessaging)** gerekir (APNs'i altında kullanır). İki yol:
- **(A) Firebase iOS SDK + AppDelegate** (aşağıdaki yaklaşım) — token'ı WebView'e event ile verir, JS `/api/push/register`'a yollar (çerezle).
- **(B) `@capacitor-firebase/messaging` plugin** — cross-platform FCM token + event'leri hazır verir. Daha az native kod; tercih edilebilir.

> Öneri: **(B)** ile başla (en az native kod). Aşağıda (A)'nın AppDelegate kodu referans olarak verilmiştir; (B) seçilirse plugin'in `token`/`notificationReceived`/`notificationActionPerformed` event'lerini `NativeBridge.tsx`'te dinlersin (Android'deki `PushNotifications.addListener` deseninin aynısı).

---

## Adım 1 — Apple Developer + Firebase *(Mac / Console)*
- [ ] Apple Developer: App ID `com.mesalegrup.uzaktansantiye` → **Push Notifications** capability aç
- [ ] **APNs Authentication Key (.p8)** üret (Keys → +) → Key ID + Team ID not al
- [ ] **Firebase Console** → mevcut `uzaktan-santiye` projesine **iOS app ekle** (bundle id aynı) → **GoogleService-Info.plist** indir
- [ ] Firebase → Project Settings → Cloud Messaging → **APNs key (.p8) yükle** (Key ID + Team ID)
- [ ] `GoogleService-Info.plist`'i Xcode'da `ios/App/App/` içine ekle (target'a dahil et)
- [ ] Xcode → Signing & Capabilities → **Push Notifications** + **Background Modes** (Remote notifications) işaretli

## Adım 2 — SPM bağımlılığı
Xcode → File → Add Package Dependencies → `https://github.com/firebase/firebase-ios-sdk` → **FirebaseMessaging** ürününü App target'ına ekle.
(veya (B) yolu: `npm i @capacitor-firebase/messaging` → `npx cap sync ios`.)

## Adım 3 — AppDelegate (A yolu — referans Swift)
`ios/App/App/AppDelegate.swift`'e ekle:

```swift
import FirebaseCore
import FirebaseMessaging
import UserNotifications
import Capacitor

// didFinishLaunchingWithOptions içinde:
FirebaseApp.configure()
Messaging.messaging().delegate = self
UNUserNotificationCenter.current().delegate = self
registerChatCategories()                 // Yanıtla/Okundu aksiyonları
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
    if granted { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
}

// APNs token → FCM'e bağla
func application(_ app: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken t: Data) {
    Messaging.messaging().apnsToken = t
}

// MessagingDelegate: FCM token hazır → WebView'e bildir (JS /api/push/register'a yollar)
extension AppDelegate: MessagingDelegate {
    func messaging(_ m: Messaging, didReceiveRegistrationToken token: String?) {
        guard let token = token else { return }
        // Capacitor bridge event'i → NativeBridge dinler (Android 'registration' deseninin aynısı)
        CAPBridge.getLastBridge()?.triggerWindowJSEvent(eventName: "fcmToken", data: "{\"token\":\"\(token)\"}")
    }
}

// UNUserNotificationCenterDelegate: ön planda göster + tıklama/aksiyon
extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification,
        withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Uygulama ön plandaysa sistem-bildirimi BASTIR (in-app sohbet zaten gösterir) → Android isAppInForeground mantığı
        done([])
    }
    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse,
        withCompletionHandler done: @escaping () -> Void) {
        let data = r.notification.request.content.userInfo
        handleNotificationAction(actionId: r.actionIdentifier, userText: (r as? UNTextInputNotificationResponse)?.userText, data: data)
        done()
    }
}
```

## Adım 4 — Yanıtla / Okundu aksiyonları (Android ChatReply/MarkRead karşılığı)
```swift
func registerChatCategories() {
    let reply = UNTextInputNotificationAction(identifier: "REPLY", title: "Yanıtla",
        options: [], textInputButtonTitle: "Gönder", textInputPlaceholder: "Mesaj…")
    let read  = UNNotificationAction(identifier: "MARK_READ", title: "Okundu yap", options: [])
    let cat = UNNotificationCategory(identifier: "CHAT_MESSAGE", actions: [reply, read],
        intentIdentifiers: [], options: [])
    UNUserNotificationCenter.current().setNotificationCategories([cat])
}
```
- Sunucu, iOS push'unda `apns.payload.aps.category = "CHAT_MESSAGE"` göndermeli (kilit ekranında Yanıtla/Okundu çıksın). → `src/lib/push.ts` iOS dalına `category` eklenecek (ufak sunucu değişikliği).
- `handleNotificationAction`: REPLY → realtime `/command` (Android ChatReplyReceiver ile aynı endpoint), MARK_READ → read endpoint. **Çerez/oturum** gerektiğinden en temizi: aksiyonu WebView'e event ile iletip JS'in çağırması (Android'de de kapalı-uygulama için realtime servis-içi kanal kullanılıyordu).

## Adım 5 — JS tarafı (NativeBridge)
- iOS FCM token event'ini dinle → mevcut `/api/push/register`'a yolla (Android'le aynı body: `{ token, platform: "ios" }`).
- `POST_NOTIFICATIONS` iOS'ta yok; izin `requestAuthorization` ile alınır (yukarıda). NativeBridge zaten `PushNotifications.requestPermissions` çağırıyor — (B) yolunda plugin bunu iOS'ta halleder.

## Adım 6 — Zengin/gruplu sohbet bildirimi (opsiyonel, sonra)
Android MessagingStyle'ın iOS karşılığı **Communication Notifications** (`INSendMessageIntent`) — WhatsApp-tarzı avatar+isim. Bir **Notification Service Extension** target'ı ister (Mac). İlk sürümde şart değil; temel bildirim + kategoriler yeterli.

## Test (Mac'te build sonrası)
1. Gerçek cihaz (simülatörde push sınırlı) → izin ver → FCM token `/api/push/register`'a düştü mü (sunucu device_tokens'ta `platform=ios`)?
2. `POST /api/push/test` → bildirim geldi mi?
3. Arka planda başka hesaptan mesaj → bildirim + Yanıtla/Okundu aksiyonları.
4. Ön planda → bildirim bastırılıyor, in-app + rozet çalışıyor.
