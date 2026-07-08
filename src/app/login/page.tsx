"use client";

import { useState } from "react";

const SLIDES = [1, 2, 3, 4, 5];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Giriş başarısız");
        return;
      }

      // Native WKWebView (iOS Capacitor) cookie yazma yarışını önlemek için
      // yumuşak router.push yerine tam sayfa yönlendirme yap: WebView taze
      // auth-token cookie'sini deposuna yazana kadar bekler ve /dashboard
      // isteğine cookie'yi ekler. Aksi halde middleware token'ı bulamayıp
      // login'e geri atıyor ("doğru şifre ama giriş yapmıyor").
      window.location.assign("/dashboard");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#1a1a2e]">
      {/* Geçişli fotoğraf arka planı (mesalegrup.com projeleri) — crossfade + Ken Burns */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {/* Taban fotoğraf — animasyon takılsa bile her zaman görünür (boş ekran olmaz) */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/login-bg/1.jpg)" }}
        />
        {SLIDES.map((n, i) => (
          <div
            key={n}
            className="login-slide"
            style={{ backgroundImage: `url(/login-bg/${n}.jpg)`, animationDelay: `${i * 6}s` }}
          />
        ))}
        {/* Lacivert degrade örtü — okunabilirlik + marka tonu */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e]/90 via-[#16213e]/75 to-[#0f3460]/85" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo — beyaz arka planda okunur (Giriş Yap'ın hemen üstünde) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo_mesale.png"
            alt="Meşale Grup"
            className="w-[220px] max-w-[80%] h-auto mx-auto mb-6 select-none"
            draggable={false}
          />
          <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">Giriş Yap</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none transition-all"
                placeholder="Kullanıcı adınızı girin"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none transition-all"
                placeholder="Şifrenizi girin"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#c0392b] hover:bg-[#922b21] text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#c0392b]/30 active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Giriş yapılıyor...
                </span>
              ) : (
                "Giriş Yap"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-300 text-sm mt-6 drop-shadow">
          © 2026 MeşaleGrup - Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}
