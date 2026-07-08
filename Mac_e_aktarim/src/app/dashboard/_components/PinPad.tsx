"use client";

import { useState } from "react";
import { Delete, Lock } from "lucide-react";

/** 4 haneli PIN giriş ekranı (tam ekran kaplama). 4. hane girilince onComplete. */
export default function PinPad({
  title,
  subtitle,
  error,
  disabled,
  onComplete,
  onCancel,
  onForgot,
}: {
  title: string;
  subtitle?: string;
  error?: string;
  disabled?: boolean;
  onComplete: (pin: string) => void;
  onCancel?: () => void;
  onForgot?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const press = (d: string) => {
    if (disabled || pin.length >= 4) return;
    // Basılan tuşu beyaz parlat (geri bildirim)
    setFlash(d);
    window.setTimeout(() => setFlash((f) => (f === d ? null : f)), 150);
    const np = pin + d;
    setPin(np);
    if (np.length === 4) {
      setTimeout(() => {
        setPin("");
        void onComplete(np);
      }, 160);
    }
  };

  const back = () => setPin((p) => p.slice(0, -1));

  const Key = ({ d }: { d: string }) => (
    <button
      onClick={() => press(d)}
      disabled={disabled}
      className={`w-[72px] h-[72px] rounded-full text-3xl font-light transition active:scale-90 disabled:opacity-40 ${
        flash === d ? "bg-white text-[#1a1a2e] scale-95" : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {d}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[210] bg-[#1a1a2e] flex flex-col items-center justify-center text-white px-6 select-none">
      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-4">
        <Lock size={26} />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="text-sm text-white/60 mt-1 text-center">{subtitle}</p>}

      {/* 4 nokta */}
      <div className="flex gap-4 my-6">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full border-2 ${i < pin.length ? "bg-white border-white" : "border-white/40"} ${error ? "!border-red-400" : ""}`}
          />
        ))}
      </div>

      <p className={`h-5 text-sm mb-2 ${error ? "text-red-400" : "text-transparent"}`}>{error || "."}</p>

      {/* Tuş takımı — 3 sütun (telefon tuş takımı) */}
      <div className="flex flex-col gap-4">
        {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]].map((row) => (
          <div key={row[0]} className="flex gap-5 justify-center">
            {row.map((d) => <Key key={d} d={d} />)}
          </div>
        ))}
        <div className="flex gap-5 justify-center">
          <span className="w-[72px] h-[72px]" />
          <Key d="0" />
          <button
            onClick={back}
            disabled={disabled || pin.length === 0}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition disabled:opacity-30"
            aria-label="Sil"
          >
            <Delete size={26} />
          </button>
        </div>
      </div>

      {onCancel && (
        <button onClick={onCancel} className="mt-8 text-sm text-white/60 hover:text-white">
          İptal
        </button>
      )}
      {onForgot && (
        <button onClick={onForgot} className="mt-8 text-sm text-white/50 hover:text-white underline">
          PIN'i unuttum
        </button>
      )}
    </div>
  );
}
