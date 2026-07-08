"use client";

import { useState, useRef, useEffect } from "react";
import { X, Camera, Lock, PhoneIncoming } from "lucide-react";
import Avatar from "./Avatar";
import type { ChatUser } from "../types";
import PinPad from "../../_components/PinPad";
import { pinSupported, isPinSet, setPin, verifyPin, clearPin } from "@/lib/pinLock";
import { fsiSupported, fsiCanUse, fsiOpenSettings } from "@/lib/fullScreenIntent";

type PinMode = null | "verify-old" | "new" | "confirm" | "remove";

export default function ProfileDialog({
  me,
  onClose,
  onUpdated,
}: {
  me: ChatUser;
  onClose: () => void;
  onUpdated: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(me.avatarUrl || null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // PIN kilidi
  const [pinAvailable, setPinAvailable] = useState(false);
  const [pinOn, setPinOn] = useState(false);
  const [pinMode, setPinMode] = useState<PinMode>(null);
  const [tempPin, setTempPin] = useState("");
  const [pinError, setPinError] = useState<string | undefined>();

  // Gelen arama (full-screen) izni
  const [fsiAvailable, setFsiAvailable] = useState(false);
  const [fsiGranted, setFsiGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!pinSupported()) return;
    setPinAvailable(true); // hemen göster — isPinSet'i bekleme (bloke etme)
    let alive = true;
    (async () => {
      try {
        const on = await isPinSet();
        if (alive) setPinOn(on);
      } catch {
        /* yoksay */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshFsi = async () => {
    try {
      setFsiGranted(await fsiCanUse());
    } catch {
      /* yoksay */
    }
  };

  useEffect(() => {
    if (!fsiSupported()) return;
    setFsiAvailable(true);
    void refreshFsi();
  }, []);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("target", "me");
      const res = await fetch("/api/chat/avatar", { method: "POST", body: fd });
      const d = await res.json();
      if (res.ok) { setUrl(d.url); onUpdated(d.url); }
      else alert(d?.error || "Yüklenemedi");
    } catch {
      alert("Yüklenemedi");
    } finally {
      setBusy(false);
    }
  };

  const startSet = () => { setTempPin(""); setPinError(undefined); setPinMode("new"); };
  const startChange = () => { setTempPin(""); setPinError(undefined); setPinMode("verify-old"); };
  const startRemove = () => { setPinError(undefined); setPinMode("remove"); };
  const cancelPin = () => { setPinMode(null); setTempPin(""); setPinError(undefined); };

  const onPinComplete = async (pin: string) => {
    if (pinMode === "verify-old") {
      if (await verifyPin(pin)) { setPinError(undefined); setPinMode("new"); }
      else setPinError("Yanlış PIN");
    } else if (pinMode === "new") {
      setTempPin(pin);
      setPinError(undefined);
      setPinMode("confirm");
    } else if (pinMode === "confirm") {
      if (pin === tempPin) {
        try {
          await setPin(pin);
          setPinOn(true);
          setPinMode(null);
          setTempPin("");
        } catch {
          setPinError("PIN kaydedilemedi, tekrar deneyin");
          setTempPin("");
          setPinMode("new");
        }
      } else {
        setPinError("PIN'ler eşleşmedi, tekrar deneyin");
        setTempPin("");
        setPinMode("new");
      }
    } else if (pinMode === "remove") {
      if (await verifyPin(pin)) {
        await clearPin();
        setPinOn(false);
        setPinMode(null);
      } else {
        setPinError("Yanlış PIN");
      }
    }
  };

  const pinTitles: Record<Exclude<PinMode, null>, { t: string; s: string }> = {
    "verify-old": { t: "Mevcut PIN'i girin", s: "Değiştirmek için önce mevcut PIN'inizi girin" },
    new: { t: "Yeni PIN belirleyin", s: "4 haneli bir PIN girin" },
    confirm: { t: "PIN'i doğrulayın", s: "PIN'i tekrar girin" },
    remove: { t: "PIN'i kaldır", s: "Mevcut PIN'inizi girin" },
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Profilim</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Kapat"><X size={22} /></button>
          </div>
          <div className="flex flex-col items-center gap-3 p-6">
            <div className="relative">
              <Avatar url={url} name={`${me.firstName} ${me.lastName}`} size={96} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center border-2 border-white shadow disabled:opacity-50 active:scale-95 transition"
                aria-label="Fotoğraf değiştir"
              >
                <Camera size={16} />
              </button>
            </div>
            <p className="font-semibold text-gray-900">{me.firstName} {me.lastName}</p>
            <p className="text-xs text-gray-500">@{me.username}</p>
            {busy && <p className="text-xs text-gray-400">Yükleniyor…</p>}
          </div>

          {/* Uygulama kilidi (PIN) — sadece native */}
          {pinAvailable && (
            <div className="border-t border-gray-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <Lock size={16} /> Uygulama Kilidi (PIN)
                </span>
                <span className={`text-xs font-medium ${pinOn ? "text-green-600" : "text-gray-400"}`}>
                  {pinOn ? "Açık" : "Kapalı"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                4 haneli PIN; açılışta ve uygulamaya her dönüşte sorulur.
              </p>
              <div className="flex gap-2 mt-3">
                {pinOn ? (
                  <>
                    <button onClick={startChange} className="flex-1 h-9 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200">PIN'i değiştir</button>
                    <button onClick={startRemove} className="flex-1 h-9 rounded-lg bg-red-50 text-sm font-medium text-red-600 hover:bg-red-100">Kaldır</button>
                  </>
                ) : (
                  <button onClick={startSet} className="flex-1 h-9 rounded-lg bg-[#1e3a5f] text-sm font-medium text-white hover:opacity-90">PIN belirle</button>
                )}
              </div>
            </div>
          )}

          {/* Gelen arama izni (kilitli ekranda çalma) — sadece native Android */}
          {fsiAvailable && (
            <div className="border-t border-gray-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <PhoneIncoming size={16} /> Gelen Arama (kilitli ekran)
                </span>
                <span className={`text-xs font-medium ${fsiGranted === false ? "text-amber-600" : "text-green-600"}`}>
                  {fsiGranted === false ? "İzin gerekli" : fsiGranted === true ? "Açık" : "…"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Telefon kilitliyken/uygulama kapalıyken aramanın tam ekran çalması için
                &quot;Tam ekran bildirimler&quot; iznini açın.
              </p>
              <button
                onClick={async () => { await fsiOpenSettings(); setTimeout(refreshFsi, 600); }}
                className="w-full h-9 mt-3 rounded-lg bg-[#1e3a5f] text-sm font-medium text-white hover:opacity-90"
              >
                İzin ayarını aç
              </button>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        </div>
      </div>

      {pinMode && (
        <PinPad
          title={pinTitles[pinMode].t}
          subtitle={pinTitles[pinMode].s}
          error={pinError}
          onComplete={onPinComplete}
          onCancel={cancelPin}
        />
      )}
    </>
  );
}
