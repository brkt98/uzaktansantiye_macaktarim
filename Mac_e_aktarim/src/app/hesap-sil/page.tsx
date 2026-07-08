import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hesap Silme — Uzaktan Şantiye",
  description: "Uzaktan Şantiye uygulamasında hesabınızı nasıl silebilirsiniz.",
};

/**
 * Public hesap silme sayfası (login gerektirmez) — Google Play "Data deletion" URL'i.
 * URL: https://uzaktansantiye.com/hesap-sil
 */
export default function HesapSilPage() {
  const SUPPORT_EMAIL = "muhasebe@mesalegrup.com";

  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-[#1e3a5f]">Hesap Silme</h1>
          <p className="text-sm text-gray-500 mt-1">Uzaktan Şantiye — hesabınızı ve verilerinizi silme</p>
        </header>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Hesabımı nasıl silerim?</h2>
          <ol className="list-decimal ml-5 space-y-2 text-sm text-gray-700">
            <li>Uygulamada oturum açın.</li>
            <li><strong>Menü → Ayarlar</strong> sayfasını açın.</li>
            <li>Sayfanın altındaki <strong>“Hesabımı Sil”</strong> bölümüne gidin.</li>
            <li>Parolanızı girip uyarıyı onaylayın. Hesabınız kalıcı olarak silinir.</li>
          </ol>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3 mt-5">
          <h2 className="text-lg font-semibold text-gray-900">Silinince ne olur?</h2>
          <p className="text-sm text-gray-700">
            Hesap silme <strong>geri alınamaz</strong>. Silme işleminde:
          </p>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <strong className="text-red-700">Kalıcı olarak silinen:</strong> kişisel notlarınız ve not klasörleriniz,
              bildirimleriniz, cihaz bildirim kayıtlarınız (push token) ve profil bilgileriniz (ad, e-posta, telefon,
              profil fotoğrafı). Hesabınızla bir daha giriş yapılamaz.
            </p>
            <p>
              <strong className="text-gray-800">Anonimleştirilerek korunan:</strong> başkalarının da gördüğü ortak
              içerikler (sohbet mesajları, şantiye kayıtları, denetim/işlem geçmişi) silinmez — ancak bunlarda adınız
              <em> “Silinmiş Kullanıcı”</em> olarak görünür. Böylece diğer kullanıcıların geçmişi ve kurumsal kayıtlar bozulmaz.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3 mt-5">
          <h2 className="text-lg font-semibold text-gray-900">Giriş yapamıyorsanız</h2>
          <p className="text-sm text-gray-700">
            Uygulamaya erişemiyorsanız, kayıtlı e-posta adresinizden{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#1e3a5f] font-semibold underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            adresine “Hesap silme talebi” konulu bir e-posta gönderin. Talebiniz kimliğiniz doğrulandıktan sonra makul
            bir süre içinde işleme alınır.
          </p>
        </section>

        <p className="text-xs text-gray-400 text-center mt-8">
          Bu uygulama yalnızca yetkili organizasyon kullanıcılarına özeldir.
        </p>
      </div>
    </main>
  );
}
