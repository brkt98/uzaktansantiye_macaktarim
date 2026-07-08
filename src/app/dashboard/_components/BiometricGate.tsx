"use client";

import { useEffect, useState, useCallback } from "react";
import { Fingerprint } from "lucide-react";
import { biometricAuthenticate, biometricAvailable } from "@/lib/biometric";

async function disableLock() {
  try { const { Preferences } = await import("@capacitor/preferences"); await Preferences.set({ key: "biometric_lock", value: "off" }); } catch { /* yoksay */ }
}

/** Uygulama kilidi: Preferences 'biometric_lock'='on' ise native'de açılış + resume'da biyometrik ister.
    Web / kapalı / native değil → çocukları doğrudan gösterir. */
export default function BiometricGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false); // varsayılan: kilitsiz (web'de boş-flash olmaz)
  const [busy, setBusy] = useState(false);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    // Cihazda hiç authenticator yoksa (biyometrik+PIN kaldırılmış) kilitlenip kalmayı önle
    if (!(await biometricAvailable())) {
      await disableLock();
      setBusy(false);
      setLocked(false);
      return;
    }
    const r = await biometricAuthenticate("Uygulama kilidi", "Devam etmek için kimliğinizi doğrulayın");
    setBusy(false);
    setLocked(!r.success);
  }, []);

  useEffect(() => {
    let removeResume: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return; // web → kilitsiz kalır
        const { Preferences } = await import("@capacitor/preferences");
        const { value } = await Preferences.get({ key: "biometric_lock" });
        if (value !== "on") return; // kilit kapalı
        if (!(await biometricAvailable())) { await disableLock(); return; } // authenticator yok → kilitleme (kilitlenip kalma önlenir)
        setLocked(true); // önce kilitle (içerik flaşı önlenir; native splash kapsar)
        tryUnlock();
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("resume", async () => {
          const { value: v } = await Preferences.get({ key: "biometric_lock" });
          if (v === "on") setLocked(true);
        });
        removeResume = () => h.remove();
      } catch { /* yoksay → kilitsiz */ }
    })();
    return () => { removeResume?.(); };
  }, [tryUnlock]);

  if (locked) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#0f2238] text-white flex flex-col items-center justify-center gap-6 p-8 text-center" style={{ height: "100dvh" }}>
        <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center"><Fingerprint size={48} /></div>
        <div>
          <h2 className="text-xl font-semibold">Uygulama kilitli</h2>
          <p className="text-white/60 text-sm mt-1">Devam etmek için kimliğinizi doğrulayın</p>
        </div>
        <button onClick={tryUnlock} disabled={busy} className="px-6 py-3 rounded-xl bg-white text-[#0f2238] font-semibold disabled:opacity-50 active:scale-95 transition">
          {busy ? "Doğrulanıyor…" : "Kilidi aç"}
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
