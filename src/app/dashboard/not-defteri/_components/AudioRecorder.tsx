"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, X, Loader2, FileText, Music } from "lucide-react";

type Props = {
  onClose: () => void;
  onDone: (result: { transcript: string; audioUrl?: string; audioOnly?: boolean; durationSec?: number }) => void;
  persist?: boolean;
};

export default function AudioRecorder({ onClose, onDone, persist = true }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<"idle" | "recording" | "processing" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioOnlyMode, setAudioOnlyMode] = useState(false);
  const audioOnlyModeRef = useRef(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);   // kayıt başlangıç zaman damgası (kesin süre için)
  const durationRef = useRef(0);    // saniye cinsinden kesin kayıt süresi
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const start = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      drawWave();

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        void finalize();
      };
      mr.start(250);
      startedAtRef.current = Date.now();
      mediaRef.current = mr;
      setRecording(true);
      setPhase("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      console.error(e);
      setPhase("error");
      setErrorMsg("Mikrofon erisimi reddedildi.");
    }
  };

  const stop = (asAudioOnly = false) => {
    if (!mediaRef.current) return;
    // Kesin süre: başlangıçtan bu ana kadar geçen gerçek süre (webm metadata güvenilmez)
    durationRef.current = startedAtRef.current
      ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      : elapsed;
    audioOnlyModeRef.current = asAudioOnly;
    setAudioOnlyMode(asAudioOnly);
    mediaRef.current.stop();
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    void audioCtxRef.current?.close();
  };

  const drawWave = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1e3a5f";
      ctx.beginPath();
      const slice = canvas.width / buf.length;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] / 128;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += slice;
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const finalize = async () => {
    setPhase("processing");
    const onlyAudio = audioOnlyModeRef.current;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("file", blob, "note.webm");
    fd.append("persist", persist ? "true" : "false");
    if (onlyAudio) fd.append("audioOnly", "true");
    try {
      const res = await fetch("/api/notes/transcribe", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setPhase("error");
        setErrorMsg(data.error || "Islenemedi.");
        return;
      }
      onDone({ transcript: data.transcript || "", audioUrl: data.audioUrl, audioOnly: !!data.audioOnly, durationSec: durationRef.current || undefined });
    } catch (e) {
      console.error(e);
      setPhase("error");
      setErrorMsg("Ag hatasi.");
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void audioCtxRef.current?.close();
    };
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4"
      onClick={phase === "processing" ? undefined : onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Mic size={18} /> Sesli Not
          </h3>
          <button
            onClick={onClose}
            disabled={phase === "processing"}
            className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
          >
            <X size={16} />
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={400}
          height={80}
          className="w-full h-20 bg-slate-50 rounded-lg border border-slate-200"
        />

        <div className="text-center text-2xl font-mono text-slate-700 mt-3">
          {mm}:{ss}
        </div>

        {errorMsg && (
          <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 text-center">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col items-stretch gap-2 mt-4">
          {phase === "processing" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-blue-700 py-3">
              <Loader2 size={18} className="animate-spin" />
              Cozumleniyor (Turkce)...
            </div>
          ) : recording ? (
            <>
              <button
                onClick={() => stop(false)}
                className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center justify-center gap-2 shadow-md"
              >
                <FileText size={18} /> Sadece Metne Cevir
              </button>
              <button
                onClick={() => stop(true)}
                className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold flex items-center justify-center gap-2 shadow-md"
              >
                <Music size={18} /> Sesli Not Olarak Kaydet (Metin + Dinleme)
              </button>
            </>
          ) : (
            <button
              onClick={start}
              className="px-5 py-3 rounded-xl bg-[#1e3a5f] hover:bg-[#172e4a] text-white font-semibold flex items-center justify-center gap-2 shadow-md"
            >
              <Mic size={18} /> Kayda Basla
            </button>
          )}
        </div>

        <p className="text-[11px] text-slate-500 text-center mt-3">
          Sadece metne cevir: yalniz Turkce transkript eklenir. Sesli not: metin + inline dinleme oynaticisi eklenir.
        </p>
      </div>
    </div>
  );
}
