# Push Bildirim Kurulumu (Faz 2)

## ✅ Ben (kod tarafı) hallettim
- Prisma `DeviceToken` modeli + client üretimi
- API: `/api/push/register`, `/api/push/unregister`, `/api/push/test`
- `src/lib/push.ts` — FCM (firebase-admin), **iki kimlik yöntemi** destekli, env yoksa sessizce no-op
- `NativeBridge.tsx` — izin ister, token kaydeder/senkronlar, bildirime tıklayınca yönlendirir
- **Android Gradle:** google-services zaten Capacitor tarafından **koşullu** bağlı (`json` yoksa build kırılmaz, gelince otomatik aktif)
- **docker-compose:** `FIREBASE_*` değişken geçişi eklendi
- camera + filesystem + push eklentileri native projelere sync edildi

> Bu haliyle her şey güvenli: APK'yı build edersin, app çalışır; push sadece aşağıdaki 4 adım bitince teslim eder.

---

## 🙋 Senin yapman gerekenler (sadece bunlar — Firebase hesabınla)

### 1. Firebase projesi + Android app (~5 dk)
1. console.firebase.google.com → proje oluştur
2. **Android app ekle** → paket adı: `com.mesalegrup.uzaktansantiye`
3. **`google-services.json`** indir → **`android/app/`** klasörüne koy
   - 💡 İstersen dosyanın içeriğini bana yapıştır, ben koyayım (bu dosya istemci yapılandırmasıdır, çok gizli değildir)

### 2. Service account — backend kimliği (~2 dk)
1. Firebase Console → ⚙️ Project Settings → **Service accounts** → "Generate new private key" → bir JSON iner
2. ⚠️ Bu JSON **gizlidir** — repoya/koda KOYMA. Sunucunda `JWT_SECRET`'in bulunduğu env dosyasına **tek satır** ekle:
   ```
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...", ...JSON'un tamamı tek satır...}
   ```
   (JSON'u tek satıra sığdır; `private_key` içindeki `\n`'ler olduğu gibi kalsın. docker-compose bu değişkeni zaten container'a aktarıyor.)

### 3. Veritabanı tablosu (~1 dk)
Prod DB'ye `device_tokens` tablosunu ekle (şema değişikliğini normalde nasıl uyguluyorsan öyle):
```
npm run db:push
```

### 4. Yeniden yayınla
- Backend'i yeniden deploy et (yeni kod + env)
- APK'yı Android Studio'da yeniden build et (artık `google-services.json` var → push aktif)

---

## ✅ Test (uçtan uca)
1. Telefonda **yeni** APK + giriş yapılmış + bildirim izni verilmiş
2. Giriş yapmış oturumla `POST /api/push/test` çağır
3. Telefona **"Test bildirimi"** düşmeli 🎉

## iOS (sonra, Mac/build aşamasında)
- Firebase'e iOS app ekle → `GoogleService-Info.plist` → `ios/App/App/`
- Apple Developer → **APNs Auth Key (.p8)** oluştur → Firebase'e yükle
- Xcode → Signing & Capabilities → **Push Notifications** + **Background Modes (Remote notifications)**

## Sıradaki
**Faz 3 (chat)** bağlanınca yeni mesajda `sendPushToUser()` çağrılacak → offline kullanıcıya otomatik push. Push'un ilk gerçek tetikleyicisi bu olacak.
