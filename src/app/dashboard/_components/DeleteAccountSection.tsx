"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, ChevronLeft, X, Trash2 } from "lucide-react";
import { useDevice } from "@/hooks/useDevice";
import { useModalBack } from "@/lib/backStack";

/**
 * Hesabımı Sil — paylaşılan bölüm (Ayarlar + Hesap Yönetimi sayfalarında kullanılır).
 * Kırmızı tehlike kartı + tam-ekran onay modalı (uyarı + parola) + DELETE /api/account.
 * TÜM kullanıcılar (Play policy: her kullanıcı kendi hesabını silebilmeli).
 */
export default function DeleteAccountSection() {
  const { isMobile } = useDevice();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useModalBack(open, () => { if (!loading) setOpen(false); });

  const submit = async () => {
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Hesap silinemedi.");
        setLoading(false);
        return;
      }
      window.location.assign("/login"); // oturum bitti → login
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <>
      {/* Tehlike kartı — bg-red-50 (globals'ın mobil beyaz-kart kuralını by-pass eder → kırmızı belirgin kalır) */}
      <div className="rounded-xl p-6 bg-red-50 border-2 border-red-300">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
            <AlertTriangle className="text-red-600" size={20} />
          </div>
          <h3 className="font-bold text-red-700 text-lg">Hesabımı Sil</h3>
        </div>
        <p className="text-sm text-gray-700 mb-4">
          Hesabınızı ve kişisel verilerinizi (notlar, bildirimler, profil bilgileri, yüklediğiniz medya) kalıcı olarak siler. Bu işlem geri alınamaz.
        </p>
        <button
          onClick={() => { setPassword(""); setError(""); setOpen(true); }}
          className="pressable px-5 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm active:scale-95 transition inline-flex items-center gap-2"
        >
          <Trash2 size={16} /> Hesabımı Sil
        </button>
      </div>

      {/* Onay modalı (mobilde tam ekran + safe-top; uyarı + parola) */}
      {open && (
        <div
          className={`fixed inset-0 bg-black/50 z-[60] ${isMobile ? "" : "flex items-center justify-center p-4"}`}
          onClick={() => { if (!loading) setOpen(false); }}
        >
          <div
            className={`bg-white flex flex-col ${isMobile ? "w-full h-full" : "rounded-2xl shadow-xl w-full max-w-md max-h-[90vh]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center gap-2 border-b shrink-0 ${isMobile ? "modal-safe-top px-3 pb-3" : "px-5 py-4 justify-between"}`}>
              {isMobile && (
                <button onClick={() => { if (!loading) setOpen(false); }} className="inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-gray-100 active:scale-90 text-gray-700 shrink-0" aria-label="Geri">
                  <ChevronLeft size={26} />
                </button>
              )}
              <h2 className="text-lg font-bold text-red-700 flex-1 min-w-0 truncate">Hesabımı Sil</h2>
              {!isMobile && (
                <button onClick={() => { if (!loading) setOpen(false); }} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={22} />
                <div className="text-sm text-red-800 space-y-2">
                  <p className="font-bold">Bu işlem geri alınamaz.</p>
                  <p>Hesabınızı silerseniz:</p>
                  <ul className="list-disc ml-4 space-y-1">
                    <li><strong>Notlarınız</strong> ve not klasörleriniz kalıcı olarak silinir.</li>
                    <li>Bildirimleriniz ve profil bilgileriniz (ad, e-posta, telefon, fotoğraf) silinir.</li>
                    <li>Hesabınızla bir daha giriş yapamazsınız.</li>
                  </ul>
                  <p className="text-red-700">Ortak sohbet ve kayıtlarda adınız <em>“Silinmiş Kullanıcı”</em> olarak görünür (başkalarının geçmişi bozulmaz).</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Onaylamak için parolanızı girin</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  placeholder="Parola"
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-gray-50"
                />
              </div>

              {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            </div>

            <div className="shrink-0 border-t p-4 flex gap-3" style={isMobile ? { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" } : undefined}>
              <button
                onClick={() => { if (!loading) setOpen(false); }}
                disabled={loading}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                onClick={submit}
                disabled={!password || loading}
                className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 size={18} className="animate-spin" /> Siliniyor…</> : "Kalıcı Olarak Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
