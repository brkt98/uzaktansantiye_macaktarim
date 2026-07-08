# 01 — İmzalama (Signing) & Build

## 1. Keystore (upload key) üretimi — bir kez

`android/app/` dizininde:

```bash
keytool -genkeypair -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

- Komut **storePassword**, **keyPassword** ve isim/kurum bilgilerini soracak. Güçlü parolalar gir.
- ⚠️ **Bu `.jks` dosyasını ve parolalarını KAYBETME.** Play App Signing kullanıyorsan upload key kaybı Play Console'dan reset edilebilir; etmiyorsan kayıp = bir daha güncelleme yayınlayamazsın.
- `.jks` `.gitignore`'da (`*.jks`) — repoya girmez. Güvenli bir yerde (parola yöneticisi / şifreli yedek) sakla.

## 2. `key.properties` oluştur

`android/key.properties.example`'ı `android/key.properties` adıyla kopyala, gerçek değerleri gir:

```properties
storeFile=upload-keystore.jks
storePassword=<keystore parolası>
keyAlias=upload
keyPassword=<anahtar parolası>
```

- `storeFile` yolu `android/app/`'a görelidir (`file()`), yani `upload-keystore.jks` → `android/app/upload-keystore.jks`.
- `key.properties` `.gitignore`'da — **commit edilmez**. CI kullanırsan secret olarak sakla.

## 3. Build.gradle nasıl çalışıyor (zaten ayarlandı)

`android/app/build.gradle`:
- Üstte `../key.properties` okunur (yoksa boş).
- `signingConfigs.release` değerleri oradan gelir (hiçbir sır koda gömülü DEĞİL).
- `release` buildType: `key.properties` varsa **upload key** ile imzalar; yoksa **debug** anahtarına düşer (yalnızca yerel test; **Play'e yüklenmez**).

## 4. Web tarafını senkronla

Capacitor remote-URL: web `https://uzaktansantiye.com`'dan yüklenir, ama native kabuk + pluginler `cap sync` ile güncellenir:

```bash
npx cap sync android
```

## 5. Release AAB üret

**Windows (PowerShell):**
```powershell
npx cap sync android
cd android
.\gradlew.bat bundleRelease
```

**macOS / Linux:**
```bash
npx cap sync android
cd android
./gradlew bundleRelease
```

### AAB çıktı yolu
```
android/app/build/outputs/bundle/release/app-release.aab
```
→ Play Console'a yüklenecek dosya budur.

### (Opsiyonel) yerel test için imzalı APK
```bash
cd android
./gradlew assembleRelease      # macOS/Linux
.\gradlew.bat assembleRelease  # Windows
# çıktı: android/app/build/outputs/apk/release/app-release.apk
```
> Play'e **AAB** yüklenir; APK yalnızca cihaza elle kurup test için.

### İmzayı doğrula
```bash
# AAB içindeki imza:
keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab
# veya bundletool ile APKS üretip APK imzasını kontrol et
```

## 6. Play App Signing (önerilen)

- Play Console'da uygulama oluştururken **Play App Signing** etkin gelir (önerilen).
- Sen **upload key** ile imzalarsın; Google yeniden imzalayıp dağıtım anahtarıyla yayınlar.
- Avantaj: upload key kaybı reset edilebilir.
- Bu durumda yukarıdaki keystore = **upload key**.

## 7. minifyEnabled = false (bilinçli)

- LiveKit/WebRTC native `.so` + reflection ağırlıklı olduğundan R8/minify **kapalı** bırakıldı — en az riskli. Play minify zorunlu kılmaz.
- İleride açılırsa LiveKit + Capacitor için ProGuard kuralları gerekir; şimdilik dokunma.

## 8. Sürüm yönetimi (her release)

- `versionCode` Play'de benzersiz olmalı — **her yüklemede +1** (`build.gradle` defaultConfig).
- `versionName` kullanıcıya görünen sürüm ("1.0.0", "1.0.1", ...).
- İlk release: `versionCode 1`, `versionName "1.0.0"` (zaten ayarlı).
