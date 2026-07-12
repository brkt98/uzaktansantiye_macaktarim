# Faz 5b — iOS Paylaşım Hedefi (Share Extension + App Group)

**Amaç:** Başka uygulamadan (Galeri, Fotoğraflar, Dosyalar, WhatsApp…) veya kendi medya görüntüleyicimizden fotoğraf/video/dosya/metin paylaşıp uygulama içi bir sohbete iletme — Android `ShareTargetPlugin.java` + ACTION_SEND intent-filter akışının iOS eşi. Sözleşme + tüketici sayfa (`/dashboard/sohbet/paylas`) + sunucu (`/api/chat/media` + socket) DEĞİŞMEDİ.

## Mimari (Android'den yapısal fark)
iOS'ta paylaşım AYRI süreçte (Share Extension) yakalanır; extension Capacitor bridge'e erişemez. Akış:
1. Kullanıcı paylaşım sayfasından uygulamayı seçer → **ShareExtension süreci** doğar (`ShareViewController`).
2. Extension her eki App Group container'ına yazar: `shares/<id>/<dosya>` + `shares/<id>/manifest.json`; `shareCounter`/`pendingShareId`'yi paylaşımlı `UserDefaults(suiteName:)`'a koyar. **base64 YAPMAZ** (extension ~120MB bellek limiti — büyük dosyada patlardı; yalnız kopyalar; 25MB üstünü `tooLarge` işaretleyip kopyalamaz = Android eşi).
3. Extension ana uygulamayı **`uzaktansantiye://share`** ile açar (responder-zinciri `openURL` — extension'da standart teknik).
4. Ana app'teki **`ShareTargetPlugin`** (`load()` + `didBecomeActive`) container'ı okur → dosyaları base64'e çevirir → Android ile BİREBİR `ShareData` üretir → `pending` + `shareReceived` yayar.
5. Web `NativeBridge` `getPendingShare`/`shareReceived` ile `/dashboard/sohbet/paylas`'a yönlendirir; kullanıcı sohbet seçer → `/api/chat/media` upload + socket `message:send` → `clearPendingShare` (pending temizlenir + container paketi silinir + `pendingShareId=0`).

**Graceful degrade:** `openURL` başarısız olsa bile paylaşım container'da kalır → kullanıcı app'i açınca `didBecomeActive` yakalar. Eski build'de (plugin yok) `getPendingShare` throw → `/paylas` sohbete döner (kırılmaz). `isNativeShare()` iOS'a açıldı (web deploy).

**Konvansiyonlar:** extension bundle id `com.mesalegrup.uzaktansantiye.share`; App Group `group.com.mesalegrup.uzaktansantiye` (Faz 4'ten HAZIR — ana app'te zaten var, yalnız yeni extension target'ına eklenecek); URL scheme `uzaktansantiye`.

## Ben (kod) — YAPILDI
- `ios/App/App/ShareTargetPlugin.swift` (YENİ, iki mirror) — ana app plugin (container→ShareData, base64, pending, clear).
- `ios/App/ShareExtension/ShareViewController.swift` (YENİ, iki mirror) — extension giriş noktası (Mac'te oluşturulan target'a yapıştırılacak; repo'da sürüm kontrolü için).
- `ios/App/App/Info.plist` → `CFBundleURLTypes` (`uzaktansantiye` scheme) [iki mirror].
- `ios/App/App/capacitor.config.json` → packageClassList'e `"ShareTargetPlugin"` [iki mirror].
- Web (canonical, DEPLOY): `src/lib/shareTarget.ts` `isNativeShare()` iOS dalı.

## Sen (Mac / Xcode) — SIRAYLA
1. **git pull** (macaktarim).
2. **Ana app plugin'i projeye ekle:** Xcode sol panel > App klasörüne sağ tık > **Add Files to 'App'…** > `ShareTargetPlugin.swift` > **Target: Uzaktan Şantiye** işaretli.
3. **Extension target:** File > New > Target… > iOS > **"Share Extension"** > Next. Product Name: `ShareExtension`. Team: ana app ile aynı. Finish. "Activate scheme?" → **Cancel**.
4. **Bundle id DÜZELT:** TARGETS > ShareExtension > Signing & Capabilities > Bundle Identifier → **`com.mesalegrup.uzaktansantiye.share`**.
5. **App Groups (İKİ target):** ShareExtension target'a + Capability > **App Groups** > `group.com.mesalegrup.uzaktansantiye` işaretle. *(Ana app'te Faz 4'ten zaten var.)*
6. **Deployment target:** ShareExtension > General > Minimum Deployments → **15.0**.
7. **ShareViewController içeriği:** Xcode'un ürettiği `ShareExtension/ShareViewController.swift`'in TÜM içeriğini repo'daki `ios/App/ShareExtension/ShareViewController.swift` ile değiştir (Target Membership: YALNIZ ShareExtension). Xcode "MainInterface.storyboard" ürettiyse SİL (kod programatik UI kullanıyor).
8. **Extension Info.plist — aktivasyon kuralı + principal class:** ShareExtension/Info.plist'te `NSExtension` sözlüğünü şöyle ayarla:
   - `NSExtensionPointIdentifier` = `com.apple.share-services`
   - `NSExtensionPrincipalClass` = `$(PRODUCT_MODULE_NAME).ShareViewController` (storyboard SİLİNDİĞİ için `NSExtensionMainStoryboard` anahtarı OLMAMALI)
   - `NSExtensionAttributes > NSExtensionActivationRule` — görsel+video+dosya+URL kabul (aşağıdaki dict).
   ```xml
   <key>NSExtension</key>
   <dict>
     <key>NSExtensionPointIdentifier</key>
     <string>com.apple.share-services</string>
     <key>NSExtensionPrincipalClass</key>
     <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
     <key>NSExtensionAttributes</key>
     <dict>
       <key>NSExtensionActivationRule</key>
       <dict>
         <key>NSExtensionActivationSupportsImageWithMaxCount</key><integer>20</integer>
         <key>NSExtensionActivationSupportsMovieWithMaxCount</key><integer>10</integer>
         <key>NSExtensionActivationSupportsFileWithMaxCount</key><integer>20</integer>
         <key>NSExtensionActivationSupportsWebURLWithMaxCount</key><integer>1</integer>
       </dict>
     </dict>
   </dict>
   ```
   > Android'de saf metin (text/plain) manifest'e kayıtlı DEĞİL — burada da ayrı `SupportsText` eklenmedi (dosya/URL eşliğindeki metin yine işlenir). İstersen `NSExtensionActivationSupportsText`=`true` eklenebilir.
9. **Derle:** Şema **App** + gerçek iPhone → `⌘B`. Hata çıkarsa mesajı yolla.
10. **Doğrula (git-senkron riski):** `capacitor.config.json` packageClassList'te `"ShareTargetPlugin"`; ana Info.plist'te `CFBundleURLTypes`/`uzaktansantiye`.
11. **⇧⌘K → Cmd+R.**
12. **Commit (Mac'ten):** pbxproj + ShareExtension/ + entitlements (iki target App Group) + Info.plist değişiklikleri.

> ⚠️ Her `npx cap sync ios` sonrası packageClassList'te `ShareTargetPlugin`+diğer local plugin'ler durmalı; sync extension target'ına DOKUNMAZ.

## Test matrisi (gerçek iPhone)
| # | Senaryo | Beklenen |
|---|---|---|
| 1 | Fotoğraflar > bir foto > Paylaş > **Uzaktan Şantiye** | App açılır → "Sohbete paylaş" → sohbet seç → foto sohbete düşer |
| 2 | Dosyalar'dan PDF paylaş | Aynı akış; sohbette dosya olarak görünür |
| 3 | Birden çok foto seç > paylaş | Hepsi tek sohbete gider |
| 4 | 25MB üstü video paylaş | "N dosya gönderilemedi (25MB…)" uyarısı; küçükler gider |
| 5 | App AÇIKKEN paylaş (warm) | Otomatik /paylas'a geçer (shareReceived) |
| 6 | Paylaşım ekranında **İptal** | Sohbete döner; pending temizlenir |
| 7 | Safari'de sayfa > Paylaş | URL metin olarak sohbete gider |
| 8 | Kendi ChatMediaViewer > Paylaş > kendi app | Aynı akış (dış paylaşımın tersi) |
| 9 | **Android regresyon** | Değişmedi (web `isNativeShare` iOS eklendi, android dalı aynı) |

Debug: paylaşım sonrası app açılmıyorsa → App Group id İKİ target'ta aynı mı + URL scheme `uzaktansantiye` ana Info.plist'te mi. Container yazılıyor ama app açılmıyorsa openURL sorunudur → app'i elle aç, paylaşım yine yakalanmalı (didBecomeActive).

İlişki: [[00-native-roadmap.md]] Faz 5 · Android referans `android/.../ShareTargetPlugin.java` + AndroidManifest ACTION_SEND · Önceki [[05-biometrik-kilit.md]].
