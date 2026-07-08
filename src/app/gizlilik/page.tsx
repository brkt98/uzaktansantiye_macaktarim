"use client";

import { useState } from "react";

/**
 * Public Gizlilik Politikası / Privacy Policy (login gerektirmez) — Google Play zorunlu.
 * Tek URL, iki dilli (TR/EN geçişli): https://uzaktansantiye.com/gizlilik
 *
 * NOT: Aşağıdaki APP/COMPANY/EMAIL/UPDATED değerlerini gerçek bilgilerle güncelle.
 */
const APP = "Uzaktan Şantiye";
const COMPANY = "Meşale Grup A.Ş.";
const EMAIL = "muhasebe@mesalegrup.com";
const UPDATED_TR = "3 Temmuz 2026";
const UPDATED_EN = "July 3, 2026";

export default function GizlilikPage() {
  const [lang, setLang] = useState<"tr" | "en">("tr");

  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      <div className="max-w-2xl mx-auto px-5 py-10">
        {/* Dil geçişi */}
        <div className="flex justify-end mb-4">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm font-semibold">
            <button
              onClick={() => setLang("tr")}
              className={lang === "tr" ? "px-3 py-1.5 bg-[#1e3a5f] text-white" : "px-3 py-1.5 bg-white text-gray-600 hover:bg-gray-100"}
            >
              Türkçe
            </button>
            <button
              onClick={() => setLang("en")}
              className={lang === "en" ? "px-3 py-1.5 bg-[#1e3a5f] text-white" : "px-3 py-1.5 bg-white text-gray-600 hover:bg-gray-100"}
            >
              English
            </button>
          </div>
        </div>

        {lang === "tr" ? <Turkce /> : <English />}
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-2 mt-5">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="text-sm text-gray-700 space-y-2">{children}</div>
    </section>
  );
}

/* ---------------- TÜRKÇE ---------------- */
function Turkce() {
  return (
    <>
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Gizlilik Politikası</h1>
        <p className="text-sm text-gray-500 mt-1">{APP} · {COMPANY} — Son güncelleme: {UPDATED_TR}</p>
      </header>

      <Card title="1. Genel Bakış">
        <p>
          {APP} uygulaması ({COMPANY} tarafından işletilir), kurumsal şantiye takibi ve ekip içi iletişim için
          geliştirilmiştir. Uygulama <strong>yalnızca yetkili organizasyon kullanıcılarına özeldir</strong> (özel/kapalı
          dağıtım); genel kamuya açık değildir ve halka açık kayıt (self-signup) yoktur. Hesaplar organizasyon
          yöneticileri tarafından oluşturulur.
        </p>
      </Card>

      <Card title="2. Topladığımız Veriler">
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Kimlik ve iletişim:</strong> ad, soyad, kullanıcı adı, e-posta, telefon (opsiyonel), profil fotoğrafı.</li>
          <li><strong>Kimlik doğrulama:</strong> parola (yalnızca şifrelenmiş/bcrypt olarak saklanır).</li>
          <li><strong>İçerik:</strong> sohbet mesajları ve ekleri (fotoğraf, video, dosya, sesli mesaj), sesli notlar, şantiye kayıtları, notlar.</li>
          <li><strong>Sesli/görüntülü arama ve ekran paylaşımı:</strong> gerçek zamanlı iletilir.</li>
          <li><strong>Teknik:</strong> bildirim için cihaz push jetonu (FCM), güvenlik/denetim için IP adresi ve işlem (denetim) kayıtları.</li>
        </ul>
      </Card>

      <Card title="3. Toplamadığımız Veriler">
        <p>Aşağıdaki verileri <strong>toplamıyoruz</strong>: konum, biyometrik veri, rehber/kişiler, SMS, arama kayıtları, reklam kimliği, analitik veya çökme (crash) verileri.</p>
      </Card>

      <Card title="4. Verileri Nasıl Kullanırız">
        <ul className="list-disc ml-5 space-y-1">
          <li>Şantiye takibi ve kurumsal iş süreçlerinin yürütülmesi.</li>
          <li>Uygulama içi iletişim (sohbet, sesli/görüntülü arama, ekran paylaşımı).</li>
          <li>Bildirim gönderimi.</li>
          <li>Güvenlik, kötüye kullanım önleme ve denetim.</li>
        </ul>
        <p>Verilerinizi <strong>reklam amacıyla kullanmayız</strong> ve <strong>satmayız</strong>.</p>
      </Card>

      <Card title="5. Üçüncü Taraf Servisler">
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Google Firebase Cloud Messaging (FCM):</strong> yalnızca push bildirimi iletmek için; cihaz push jetonunuz Google altyapısında işlenir.</li>
          <li><strong>LiveKit (kendi sunucumuzda barındırılan):</strong> sesli/görüntülü arama ve ekran paylaşımı; bağımsız bir üçüncü tarafa aktarım değildir.</li>
        </ul>
      </Card>

      <Card title="6. Veri Güvenliği">
        <p>
          Tüm veri aktarımı şifrelidir (HTTPS / WSS / SRTP). Parolalar geri döndürülemez şekilde (bcrypt) saklanır.
          Erişim yalnızca yetkili organizasyon kullanıcılarıyla sınırlıdır.
        </p>
      </Card>

      <Card title="7. Veri Saklama">
        <p>
          Verileriniz, hesabınız etkin olduğu ve iş gereksinimi devam ettiği sürece sunucularımızda saklanır. Hesap
          silme işleminde kişisel verileriniz silinir veya anonimleştirilir (bkz. Madde 8).
        </p>
      </Card>

      <Card title="8. Hesap ve Veri Silme">
        <p>Hesabınızı ve verilerinizi dilediğiniz zaman silebilirsiniz:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Uygulama içinden:</strong> Menü → Ayarlar → “Hesabımı Sil” (parola ile onay).</li>
          <li><strong>Giriş yapamıyorsanız:</strong> <a href="/hesap-sil" className="text-[#1e3a5f] font-semibold underline">uzaktansantiye.com/hesap-sil</a> sayfasındaki talimatlar veya <a href={`mailto:${EMAIL}`} className="text-[#1e3a5f] font-semibold underline">{EMAIL}</a> adresine talep.</li>
        </ul>
        <p>
          Silme işleminde; kişisel notlarınız, bildirimleriniz, profil bilgileriniz ve yüklediğiniz kişisel medya
          dosyaları <strong>kalıcı olarak silinir</strong>. Başkalarının da gördüğü ortak içerikte (mesaj/kayıt) adınız
          <em> “Silinmiş Kullanıcı”</em> olarak anonimleştirilir. Bu işlem geri alınamaz.
        </p>
      </Card>

      <Card title="9. Çocuklar">
        <p>Uygulama çocuklara yönelik değildir; yalnızca yetişkin/kurumsal kullanıcılar içindir.</p>
      </Card>

      <Card title="10. Değişiklikler">
        <p>Bu politikayı zaman zaman güncelleyebiliriz. Güncel sürüm bu sayfada yayınlanır; en son güncelleme tarihi yukarıda belirtilmiştir.</p>
      </Card>

      <Card title="11. İletişim">
        <p>Sorularınız için: <a href={`mailto:${EMAIL}`} className="text-[#1e3a5f] font-semibold underline">{EMAIL}</a> ({COMPANY}).</p>
      </Card>

      <p className="text-xs text-gray-400 text-center mt-8">© {COMPANY} — {APP}. Yalnızca yetkili organizasyon kullanıcılarına özeldir.</p>
    </>
  );
}

/* ---------------- ENGLISH ---------------- */
function English() {
  return (
    <>
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mt-1">{APP} · {COMPANY} — Last updated: {UPDATED_EN}</p>
      </header>

      <Card title="1. Overview">
        <p>
          {APP} (operated by {COMPANY}) is a business application for construction-site management and internal team
          communication. The app is <strong>exclusively for authorized members of our organization</strong> (private
          distribution); it is not available to the general public and there is no public sign-up. Accounts are created
          by organization administrators.
        </p>
      </Card>

      <Card title="2. Data We Collect">
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Identity & contact:</strong> first/last name, username, email, phone (optional), profile photo.</li>
          <li><strong>Authentication:</strong> password (stored only in hashed/bcrypt form).</li>
          <li><strong>Content:</strong> chat messages and attachments (photos, videos, files, voice messages), voice notes, site records, notes.</li>
          <li><strong>Voice/video calls and screen sharing:</strong> transmitted in real time.</li>
          <li><strong>Technical:</strong> device push token (FCM) for notifications; IP address and activity (audit) logs for security.</li>
        </ul>
      </Card>

      <Card title="3. Data We Do NOT Collect">
        <p>We do <strong>not</strong> collect: location, biometric data, contacts, SMS, call logs, advertising ID, analytics, or crash data.</p>
      </Card>

      <Card title="4. How We Use Data">
        <ul className="list-disc ml-5 space-y-1">
          <li>Construction-site tracking and internal business operations.</li>
          <li>In-app communication (chat, voice/video calls, screen sharing).</li>
          <li>Sending notifications.</li>
          <li>Security, abuse prevention, and auditing.</li>
        </ul>
        <p>We do <strong>not use your data for advertising</strong> and we do <strong>not sell it</strong>.</p>
      </Card>

      <Card title="5. Third-Party Services">
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Google Firebase Cloud Messaging (FCM):</strong> used only to deliver push notifications; your device push token is processed by Google&apos;s infrastructure.</li>
          <li><strong>LiveKit (self-hosted on our own server):</strong> voice/video calls and screen sharing; not a transfer to an independent third party.</li>
        </ul>
      </Card>

      <Card title="6. Data Security">
        <p>
          All data is transmitted encrypted (HTTPS / WSS / SRTP). Passwords are stored irreversibly (bcrypt). Access is
          restricted to authorized organization users only.
        </p>
      </Card>

      <Card title="7. Data Retention">
        <p>
          Your data is stored on our servers while your account is active and business needs require it. Upon account
          deletion, your personal data is deleted or anonymized (see Section 8).
        </p>
      </Card>

      <Card title="8. Account & Data Deletion">
        <p>You can delete your account and data at any time:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>In the app:</strong> Menu → Settings → “Delete My Account” (confirmed with your password).</li>
          <li><strong>If you cannot sign in:</strong> follow the instructions at <a href="/hesap-sil" className="text-[#1e3a5f] font-semibold underline">uzaktansantiye.com/hesap-sil</a>, or email <a href={`mailto:${EMAIL}`} className="text-[#1e3a5f] font-semibold underline">{EMAIL}</a>.</li>
        </ul>
        <p>
          Upon deletion, your personal notes, notifications, profile information, and personal media files are
          <strong> permanently deleted</strong>. In shared content visible to others (messages/records), your name is
          anonymized to <em>“Deleted User.”</em> This action cannot be undone.
        </p>
      </Card>

      <Card title="9. Children">
        <p>The app is not directed to children; it is intended only for adult/business users.</p>
      </Card>

      <Card title="10. Changes">
        <p>We may update this policy from time to time. The current version is published on this page; the last-updated date is shown above.</p>
      </Card>

      <Card title="11. Contact">
        <p>For questions: <a href={`mailto:${EMAIL}`} className="text-[#1e3a5f] font-semibold underline">{EMAIL}</a> ({COMPANY}).</p>
      </Card>

      <p className="text-xs text-gray-400 text-center mt-8">© {COMPANY} — {APP}. Exclusively for authorized organization users.</p>
    </>
  );
}
