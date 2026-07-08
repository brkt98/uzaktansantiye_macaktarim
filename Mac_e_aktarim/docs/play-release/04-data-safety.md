# 04 — Data Safety Formu Taslağı & Privacy Policy Teknik Başlıkları

> Kod + SDK incelemesinden çıkarıldı. **"Kontrol edilmeli"** işaretli satırları doğrulamadan beyan etme.

## Genel
- **Transit şifreleme:** EVET — her şey HTTPS / WSS / SRTP (LiveKit) / FCM TLS üzerinden.
- **3. tarafla paylaşım:** Yalnızca **FCM push token → Google FCM** (bildirim iletimi için). LiveKit **self-hosted** (`rtc.uzaktansantiye.com`) → bağımsız 3. taraf sayılmaz.
- **Analytics / Crash logs:** YOK (firebase-analytics/crashlytics bağımlılığı yok; yalnızca firebase-messaging).
- **Kritik eksik:** Kullanıcı-tetiklemeli **veri/hesap silme yolu** → [05](05-account-deletion.md). Data Safety'de "kullanıcılar veri silinmesini isteyebilir" diyebilmek için bu ŞART.

## Data Safety tablosu

| Veri türü | Toplanıyor? | Paylaşılıyor? | Amaç | Şifreli (transit)? | Silinebilir? | Eminlik |
|---|:---:|---|---|:---:|---|:---:|
| Ad, soyad | Evet | Hayır | Uygulama işlevi, hesap yönetimi | Evet | Hesap silme eklenince | Yüksek |
| E-posta | Evet | Hayır | Hesap yönetimi | Evet | Eklenince | Yüksek |
| Telefon (opsiyonel) | Evet | Hayır | Hesap yönetimi | Evet | Eklenince | Yüksek |
| Kullanıcı ID | Evet | Hayır | Uygulama işlevi | Evet | Eklenince | Yüksek |
| Parola | Evet (bcrypt hash) | Hayır | Kimlik doğrulama | Evet | Eklenince | Yüksek |
| Uygulama-içi mesajlar (metin + ek) | Evet | FCM push önizlemesi Google altyapısından transit geçer (işleme amaçlı, paylaşım değil) | Uygulama işlevi | Evet (uçtan-uca YOK) | **Kontrol edilmeli** | Yüksek |
| Fotoğraf & video | Evet | Hayır | Uygulama işlevi | Evet | **Kontrol edilmeli** | Yüksek |
| Dosya & belge | Evet | Hayır | Uygulama işlevi | Evet | **Kontrol edilmeli** | Yüksek |
| Ses kayıtları (sesli notlar) | Evet (saklanıyorsa) | Self-hosted whisper transkripsiyon? | Uygulama işlevi | Evet | **Kontrol edilmeli** | Orta |
| Sesli/görüntülü arama içeriği | Real-time iletilir; **Egress kapalıysa kalıcı saklanmaz** | Self-hosted LiveKit | Uygulama işlevi | Evet (SRTP) | **Egress kayıt durumu doğrulanmalı** | Yüksek |
| FCM push token (cihaz ID) | Evet | **Evet — Google FCM** | Bildirimler | Evet | Evet (`/api/push/unregister` var) | Yüksek |
| IP / uygulama etkinliği (AuditLog) | Evet (sunucu) | Hayır | Güvenlik, dolandırıcılık önleme | Evet | **Kontrol edilmeli** | Yüksek |
| Konum | **Hayır** | — | Toplanmıyor (Geolocation izni/SDK yok) | — | — | Yüksek |
| Biyometrik | **Hayır** | — | Yalnızca cihaz-içi auth (veri toplanmıyor) | — | — | Yüksek |

### Doğrulanması gereken açık noktalar → [06](06-open-questions.md)
- **LiveKit Egress** (arama/ekran kaydı) etkin mi? Etkinse → "Ses/Video kayıtları collected = YES".
- **nodejs-whisper** hangi sesleri transkribe ediyor (sesli not mu, arama mı)? Transkript saklanıyorsa ek beyan.

## Privacy Policy — içermesi gereken teknik başlıklar
(Metni sen/hukuk yazacak; teknik kapsam:)
1. **Toplanan veriler** — yukarıdaki tablo özeti (kimlik, iletişim, mesaj/medya, ses-arama, push token, IP).
2. **Kullanım amacı** — kurumsal şantiye takibi, iletişim (sohbet/arama), bildirim, güvenlik/denetim.
3. **Üçüncü parti servisler** — Google FCM (bildirim); self-hosted LiveKit (arama/ekran paylaşımı).
4. **Veri saklama** — sunucuda (Hetzner) ne kadar süre tutulduğu.
5. **Veri silme** — hesap silme yolu + public URL → [05](05-account-deletion.md).
6. **İletişim e-postası** — (örn. cerendastanoglu@gmail.com veya kurumsal destek).
7. **Organizasyon-içi kullanım** — yalnızca yetkili organizasyon kullanıcılarına dağıtım; genel kamuya açık değil.
8. **Şifreleme** — transit HTTPS/WSS/SRTP; parolalar bcrypt.
