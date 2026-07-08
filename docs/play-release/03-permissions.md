# 03 — İzin (Permission) Analizi & Policy Riskleri

`android/app/src/main/AndroidManifest.xml` içindeki tüm izinler. Core = uygulamanın çekirdek işlevi için şart mı.

| İzin | Core? | Neden gerekli | Runtime akışı | Policy riski / Aksiyon |
|---|:---:|---|---|---|
| `INTERNET` | ✓ | Remote-URL WebView + API | — | Yok. **Tut** |
| `RECORD_AUDIO` | ✓ | Sesli mesaj + sesli/görüntülü arama (getUserMedia) | ⚠️ WebView ilk kullanımda OS izin diyalogu tetiklenmeyebilir → sessiz başarısızlık | Orta. **Tut**; runtime izin akışı ekle (aşağıda) |
| `CAMERA` | ✓ | Foto/video çekme + görüntülü arama | ⚠️ İlk açılışta OS diyalogu çıkmayabilir, `CameraDialog` "açılamadı" der | **Yüksek (UX)**. **Tut**; runtime istek akışı **EKLE** |
| `MODIFY_AUDIO_SETTINGS` | ✓ | Arama ses yönlendirme (hoparlör/kulaklık) | — | Yok. **Tut** |
| `USE_BIOMETRIC` | ✓ | Biyometrik uygulama kilidi (cihaz-içi) | BiometricPrompt | Yok. **Tut** |
| `POST_NOTIFICATIONS` | ✓ | FCM bildirimleri (Android 13+) | ✓ Var — `NativeBridge` `requestPermissions` (iyi örnek) | Yok. **Tut** |
| `USE_FULL_SCREEN_INTENT` | ✓ | Kilit ekranı üstünde gelen arama çalan ekranı | — | **Orta** — Android 14+ kısıtlı (yalnız calling/alarm). **Play Console declaration doldur** (VoIP gerekçesi) |
| `FOREGROUND_SERVICE` | ✓ | `CallForegroundService` (arama çalma) | — | Düşük. **Tut** |
| `FOREGROUND_SERVICE_PHONE_CALL` | ✓ | phoneCall FGS (gelen arama) | — | **Orta** — Android 14+ **Play Console FGS declaration** ister |
| `FOREGROUND_SERVICE_MICROPHONE` | ✗ | Faz B native arama mikrofon FGS | Kod **atıl** (`startMicService()` yorumda) | **Orta** — kullanılmayan FGS yüzeyi. Faz B planı yoksa `MicCallService` ile **kaldırmayı değerlendir** (ürün kararı) |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` | ✓ | LiveKit ekran paylaşımı | Kullanıcı-başlatımlı | **Orta** — en sıkı incelenen FGS tipi. **Play Console declaration doldur** |
| `VIBRATE` | ✓ | Çalan ekran titreşimi + haptics | — | Yok. **Tut** |
| `MANAGE_OWN_CALLS` | ✗ | (Self-managed VoIP için) | Kod'da **Telecom/ConnectionService YOK** → atıl | **Düşük** — `CallStyle` bunu gerektirmez. phoneCall FGS + MANAGE_OWN_CALLS beyan edip ConnectionService kullanmamak inceleme tutarsızlığı. Self-managed VoIP planlanmıyorsa **kaldırmayı değerlendir** (ürün kararı) |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | ✓ | Arka planda data-only FCM (mesaj/arama) tesliminin güvenilirliği — kullanıcıya sistem muafiyet diyaloğu gösterilir (bir kez) | BatteryOptPlugin + NativeBridge | **Orta** — Google bu izni "core işlevi bildirime dayalı" uygulamalarda kabul eder (kurumsal mesajlaşma/arama = geçerli gerekçe). İncelemede sorulursa: "gerçek-zamanlı kurumsal iletişim (mesaj + VoIP arama) bildirimleri gecikmeden ulaşmalı". Private dağıtımda düşük risk. **Tut** |
| `uses-feature camera/microphone (required=false)` | ✓ | Cihazda yoksa da kurulabilsin | — | Yok — **doğru yaklaşım**. Tut |

## Eylem gerektirenler

### 1. CAMERA / RECORD_AUDIO runtime izin akışı (ÖNERİ — onay/uygulama bekliyor)
- **Sorun:** `CameraDialog.tsx` ve `AudioRecorder.tsx` doğrudan `getUserMedia` çağırıyor. Capacitor WebView, WebRTC iznini ancak **OS izni zaten verilmişse** auto-grant eder. İlk kullanımda OS diyalogu hiç çıkmadan "açılamadı" hatası olabilir.
- **Çözüm:** getUserMedia'dan ÖNCE `@capacitor/camera` `Camera.requestPermissions()` (kamera) ve mikrofon için native runtime istek akışı (POST_NOTIFICATIONS pattern'i örnek). 
- **Durum:** Sende test gerekli — gerçek cihazda ilk kez kamera/mikrofon açınca izin diyalogu çıkıyor mu? Çıkmıyorsa bu akışı eklerim.

### 2. Atıl izin temizliği (ÜRÜN KARARI — [06](06-open-questions.md) Soru 9)
- `MANAGE_OWN_CALLS` + `FOREGROUND_SERVICE_MICROPHONE` (+ `MicCallService`) şu an kodda fonksiyonel kullanılmıyor.
- **Faz B'de native LiveKit mikrofon FGS planlıyorsan** → kalsın (declaration doldur).
- **Planlamıyorsan** → kaldırmak inceleme yüzeyini azaltır.
- Karar sende; ben kaldırma/tutmayı uygularım.

> Bu izinleri ŞİMDİ kaldırmadım — Faz B native arama planına bağlı, senin kararın.
