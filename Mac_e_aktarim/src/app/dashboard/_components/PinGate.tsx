"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  pinSupported,
  isPinSetSync,
  verifyPin,
  clearPinSync,
  getLockRemainingSecSync,
  recordPinFailSync,
  resetPinFails,
  getPinFailCountSync,
} from "@/lib/pinLock";
import PinPad from "./PinPad";

/** PIN ayarlıysa uygulamayı açılışta + arka plana geçişte/dönüşte kilitler.
   BEKLETME YOK: karar senkron (localStorage). children HER ZAMAN render olur (arkada yüklenir),
   kilit ÜSTÜNE biner. Native değilse (masaüstü/web) hiçbir şey yapmaz. */
export default function PinGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);
  const [confirmForgot, setConfirmForgot] = useState(false);
  const armed = useRef(false); // PIN ayarlı mı (anlık)
  const pathname = usePathname();
  // Aktif arama ekranında kilidi BASTIR (kilit ekranından kabul → PIN'siz konuş).
  // Aramadan çıkınca rota değişir → kilit yine devreye girer.
  const onCallScreen = pathname?.startsWith("/dashboard/arama") ?? false;

  // Açılış: PIN ayarlıysa HEMEN kilitle (senkron, beklemesiz — uygulama arkada yüklenir)
  useEffect(() => {
    if (!pinSupported()) return;
    armed.current = isPinSetSync();
    if (armed.current) {
      setCooldown(getLockRemainingSecSync());
      setLocked(true);
    }
  }, []);

  // Arka plana geçince/dönünce kilitle
  useEffect(() => {
    if (!pinSupported()) return;
    let cancelled = false;
    let handle: { remove: () => void } | undefined;
    (async () => {
      const { App } = await import("@capacitor/app");
      const h = await App.addListener("appStateChange", ({ isActive }) => {
        armed.current = isPinSetSync();
        if (!armed.current) return;
        if (!isActive) {
          setError(undefined);
          setLocked(true); // arka plana atılınca işaretle (snapshot/flash önleme)
        } else {
          setCooldown(getLockRemainingSecSync());
          setLocked(true);
        }
      });
      if (cancelled) {
        h.remove();
        return;
      }
      handle = h;
    })();
    return () => {
      cancelled = true;
      try {
        handle?.remove();
      } catch {
        /* yoksay */
      }
    };
  }, []);

  // Kilitlenme sayacı
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          setError(undefined);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const onComplete = async (pin: string) => {
    if (cooldown > 0) return;
    const rem = getLockRemainingSecSync();
    if (rem > 0) {
      setCooldown(rem);
      return;
    }
    if (await verifyPin(pin)) {
      resetPinFails();
      setError(undefined);
      setLocked(false);
    } else {
      const lockSec = recordPinFailSync();
      if (lockSec > 0) {
        setCooldown(lockSec);
        setError("Çok fazla deneme");
      } else {
        setError(`Yanlış PIN (${getPinFailCountSync() % 5}/5)`);
      }
    }
  };

  const doForgot = async () => {
    setConfirmForgot(false);
    setLocked(true);
    try { clearPinSync(); } catch { /* yoksay */ }
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* yoksay */ }
    window.location.assign("/login");
  };

  return (
    <>
      {children}

      {locked && !onCallScreen && (
        <PinPad
          title="PIN girin"
          subtitle="Uygulamanın kilidini açmak için PIN'inizi girin"
          error={cooldown > 0 ? `Çok fazla deneme — ${cooldown} sn` : error}
          disabled={cooldown > 0}
          onComplete={onComplete}
          onForgot={() => setConfirmForgot(true)}
        />
      )}

      {locked && !onCallScreen && confirmForgot && (
        <div className="fixed inset-0 z-[220] bg-black/70 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 text-center">
            <p className="font-semibold text-gray-900">PIN'i unuttunuz mu?</p>
            <p className="text-sm text-gray-500 mt-2">
              PIN sıfırlanacak ve çıkış yapılacak. Tekrar kullanıcı adı/şifre ile giriş yapmanız gerekir.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmForgot(false)} className="flex-1 h-10 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200">Vazgeç</button>
              <button onClick={doForgot} className="flex-1 h-10 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700">Çıkış yap</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
