"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LiveKitRoom } from "@livekit/components-react";
import { VideoPresets } from "livekit-client";
import { useSocket } from "@/hooks/useSocket";
import { setCallOverLock } from "@/lib/fullScreenIntent";
import { nativeAudioCallSupported } from "@/lib/liveKitCall";
import CallRoom from "./_components/CallRoom";
import NativeAudioCallRoom from "./_components/NativeAudioCallRoom";

// Uygulamayı arka plana al (Android) — bildirimden gelen arama bitince kullanıcıyı
// uygulamaya sokmamak için. Web/diğer platformda no-op.
async function minimizeApp() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { App } = await import("@capacitor/app");
    await App.minimizeApp();
  } catch {
    /* yoksay */
  }
}

// Görüntülü arama kalite ayarı: bitrate'i artır (gecikmeyi DEĞİL bant genişliğini etkiler →
// aynı çözünürlükte daha az sıkıştırma = daha net). adaptiveStream/dynacast ağ yetmezse geri çeker.
const VIDEO_ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: {
    resolution: VideoPresets.h1080.resolution, // 1920×1080 yakalama (daha keskin kaynak)
  },
  publishDefaults: {
    // 1-1 arama → simulcast KAPALI: tek katman → tüm bitrate ona gider → en yüksek netlik
    // (simulcast 3 katmana bölüp üst katmana az pay bırakıyordu). Tek katman da WebRTC ile
    // ağ kötüleşirse bitrate'i kendi düşürür (donmaz, sadece kalite iner).
    simulcast: false,
    videoEncoding: {
      maxBitrate: 4_000_000, // ~4 Mbps (1080p yüksek kalite); gecikme aynı, bant genişliği artar
      maxFramerate: 30,
    },
  },
};

export default function AramaPage() {
  const params = useParams();
  const router = useRouter();
  const { socket } = useSocket();
  const roomId = String(params.roomId || "");
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [video, setVideo] = useState(true);
  const [isCaller, setIsCaller] = useState(false);
  // Native (Android) + SESLİ (video=0) ise native LiveKit motoru kullanılır (FAZ A);
  // aksi halde (görüntülü / web / masaüstü) MEVCUT WebView LiveKitRoom akışı.
  const useNativeAudio = !video && nativeAudioCallSupported();
  const acceptSentRef = useRef(false);
  const fromNotifRef = useRef(false); // arama bildirimden mi kabul edildi (accept=1)

  // Arama bitişinde tek çıkış: bildirimden gelindiyse uygulamaya SOKMA (arka plana al),
  // aksi halde geri dön. Her iki halde de kilit-üstü modunu kapat.
  const endCall = useCallback(async () => {
    void setCallOverLock(false);
    if (fromNotifRef.current) {
      await minimizeApp(); // önce arka plana al → kilit ekranı/önceki uygulama (PIN görünmesin)
      router.replace("/dashboard/sohbet"); // sonra arka planda güvenli sayfaya git (ölü aramada kalma)
    } else {
      router.back();
    }
  }, [router]);

  // Karşı taraf reddederse/iptal ederse aramayı kapat (arayan ringback'te beklemesin)
  useEffect(() => {
    if (!socket || !roomId) return;
    const onRejected = (p: { conversationId: string }) => { if (p.conversationId === roomId) { setEnded("Arama reddedildi"); setTimeout(endCall, 1500); } };
    const onCanceled = (p: { conversationId: string }) => { if (p.conversationId === roomId) { setEnded("Arama sonlandırıldı"); setTimeout(endCall, 1200); } };
    socket.on("call:rejected", onRejected);
    socket.on("call:canceled", onCanceled);
    return () => { socket.off("call:rejected", onRejected); socket.off("call:canceled", onCanceled); };
  }, [socket, roomId, endCall]);

  // Arayan, aranan cevap vermeden çıkarsa aramayı iptal et (aranan'ın gelen-arama ekranı asılı kalmasın)
  const isCallerRef = useRef(isCaller);
  isCallerRef.current = isCaller;
  const socketRef = useRef(socket);
  socketRef.current = socket;
  useEffect(() => {
    const rid = roomId;
    return () => { if (isCallerRef.current && socketRef.current) socketRef.current.emit("call:cancel", { conversationId: rid }); };
  }, [roomId]);

  // Çağrı boyunca uygulamayı kilit ekranı üstünde tut (kilit ekranından kabulde PIN'siz konuş);
  // çağrıdan çıkınca kilit altına döndür (geri kalan ekranlar keyguard+PIN ile korunur).
  useEffect(() => {
    void setCallOverLock(true);
    return () => { void setCallOverLock(false); };
  }, []);

  // Bildirimden (native çalan ekran) "Kabul" ile gelindiyse: socket hazır olunca bir kez
  // call:accept emit et — kabul edenin diğer cihazları/native ring sussun, arayan ringback'i kessin.
  useEffect(() => {
    if (!socket || !roomId) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("accept") !== "1" || sp.get("caller") === "1") return;
    if (acceptSentRef.current) return;
    acceptSentRef.current = true;
    socket.emit("call:accept", { conversationId: roomId });
  }, [socket, roomId]);

  useEffect(() => {
    if (!roomId) return;
    const sp = new URLSearchParams(window.location.search);
    setVideo(sp.get("video") !== "0");
    setIsCaller(sp.get("caller") === "1");
    fromNotifRef.current = sp.get("accept") === "1";
    fetch("/api/rtc/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: roomId }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Bağlantı kurulamadı");
        }
        return r.json();
      })
      .then((d) => setConn({ token: d.token, url: d.url }))
      .catch((e) => setError(e.message || "Bağlantı kurulamadı"));
  }, [roomId]);

  if (ended) {
    return (
      <div className="fixed inset-0 z-[70] bg-[#1a1a2e] flex flex-col items-center justify-center text-white gap-3 p-6 text-center">
        <p className="text-lg font-medium">{ended}</p>
        <p className="text-white/50 text-sm">Kapatılıyor…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[70] bg-[#1a1a2e] flex flex-col items-center justify-center text-white gap-4 p-6 text-center">
        <p>{error}</p>
        <button onClick={() => router.back()} className="px-5 py-2 rounded-lg bg-[#c0392b]">
          Geri dön
        </button>
      </div>
    );
  }

  if (!conn) {
    return (
      <div className="fixed inset-0 z-[70] bg-[#1a1a2e] flex items-center justify-center text-white">
        Bağlanıyor…
      </div>
    );
  }

  // FAZ A: native + SESLİ → native LiveKit motoru (ahize/hoparlör KÖKTEN AudioSwitchHandler ile).
  // LiveKitRoom RENDER EDİLMEZ (çift ses-motoru olmaz). endCall sinyalleri korunur (onEnd→endCall).
  if (useNativeAudio) {
    return (
      <div className="fixed inset-0 z-[70] bg-black" style={{ height: "100dvh" }}>
        <NativeAudioCallRoom
          token={conn.token}
          url={conn.url}
          isCaller={isCaller}
          onEnd={endCall}
        />
      </div>
    );
  }

  // Görüntülü / web / masaüstü: MEVCUT WebView LiveKitRoom akışı (DOKUNULMADI).
  return (
    <div className="fixed inset-0 z-[70] bg-black" style={{ height: "100dvh" }}>
      <LiveKitRoom
        token={conn.token}
        serverUrl={conn.url}
        connect
        video={video}
        audio
        options={VIDEO_ROOM_OPTIONS}
        onDisconnected={endCall}
        style={{ height: "100%" }}
      >
        <CallRoom initialVideo={video} isCaller={isCaller} />
      </LiveKitRoom>
    </div>
  );
}
