# Faz 5a — Biyometrik Kilit (Face ID / Touch ID)

**Amaç:** Uygulama kilidini biyometrikle açma — Android `BiometricPlugin.java` paritesinin iOS eşi + özelliğin İKİ platformda birden kullanıcıya açılması.

## Keşif bulgusu (önemli)
Biyometrik altyapı Android'de yazılmış ama **kullanıcıya hiç açılmamıştı**: `BiometricGate.tsx` hiçbir layout'a mount edilmemiş, `biometric_lock` bayrağını açan ayar UI'ı yoktu (aktif kilit = PinGate/PIN). Bu faz hem iOS Swift eşini ekler hem özelliği **PinGate'e entegre ederek** iki platformda aktive eder. `BiometricGate.tsx` artık kullanılmıyor (ölü kod, dursun).

## Tasarım
- **Bayrak:** `localStorage "app_bio_lock"="1"` (senkron — PIN'le aynı gerekçe; eski Preferences `biometric_lock` anahtarı terk edildi, dormant olduğundan migrasyon gerekmez). Yardımcılar: `pinLock.ts isBioLockOnSync/setBioLockSync`.
- **PinGate** artık PIN **veya** biyometrik açıkken kilitler. Biyometrik açıksa kilit görünür görünmez otomatik prompt; PIN de varsa PinPad fallback (sol-alt hücrede Fingerprint kısayolu — PIN cooldown'ından bağımsız). PIN yoksa basit kilit ekranı ("Kilidi aç" butonu).
- **Ayar:** Sohbet > Profilim > "Biyometrik Kilit" (yalnız native + `biometricStatus() ∈ {ok, no-enroll}`; eski build'de plugin yok → "no-plugin" → bölüm görünmez). Aç/kapat ikisi de önce doğrulama ister.
- **Güvenlik guard'ları:** `biometricAuthenticate` plugin yokken `{success:true}` döner (BiometricGate mirası) → PinGate otomatik denemeden ÖNCE `biometricAvailable()` şartı (false → prompt yok; yalnız-bio modda bayrak kapatılıp kilit açılır = kilitli-kalma önlenir). iOS Face ID iptali sonrası resume tekrar-prompt döngüsü `lastBioEnd` 1.5sn guard'ı ile kesilir.
- **Android kod eşlemesi (Swift):** `biometryNotEnrolled→11, biometryNotAvailable→12, biometryLockout→1, passcodeNotSet→11, diğer→-1`; policy `.deviceOwnerAuthenticationWithBiometrics` (passcode fallback YOK — Android BIOMETRIC_WEAK+DEVICE_CREDENTIAL'sız davranışın birebiri).

## Ben (kod) — YAPILDI
- `ios/App/App/BiometricPlugin.swift` (YENİ, iki mirror) — LocalAuthentication köprüsü.
- `ios/App/App/Info.plist` → `NSFaceIDUsageDescription` (iki mirror).
- `ios/App/App/capacitor.config.json` → packageClassList'e `"BiometricPlugin"` (iki mirror).
- Web (canonical, deploy edildi): `pinLock.ts` bayrak yardımcıları; `PinPad.tsx` `onBiometric` kısayol butonu; `PinGate.tsx` biyometrik entegrasyonu; `ProfileDialog.tsx` ayar bölümü.

## Sen (Mac / Xcode) — SIRAYLA
1. **git pull** (macaktarim).
2. Xcode > sol panelde **App klasörüne sağ tık > "Add Files to 'App'…"** > `BiometricPlugin.swift` seç > **Target: Uzaktan Şantiye** işaretli (dosya git'le diske gelir ama projeye ELLE eklenmeli — LiveKitCallManager'da yaptığının aynısı).
3. **Doğrula (git-senkron riski):** `ios/App/App/capacitor.config.json` packageClassList'te `"BiometricPlugin"` var mı; Info.plist'te `NSFaceIDUsageDescription` var mı. Yoksa elle ekle.
4. **⇧⌘K (Clean) → Cmd+R.**

## Test matrisi
| # | Senaryo | Beklenen |
|---|---|---|
| 1 | Profilim > Biyometrik Kilit > **Aç** | Face ID doğrulaması → "Açık" |
| 2 | Uygulamayı tamamen kapat + aç | Kilit ekranı + OTOMATİK Face ID → başarıda girer |
| 3 | Face ID'yi İPTAL et | Kilit ekranında kalır; "Kilidi aç" (veya PIN pad) ile tekrar |
| 4 | PIN + biyometrik İKİSİ açık | Face ID iptal → PIN girerek de açılır; PinPad sol-altta parmak izi kısayolu |
| 5 | Yanlış PIN cooldown'undayken | Biyometrik kısayol YİNE çalışır (cooldown'dan bağımsız) |
| 6 | Arka plan → dön | Yine kilitler + otomatik sorar |
| 7 | Aramadayken (gelen arama kabul) | Kilit BASTIRILIR (mevcut PinGate davranışı) |
| 8 | **Android regresyon** | Aynı akış parmak iziyle — web deploy YETERLİ (plugin APK'da zaten var, rebuild gerekmez) |
| 9 | Kapat | Face ID doğrulamasıyla "Kapalı" |

Not: Gizlilik beyanı değişmez — biyometrik veri cihazda kalır, toplanmaz (gizlilik sayfası + Store beyanlarıyla uyumlu).

İlişki: [[00-native-roadmap.md]] Faz 5 · Android referans `android/.../BiometricPlugin.java` · Sıradaki: Faz 5b Share Extension (`06` dokümanı gelecek).
