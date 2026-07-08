# 07 — Full App Test Planı (APK build sonrası)

> İmzalı AAB/APK build ettikten sonra bu listeyi baştan sona uygula. Kritik olanlar 🔴. Farklı Android sürümlerinde (12–16) + mümkünse 1 eski cihaz + 1 tablette tekrarla.

## 0. Build & kurulum
- [ ] 🔴 `bundleRelease` **hatasız** derlendi (manifest'ten izin/servis kaldırma + yeni ikon/meta-data sonrası) → `docs/play-release/01`
- [ ] 🔴 İmzalı AAB üretildi (`app-release.aab`), `key.properties` ile
- [ ] APK cihaza kuruldu, **çökme yok** (crash-free launch)
- [ ] 🔴 **Uygulama ikonu = meşale alevi** (navy zemin), mavi X değil
- [ ] Splash ekranı düzgün (#1a1a2e)

## 1. Kimlik (Auth) 🔴
- [ ] Doğru kullanıcı/şifre → giriş başarılı
- [ ] Yanlış şifre → "hatalı" mesajı, giriş yok
- [ ] Devre dışı hesap → "Hesabınız devre dışı" 401
- [ ] Çıkış (logout) → login'e döner
- [ ] Uygulamayı **tamamen kapat-aç** → oturum korunuyor (tekrar login istemiyor)

## 2. Runtime izinler (Android 13+) 🔴
> Yeni/temiz cihazda **ilk kez** dene (izin daha önce verilmemiş olmalı).
- [ ] 🔴 İlk açılışta **bildirim izni** diyaloğu çıkıyor (POST_NOTIFICATIONS)
- [ ] 🔴 İlk kez **kamera** aç (foto çek / görüntülü arama) → OS izin diyaloğu çıkıyor mu? *(Çıkmıyorsa bildir — düzeltme gerekir)*
- [ ] 🔴 İlk kez **mikrofon** (sesli mesaj / arama) → izin diyaloğu çıkıyor mu?
- [ ] İzni **reddet** → uygulama çökmüyor, anlamlı mesaj/davranış (kilitlenme yok)
- [ ] Reddettikten sonra tekrar dene → yeniden izin isteyebiliyor

## 3. Bildirimler (FCM) 🔴
- [ ] 🔴 Push geliyor: **ön planda**, **arka planda**, **kilitli ekranda**
- [ ] 🔴 Bildirim ikonu = **beyaz alev silueti** (gri kare değil)
- [ ] Bildirime tıkla → doğru sayfaya gidiyor
- [ ] **Sohbet bildirimi**: mesaj önizlemesi + "Yanıtla" (direkt yanıt) + "Okundu yap"
- [ ] Uygulama açıkken aynı sohbetteyken bildirim bastırılıyor (çift bildirim yok)

## 4. Sohbet & Arama 🔴
- [ ] Metin mesajı gönder/al (gerçek zamanlı)
- [ ] Medya: **foto, video, dosya** gönder + görüntüle
- [ ] **Sesli mesaj** kaydet + dinle (süre doğru, oynatıcı modern)
- [ ] **Kamera** butonu (telefon: native kamera; foto çek → gönder)
- [ ] 🔴 **Sesli arama** (Android native motor): ara → karşı taraf **çalıyor** (gelen çalan ekran), **kabul/reddet**, ses gidip geliyor, ahize/hoparlör
- [ ] 🔴 **Görüntülü arama**: video açılıyor, **PiP** (ana ekrana çıkınca küçülüyor), kamera değiştir
- [ ] 🔴 **Ekran paylaşımı**: başlat → karşı taraf görüyor, durdur
- [ ] Kilitli ekranda gelen arama → tam ekran çalan ekran, kabul edince PIN istemeden açılıyor
- [ ] **Geri-gesture**: sohbet açıkken geri → sohbet listesine döner (uygulamadan çıkmaz)

## 5. Şantiye / İş takibi
- [ ] Şantiyeler listesi → şantiye detay
- [ ] Kaba/Bina Genel/İnce inşaat kategorileri, **Önizle** (ev kesiti görseli — kat isimleri tavanda, Bina Genel'de çatı)
- [ ] Foto/video ekle → tam ekran popup + medya görüntüleyici (kaydır/zoom)
- [ ] Metraj ekle/düzenle

## 6. Modüller (mobil)
- [ ] **Satış** sayfası açılıyor, işlemler
- [ ] **Depo**: liste (kartlar), filtre dropdown, malzeme ekle (tam ekran + medya), düzenle/sil, indirme
- [ ] **Teslimat**: kartlar, ekle (tam ekran), detay tablosu, indirme
- [ ] **Personel**: şantiye seç → liste → **Personel Ekle / Düzenle tam ekran** (safe-top)
- [ ] **Arıza Takip**: liste → **Detay** (tam ekran) → **Fotoğrafları gör**
- [ ] **Not Defteri**: not oluştur, **sesli kayıt** (süre doğru), **foto ekle** (boyutlandır + yana yazı/float), **foto sil** (X), not sil

## 7. Hesap Yönetimi & silme 🔴 (Play zorunlu)
- [ ] 🔴 **Menü → Hesap Yönetimi** görünüyor (hem admin hem **admin-olmayan** kullanıcıda)
- [ ] Masaüstünde düzgün (yan yana kartlar), mobilde alt alta
- [ ] 🔴 **Hesabımı Sil** → uyarı + parola → "Kalıcı Olarak Sil" → **login'e atıyor**, tekrar giriş yapılamıyor
- [ ] Yanlış parolayla silme → "Parola hatalı"
- [ ] Silindikten sonra **başka kullanıcıda**: silinen kişinin eski mesajları **"Silinmiş Kullanıcı"** görünüyor
- [ ] Silinen kullanıcının **notları gitti** (test hesabıyla dene — geri alınamaz!)

## 8. Public sayfalar (Play zorunlu) 🔴
- [ ] 🔴 `https://uzaktansantiye.com/hesap-sil` **login olmadan** açılıyor
- [ ] 🔴 `https://uzaktansantiye.com/gizlilik` login'siz açılıyor + **Türkçe/English geçişi** çalışıyor
- [ ] Sayfalarda "Managed Google Play" ibaresi **yok** + doğru şirket adı/e-posta

## 9. Navigasyon & geri
- [ ] 🔴 **Sol-kenar geri-gesture**: her adımda **bir önceki sayfa** (ana sayfaya atmıyor)
- [ ] Modal/menü açıkken geri → önce onu kapatıyor (sayfa değişmiyor)
- [ ] Ana sayfadayken geri → uygulamadan çıkıyor
- [ ] Alt sekmeler (Ana Sayfa/Satış/Sohbet/Menü) + menü öğeleri

## 10. Ağ & dayanıklılık
- [ ] **Offline** (uçak modu) → üst bant "çevrimdışı"
- [ ] Tekrar **online** → otomatik yeniden bağlanma, bant kayboluyor
- [ ] Zayıf/kesintili bağlantıda çökme yok

## 11. Cihaz çeşitliliği
- [ ] Android **12 / 13 / 14 / 15 / 16** cihazlarda açılış + temel akışlar
- [ ] 🔴 **Edge-to-edge** (Android 15/16): içerik status bar/navigasyon çubuğu altına girmiyor (safe-area doğru)
- [ ] Tablet görünümü (2 panel sohbet vb.)
- [ ] Eski/düşük cihaz (minSdk 24 = Android 7) — açılış
- [ ] Büyük font / erişilebilirlik ayarı

## 12. Güncelleme
- [ ] versionCode artırıp yeni AAB → mevcut kurulumun **üstüne güncelleme** (veri kaybı yok)

---

### Regresyon uyarısı (bu sürümdeki native değişiklikler)
- [ ] 🔴 `MANAGE_OWN_CALLS` + `FOREGROUND_SERVICE_MICROPHONE` + `MicCallService` **kaldırıldı** → **aramaların hâlâ çalıştığını** doğrula (bunları kullanmıyordu, ama build sonrası teyit et).
- [ ] Yeni ikon/meta-data sonrası build temiz + notification ikonu görünüyor.
