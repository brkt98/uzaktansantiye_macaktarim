"use client";

/* WhatsApp tarzı özel arama ekranı (LiveKit hook'ları).
   - Sesli arama: büyük avatar + isim + süre (siyah ekran YOK).
   - Görüntülü: karşının videosu tam ekran + kendi görüntün küçük (PiP).
   - Video kapatılırsa otomatik sesli moda (avatar) düşer + ahizeye geçer.
   - Kontroller: kamera, hoparlör (native AudioManager), mikrofon, kapat.
   - Ekran paylaşımı layout'u hazır ama buton gizli (WebView getDisplayMedia desteklemez;
     native LiveKit+MediaProjection ile APK iskelet turunda eklenecek). */

import { useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import { callStart, callSetSpeaker, callEnd } from "@/lib/audioRoute";
import {
  useTracks,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  RoomAudioRenderer,
  VideoTrack,
} from "@livekit/components-react";
import {
  nativeScreenShareSupported,
  nativeStartScreenShare,
  nativeStopScreenShare,
} from "@/lib/liveKitCall";
import { setPipEligible, enterPip, onPipModeChanged, pipSupported } from "@/lib/pip";
import { Mic, MicOff, Video as VideoIcon, VideoOff, Volume2, VolumeX, PhoneOff, ChevronDown, MonitorUp, MonitorOff } from "lucide-react";

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

export default function CallRoom({ initialVideo = false, isCaller = false }: { initialVideo?: boolean; isCaller?: boolean }) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const [elapsed, setElapsed] = useState(0);
  const [speaker, setSpeaker] = useState(initialVideo); // video→hoparlör, sesli→ahize
  const [peerLeft, setPeerLeft] = useState(false);
  const [ending, setEnding] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false); // KENDİ ekran paylaşımımız aktif mi (native)
  const [screenBusy, setScreenBusy] = useState(false); // start/stop sürerken çift tıklamayı engelle
  const [isInPip, setIsInPip] = useState(false); // Android PiP modunda mıyız (kontrolleri gizle)
  const hadRemoteRef = useRef(false);
  const camRouteFirst = useRef(true);
  const speakerRef = useRef(speaker);
  speakerRef.current = speaker;

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Android PiP: GÖRÜNTÜLÜ arama yolu (bu bileşen) mount olunca uygulamayı PiP'e uygun
  // işaretle → kullanıcı ana ekrana çıkınca PiP'e girer. Unmount'ta kapat. Sesli arama
  // (NativeAudioCallRoom) bu bileşeni render ETMEZ → sesli arama PiP'e girmez. Web/iOS no-op.
  useEffect(() => {
    void setPipEligible(true);
    return () => { void setPipEligible(false); };
  }, []);

  // PiP'e girip/çıkma event'i → kontrolleri/üst barı gizle (PiP'te sadece video kalsın)
  useEffect(() => {
    return onPipModeChanged(setIsInPip);
  }, []);

  // Native ses yönlendirme: arama başında iletişim moduna geç + başlangıç çıkışı
  useEffect(() => {
    callStart(initialVideo);
    return () => { callEnd(); };
  }, [initialVideo]);

  // Video açılınca hoparlöre, kapanınca ahizeye otomatik geç (WhatsApp davranışı)
  useEffect(() => {
    if (camRouteFirst.current) { camRouteFirst.current = false; return; }
    setSpeaker(isCameraEnabled);
    callSetSpeaker(isCameraEnabled);
  }, [isCameraEnabled]);

  // EKRAN PAYLAŞIMI: ekran katılımcısı AYRI "-screen" identity ile odaya girer. Bu sahte
  // katılımcı remote/peerName/count/peerLeft mantığını BOZMAMALI → filtrele.
  const remote = participants.filter((p) => !p.isLocal && !p.identity?.endsWith("-screen"));
  const peerName = remote[0]?.name || remote[0]?.identity || "Arama";
  const connecting = remote.length === 0;
  // Kendi paylaştığımız ekranın identity'si (localParticipant.identity + "-screen") → kendi
  // ekranımızı "uzak ekran" sanıp tam ekran göstermeyelim.
  const ownScreenIdentity = localParticipant?.identity ? `${localParticipant.identity}-screen` : null;
  const statusText = ending ? "Çağrı sonlandırılıyor…" : connecting ? "Bağlanıyor…" : fmtDur(elapsed);

  // Karşı taraf görüşmeye katıldıktan SONRA ayrılırsa (kapatırsa) → kısa grace sonra "sonlandırıldı"
  useEffect(() => {
    if (remote.length > 0) {
      hadRemoteRef.current = true;
      if (peerLeft) setPeerLeft(false); // yeniden katıldı → iptal
      return;
    }
    if (!hadRemoteRef.current) return; // henüz kimse katılmadı (bağlanıyor)
    const t = setTimeout(() => setPeerLeft(true), 1300); // ağ blibine karşı grace
    return () => clearTimeout(t);
  }, [remote.length, peerLeft]);

  // "Sonlandırıldı" gösterilince kısa süre sonra odadan çık (→ onDisconnected → endCall)
  useEffect(() => {
    if (!peerLeft) return;
    const t = setTimeout(() => room.disconnect().catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, [peerLeft, room]);

  const liveCams = cameraTracks.filter((t) => t.publication && !t.publication.isMuted && t.publication.track);
  const localCam = liveCams.find((t) => t.participant.isLocal);
  const remoteCams = liveCams.filter((t) => !t.participant.isLocal);
  const screen = screenTracks.find(
    (t) =>
      t.publication &&
      !t.publication.isMuted &&
      t.publication.track &&
      // kendi paylaştığımız ekranı tam ekran gösterme (yalnız KARŞI tarafın ekranını göster)
      t.participant.identity !== ownScreenIdentity,
  );

  // Çalma sesi (ringback): YALNIZCA arayan tarafta, karşı taraf katılana kadar "dıt … dıt …" çalar
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
    } catch { /* ses yoksa sessiz devam */ }
    return () => { stopped = true; if (timer) clearTimeout(timer); try { ctx?.close(); } catch { /* yoksay */ } };
  }, [connecting, isCaller]);

  // Bağlantı kurulunca WebRTC ses rotasını sıfırlayabilir (hep hoparlör olur) → seçimi birkaç kez yeniden uygula
  useEffect(() => {
    if (connecting) return;
    const timers = [400, 1200, 2500, 4000].map((d) => setTimeout(() => callSetSpeaker(speakerRef.current), d));
    return () => timers.forEach(clearTimeout);
  }, [connecting]);

  const toggleMic = () => { localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => {}); };
  const toggleCam = () => { localParticipant.setCameraEnabled(!isCameraEnabled).catch(() => {}); };
  // Hoparlör ↔ ahize: native AudioManager (APK) ile gerçek yönlendirme; web'de görsel.
  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    callSetSpeaker(next);
  };
  // EKRAN PAYLAŞIMI: native MediaProjection ile AYRI "-screen" Room'a publish. WebView
  // getDisplayMedia Android'de YOK → buton SADECE native destekli cihazda görünür.
  const screenSupported = nativeScreenShareSupported();
  const conversationId = room.name?.startsWith("conv-") ? room.name.slice("conv-".length) : "";
  const toggleScreenShare = async () => {
    if (screenBusy) return;
    setScreenBusy(true);
    try {
      if (screenSharing) {
        await nativeStopScreenShare();
        setScreenSharing(false);
      } else {
        if (!conversationId) return;
        await nativeStartScreenShare(conversationId); // izin reddedilirse throw → state değişmez
        setScreenSharing(true);
      }
    } catch {
      /* izin reddi / hata → durum aynı kalır */
    } finally {
      setScreenBusy(false);
    }
  };

  // Arama biterken (unmount) ekran paylaşımı açıksa native tarafı kapat (sızıntı olmasın)
  useEffect(() => {
    return () => { void nativeStopScreenShare(); };
  }, []);

  // Tek çıkış kaynağı: disconnect → LiveKitRoom onDisconnected → endCall (çift geri YOK)
  const hangup = () => {
    setEnding(true); // "Çağrı sonlandırılıyor" göster (Bağlanıyor DEĞİL)
    void nativeStopScreenShare(); // varsa ekran paylaşımını da kapat
    room.disconnect().catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col text-white" style={{ height: "100dvh", background: "#0b1220" }}>
      {/* İnşaat fotoğrafı animasyonlu arka plan (login ekranı gibi crossfade + Ken Burns) */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/login-bg/1.jpg)" }} />
        {[1, 2, 3, 4, 5].map((n, i) => (
          <div key={n} className="login-slide" style={{ backgroundImage: `url(/login-bg/${n}.jpg)`, animationDelay: `${i * 6}s` }} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1220]/92 via-[#15233b]/82 to-[#0b1220]/92" />
      </div>

      <RoomAudioRenderer />

      {peerLeft && (
        <div className="absolute inset-0 z-40 bg-black/75 flex flex-col items-center justify-center gap-2 text-center px-6">
          <p className="text-lg font-medium">Görüşme sonlandırıldı</p>
          <p className="text-white/50 text-sm">Karşı taraf aramayı kapattı</p>
        </div>
      )}

      {/* Üst bar (PiP'te gizli) */}
      {!isInPip && (
        <div className="modal-safe-top flex items-center justify-between px-4 py-3 relative z-20">
          <button onClick={() => { if (pipSupported()) { void enterPip(); } else { hangup(); } }} className="p-2 rounded-full hover:bg-white/10 active:scale-90 transition" aria-label="Küçült">
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
      )}

      {/* Gövde */}
      <div className="flex-1 relative overflow-hidden z-10">
        {screen ? (
          <>
            <VideoTrack trackRef={screen} className="w-full h-full object-contain bg-black" />
            <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
              {liveCams.slice(0, 3).map((t, i) => (
                <div key={t.publication?.trackSid || i} className="w-20 h-28 rounded-xl overflow-hidden border border-white/25 bg-black shadow-lg">
                  <VideoTrack trackRef={t} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </>
        ) : remoteCams.length > 0 ? (
          <>
            <div className={`w-full h-full grid gap-1 ${remoteCams.length > 1 ? "grid-cols-2 content-center" : "grid-cols-1"}`}>
              {remoteCams.map((t, i) => (
                <div key={t.publication?.trackSid || i} className="relative bg-black overflow-hidden">
                  <VideoTrack trackRef={t} className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 text-xs bg-black/50 px-2 py-0.5 rounded-full">{t.participant.name || ""}</span>
                </div>
              ))}
            </div>
            {!isInPip && localCam && (
              <div className="absolute top-3 right-3 w-24 h-32 rounded-xl overflow-hidden border border-white/25 bg-black shadow-lg z-20">
                <VideoTrack trackRef={localCam} className="w-full h-full object-cover" />
              </div>
            )}
          </>
        ) : (
          // Sesli mod (veya karşı taraf kamerası kapalı)
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 px-6">
            <div className="w-36 h-36 rounded-full bg-[#1e3a5f] flex items-center justify-center text-5xl font-semibold shadow-2xl ring-4 ring-white/5">
              {initials(peerName)}
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold">{peerName}</p>
              <p className="text-white/55 mt-1.5">{statusText}</p>
            </div>
            {!isInPip && localCam && (
              <div className="absolute top-3 right-3 w-24 h-32 rounded-xl overflow-hidden border border-white/25 bg-black shadow-lg z-20">
                <VideoTrack trackRef={localCam} className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kontroller (PiP'te gizli → sadece video görünür) */}
      {!isInPip && (
      <div className="modal-safe-bottom px-6 pt-3 pb-7 relative z-20">
        <div className="flex items-center justify-center gap-3.5">
          <CtrlButton label="Kamera" on={isCameraEnabled} onClick={toggleCam}>
            {isCameraEnabled ? <VideoIcon size={20} /> : <VideoOff size={20} />}
          </CtrlButton>
          <CtrlButton label="Hoparlör" on={speaker} onClick={toggleSpeaker}>
            {speaker ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </CtrlButton>
          <CtrlButton label="Mikrofon" on={!isMicrophoneEnabled} onClick={toggleMic}>
            {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </CtrlButton>
          {screenSupported && (
            <CtrlButton label={screenSharing ? "Ekran paylaşımını durdur" : "Ekran paylaş"} on={screenSharing} onClick={toggleScreenShare}>
              {screenSharing ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
            </CtrlButton>
          )}
          <CtrlButton label="Aramayı bitir" danger onClick={hangup}>
            <PhoneOff size={22} />
          </CtrlButton>
        </div>
      </div>
      )}
    </div>
  );
}
