"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

type Props = {
  open: boolean;
  type: "photo" | "video";
  onClose: () => void;
  /** Çekilen blob ile çağrılır. Component blob'u verdikten sonra kapanır. */
  onCapture: (blob: Blob, fileName: string) => void;
};

export default function CameraDialog({ open, type, onClose, onCapture }: Props) {
  useBodyScrollLock(open);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAll = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setIsRecording(false);
    setElapsed(0);
  }, []);

  // open olduğunda kamerayı aç
  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: type === "video",
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const tryAttach = () => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          } else {
            requestAnimationFrame(tryAttach);
          }
        };
        requestAnimationFrame(tryAttach);
      } catch (e) {
        console.error("Camera open error:", e);
        setError("Kamera açılamadı. Tarayıcı izinlerini kontrol edin.");
      }
    })();
    return () => {
      cancelled = true;
      stopAll();
    };
  }, [open, type, stopAll]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopAll();
        onCapture(blob, `foto_${Date.now()}.jpg`);
        onClose();
      },
      "image/jpeg",
      0.9
    );
  }, [onCapture, onClose, stopAll]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    let mime = "";
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
        mime = c;
        break;
      }
    }
    const opts: MediaRecorderOptions = mime ? { mimeType: mime } : {};
    const rec = new MediaRecorder(streamRef.current, opts);
    const actualMime = rec.mimeType;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: actualMime });
      const ext = actualMime.includes("mp4") ? "mp4" : "webm";
      stopAll();
      onCapture(blob, `video_${Date.now()}.${ext}`);
      onClose();
    };
    recorderRef.current = rec;
    rec.start(1000);
    setIsRecording(true);
    const startedAt = Date.now();
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
  }, [onCapture, onClose, stopAll]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  if (!open) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 bg-black z-[80]" style={{ touchAction: "none" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          paddingTop: "env(safe-area-inset-top, 12px)",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
        }}
      >
        <div className="text-white">
          <h3 className="text-sm font-semibold drop-shadow-lg">
            {type === "photo" ? "Fotoğraf Çek" : "Video Çek"}
          </h3>
          {isRecording && (
            <p className="text-xs text-red-400 animate-pulse font-bold">
              ● Kayıt {mm}:{ss}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            stopAll();
            onClose();
          }}
          className="p-2.5 bg-black/40 backdrop-blur-sm rounded-full text-white active:scale-90"
        >
          <X size={22} />
        </button>
      </div>

      {error && (
        <div className="absolute inset-x-4 top-20 z-20 bg-red-600/90 text-white p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Bottom controls */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-6 px-4 py-8"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 24px)",
          background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
        }}
      >
        {type === "photo" ? (
          <button
            onClick={capturePhoto}
            className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 hover:border-gray-100 transition-all flex items-center justify-center active:scale-90 shadow-2xl"
          >
            <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-200" />
          </button>
        ) : !isRecording ? (
          <button
            onClick={startRecording}
            className="w-20 h-20 rounded-full bg-red-600 border-4 border-red-300 hover:bg-red-500 transition-all flex items-center justify-center active:scale-90 shadow-2xl"
          >
            <div className="w-8 h-8 rounded-full bg-red-700" />
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="w-20 h-20 rounded-full bg-red-600 border-4 border-red-300 hover:bg-red-500 transition-all flex items-center justify-center animate-pulse active:scale-90 shadow-2xl"
          >
            <div className="w-8 h-8 rounded-sm bg-white" />
          </button>
        )}
      </div>
    </div>
  );
}
