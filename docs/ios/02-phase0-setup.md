# iOS Faz 0 — Mac/Xcode/Apple Developer kurulumu (adım adım)

> Bunları **Mac'te** yaparsın. Kod tarafı hazır (Info.plist arka-plan modları + **meşale app ikonu** + splash üretildi). Bittiğinde Faz 1'e (push) geçeriz.

## Ön: projeyi Mac'e getir
- [ ] Repoyu Mac'e çek (git veya kopya). Node kurulu olsun.
- [ ] `npm install`
- [ ] **`npx cap sync ios`** — web + Capacitor plugin'lerini iOS projesine senkronlar (yaptığım Info.plist/ikon değişiklikleri zaten projede)
- [ ] **`npx cap open ios`** — Xcode açılır (`ios/App/App.xcworkspace`)

## A) İmzalama & Bundle ID
- [ ] Xcode → sol panelde **App** target → **Signing & Capabilities**
- [ ] **Team** = Apple Developer hesabın (dropdown'dan seç)
- [ ] **Bundle Identifier** = `com.mesalegrup.uzaktansantiye` (Android'le AYNI olmalı, DEĞİŞTİRME)
- [ ] **Automatically manage signing** işaretli → Xcode App ID'yi + provisioning'i otomatik kurar
- [ ] General → **Deployment**: iPhone **ve iPad** işaretli (Universal — iPad desteği), Minimum iOS ~14+

## B) Sürüm
- [ ] General → **Version** = `1.0.0`, **Build** = `1` (Android versionName/versionCode ile hizalı; her yüklemede Build +1)

## C) Capabilities ekle (+ Capability)
- [ ] **Push Notifications**
- [ ] **Background Modes** → şunları işaretle: **Remote notifications**, **Voice over IP**, **Audio, AirPlay, and Picture in Picture** (Info.plist'te zaten bildirildi; Xcode UI'ında da işaretle)
- [ ] (Sonraki fazlar için şimdilik gerekmez: App Groups, Broadcast Extension — Faz 4'te)

## D) APNs Authentication Key (.p8) — Apple Developer
- [ ] https://developer.apple.com/account → **Certificates, Identifiers & Profiles → Keys → +**
- [ ] **Apple Push Notifications service (APNs)** işaretle → oluştur → **.p8 dosyasını indir** (bir kez indirilir, sakla)
- [ ] **Key ID** ve (sağ üstteki) **Team ID**'yi not al

## E) Firebase (iOS uygulaması) — FCM için
- [ ] https://console.firebase.google.com → mevcut **`uzaktan-santiye`** projesi → ⚙️ → **Add app → iOS**
- [ ] **Apple bundle ID** = `com.mesalegrup.uzaktansantiye` → kaydet
- [ ] **`GoogleService-Info.plist` indir**
- [ ] Xcode'da bu dosyayı **`App/` klasörüne sürükle** → "Copy items if needed" + **App target'ına dahil et** işaretli
- [ ] Firebase → Project Settings → **Cloud Messaging** → **APNs Authentication Key** bölümüne D adımındaki **.p8 + Key ID + Team ID** yükle

## F) İkon & splash doğrula
- [ ] Xcode → Assets.xcassets → **AppIcon** = meşale (navy zemin) görünüyor ✓ (ben ürettim)
- [ ] Splash (LaunchScreen) navy + alev ✓

## G) İlk build (native temel çalışıyor mu)
- [ ] **Gerçek bir iPhone** bağla (push simülatörde sınırlı) → target olarak seç
- [ ] **⌘R** (Run) → uygulama açılıyor mu, `uzaktansantiye.com` yükleniyor mu, login/temel akış çalışıyor mu?
- [ ] Kamera/mikrofon/galeri ilk kullanımda izin diyaloğu çıkıyor mu?

> Bu noktada: uygulama iOS'ta **çalışıyor** ama henüz push YOK (Firebase SDK + AppDelegate kodu Faz 1'de eklenecek).

## ✅ Faz 0 bitti sinyali
- [ ] Xcode'da imzalama yeşil, uygulama gerçek cihazda açılıp `uzaktansantiye.com`'u yüklüyor
- [ ] GoogleService-Info.plist projede, APNs key Firebase'e yüklü
- [ ] Meşale ikonu + splash görünüyor

**Sonra:** Faz 1 → [01-push-notifications.md](01-push-notifications.md). Firebase SDK'yı (SPM) ekleyip AppDelegate push kodunu birlikte finalize edeceğiz. Faz 0'daki bir adımda takılırsan (imzalama hatası, provisioning, Firebase) ekran görüntüsü/hata metniyle bana gel.
