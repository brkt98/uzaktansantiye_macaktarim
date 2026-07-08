"use client";

/* NativeAudioCallRoom — FAZ A: SADECE SESLİ + NATIVE (Android) arama ekranı.
   LiveKit React hook'u YOK; native LiveKitCallPlugin (liveKitCall.ts) ile sürülür.
   - Ses motoru + yönlendirme TAMAMEN native (AudioSwitchHandler). audioRoute.ts ÇAĞRILMAZ.
   - Görünüm CallRoom'un sesli moduyla aynı: inşaat-foto arka plan + avatar + süre +
     ringback(isCaller) + peerLeft + ending + mic/hoparlör/kapat.
   - mount'ta liveKitCall.connect; native event'lerden bağlanıyor/peerLeft. */

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, ChevronDown } from "lucide-react";
import {
  nativeConnect,
  nativeSetMic,
  nativeSetSpeaker,
  nativeDisconnect,
  nativeAddListener,
} from "@/lib/liveKitCall";
import type { PluginListenerHandle } from "@capacitor/core";

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function CtrlButton({ on, onClick, children, danger, label }: { on?: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition active:scale-90 ${
        danger ? "bg-red-600 text-white hover:bg-red-700" : on ? "bg-white text-[#0b1220]" : "bg-white/15 text-white hover:bg-white/25"
      }`}
    >
      {children}
    </button>
  );
}

export default function NativeAudioCallRoom({
  token,
  url,
  isCaller = false,
  onEnd,
}: {
  token: string;
  url: string;
  isCaller?: boolean;
  onEnd: () => void;
}) {
  const [peerName, setPeerName] = useState("Arama");
  const [elapsed, setElapsed] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [speaker, setSpeaker] = useState(false); // SESLİ → varsayılan ahize (native preferredDeviceList ile uyumlu)
  const [connecting, setConnecting] = useState(true);
  const [peerLeft, setPeerLeft] = useState(false);
  const [ending, setEnding] = useState(false);

  const hadRemoteRef = useRef(false);
  const endedRef = useRef(false);

  const statusText = ending
    ? "Çağrı sonlandırılıyor…"
    : connecting
      ? "Bağlanıyor…"
      : fmtDur(elapsed);

  // Süre sayacı (karşı taraf katıldıktan sonra)
  useEffect(() => {
    if (connecting) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [connecting]);

  // Tek çıkış: native disconnect → onEnd (çift çağrı YOK)
  const finishOnce = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    void nativeDisconnect();
    onEnd();
  };

  // mount: native bağlan + event dinleyicileri. unmount: disconnect.
  useEffect(() => {
    let mounted = true;
    const handles: PluginListenerHandle[] = [];

    (async () => {
      try {
        const onPeerJoin = (data: Record<string, unknown>) => {
          if (!mounted) return;
          hadRemoteRef.current = true;
          const nm = typeof data?.name === "string" ? data.name.trim() : "";
          if (nm) setPeerName(nm); // karşı tarafın adını göster (LiveKit participant.name)
          setConnecting(false);
          setPeerLeft(false);
        };
        const onPeerLeave = () => {
          if (!mounted) return;
          // karşı taraf katıldıktan SONRA ayrıldıysa "sonlandırıldı"
          if (hadRemoteRef.current) setPeerLeft(true);
        };

        handles.push(await nativeAddListener("participantConnected", onPeerJoin));
        handles.push(await nativeAddListener("participantDisconnected", onPeerLeave));
        handles.push(
          await nativeAddListener("disconnected", () => {
            if (mounted) finishOnce();
          }),
        );

        await nativeConnect(token, url);
        // bağlandıktan sonra başlangıç çıkışı: ahize (speaker=false) — native preferredDeviceList zaten ahize,
        // yine de tutarlılık için açıkça uygula.
        void nativeSetSpeaker(false);
      } catch {
        if (mounted) finishOnce();
      }
    })();

    return () => {
      mounted = false;
      handles.forEach((h) => h.remove().catch(() => {}));
      void nativeDisconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, url]);

  // peerLeft gösterildikten kısa süre sonra çıkış
  useEffect(() => {
    if (!peerLeft) return;
    const t = setTimeout(finishOnce, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerLeft]);

  // Ringback (çalma sesi): YALNIZCA arayan tarafta, karşı taraf katılana kadar
  useEffect(() => {
    if (!connecting || !isCaller) return;
    let stopped = false;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      ctx.resume?.().catch(() => {});
      const beep = () => {
        if (stopped || !ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 440;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.04);
        gain.gain.setValueAtTime(0.16, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.42);
        timer = setTimeout(beep, 1500);
      };
      beep();
    } catch {
      /* ses yoksa sessiz devam */
    }
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      try { ctx?.close(); } catch { /* yoksay */ }
    };
  }, [connecting, isCaller]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    void nativeSetMic(next);
  };
  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    void nativeSetSpeaker(next);
  };
  const hangup = () => {
    setEnding(true);
    finishOnce();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col text-white" style={{ height: "100dvh", background: "#0b1220" }}>
      {/* İnşaat fotoğrafı animasyonlu arka plan (CallRoom ile aynı) */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/login-bg/1.jpg)" }} />
        {[1, 2, 3, 4, 5].map((n, i) => (
          <div key={n} className="login-slide" style={{ backgroundImage: `url(/login-bg/${n}.jpg)`, animationDelay: `${i * 6}s` }} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1220]/92 via-[#15233b]/82 to-[#0b1220]/92" />
      </div>

      {peerLeft && (
        <div className="absolute inset-0 z-40 bg-black/75 flex flex-col items-center justify-center gap-2 text-center px-6">
          <p className="text-lg font-medium">Görüşme sonlandırıldı</p>
          <p className="text-white/50 text-sm">Karşı taraf aramayı kapattı</p>
        </div>
      )}

      {/* Üst bar */}
      <div className="modal-safe-top flex items-center justify-between px-4 py-3 relative z-20">
        <button onClick={hangup} className="p-2 rounded-full hover:bg-white/10 active:scale-90 transition" aria-label="Küçült">
          <ChevronDown size={22} />
        </button>
        <div className="text-center leading-tight">
          <p className="font-semibold text-base truncate max-w-[60vw]">{peerName}</p>
          <p className="text-[11px] text-white/55 flex items-center justify-center gap-1">
            <span>🔒</span> {statusText}
          </p>
        </div>
        <div className="w-9" />
      </div>

      {/* Gövde — sesli mod: avatar */}
      <div className="flex-1 relative overflow-hidden z-10">
        <div className="w-full h-full flex flex-col items-center justify-center gap-6 px-6">
          <div className="w-36 h-36 rounded-full bg-[#1e3a5f] flex items-center justify-center text-5xl font-semibold shadow-2xl ring-4 ring-white/5">
            {initials(peerName)}
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold">{peerName}</p>
            <p className="text-white/55 mt-1.5">{statusText}</p>
          </div>
        </div>
      </div>

      {/* Kontroller — kamera YOK (audio-only) */}
      <div className="modal-safe-bottom px-6 pt-3 pb-7 relative z-20">
        <div className="flex items-center justify-center gap-3.5">
          <CtrlButton label="Hoparlör" on={speaker} onClick={toggleSpeaker}>
            {speaker ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </CtrlButton>
          <CtrlButton label="Mikrofon" on={!micOn} onClick={toggleMic}>
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </CtrlButton>
          <CtrlButton label="Aramayı bitir" danger onClick={hangup}>
            <PhoneOff size={22} />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}
