"use client";

/* WhatsApp tarzı, SALT-GÖRÜNTÜLEME sohbet medya görüntüleyici.
   Resim: pinch-zoom + çift-dokun zoom + sürükle + sola/sağa kaydırarak gezinme.
   Video: native kontroller. Geri butonu sohbete döner. Portal ile tam ekran. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { downloadFile } from "@/lib/downloadFile";
import { shareFile } from "@/lib/share";

export type ChatMediaItem = { id: string; url: string; type: string; fileName?: string };

export default function ChatMediaViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: ChatMediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragX, setDragX] = useState(0);
  const touch = useRef<{ dist: number; cx: number; cy: number; scale: number; px: number; py: number; moved: boolean; t: number; swipe: boolean } | null>(null);
  const lastTap = useRef(0);

  const cur = items[index];

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDragX(0);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!cur) return null;
  const isVideo = cur.type === "video";

  const go = (dir: -1 | 1) => {
    const ni = index + dir;
    if (ni >= 0 && ni < items.length) onIndexChange(ni);
  };

  const content = (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col select-none" style={{ touchAction: "none" }}>
      {/* Header */}
      <div className="modal-safe-top flex items-center gap-3 px-3 py-2.5 bg-gradient-to-b from-black/70 to-transparent text-white shrink-0 absolute top-0 left-0 right-0 z-20">
        <button onClick={onClose} className="p-1.5 -ml-1 hover:bg-white/15 rounded-full active:scale-90 transition" aria-label="Geri">
          <ArrowLeft size={24} />
        </button>
        <span className="flex-1 min-w-0 truncate text-sm">{cur.fileName || ""}</span>
        <span className="text-xs text-white/60 tabular-nums">{index + 1}/{items.length}</span>
        <button
          onClick={() => shareFile(cur.url, cur.fileName || (isVideo ? "video.mp4" : "foto.jpg"))}
          className="p-1.5 hover:bg-white/15 rounded-full text-white/90 active:scale-90 transition"
          aria-label="Paylaş"
        >
          <Share2 size={20} />
        </button>
        <button
          onClick={async () => {
            try {
              const msg = await downloadFile(cur.url, cur.fileName || (isVideo ? "video" : "foto"));
              if (msg) alert(msg);
            } catch {
              alert("İndirilemedi");
            }
          }}
          className="p-1.5 hover:bg-white/15 rounded-full text-white/90 active:scale-90 transition"
          aria-label="İndir"
        >
          <Download size={20} />
        </button>
      </div>

      {/* Content */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        onTouchStart={(e) => {
          if (isVideo) return;
          if (e.touches.length === 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            touch.current = { dist: Math.hypot(dx, dy), cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2, scale: zoom, px: pan.x, py: pan.y, moved: false, t: Date.now(), swipe: false };
          } else if (e.touches.length === 1) {
            touch.current = { dist: 0, cx: e.touches[0].clientX, cy: e.touches[0].clientY, scale: zoom, px: pan.x, py: pan.y, moved: false, t: Date.now(), swipe: false };
          }
        }}
        onTouchMove={(e) => {
          const s = touch.current;
          if (!s || isVideo) return;
          if (e.touches.length === 2 && s.dist > 0) {
            e.preventDefault();
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const ns = Math.min(5, Math.max(1, s.scale * (Math.hypot(dx, dy) / s.dist)));
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            setZoom(ns);
            setPan(ns > 1 ? { x: s.px + (cx - s.cx), y: s.py + (cy - s.cy) } : { x: 0, y: 0 });
            s.moved = true;
          } else if (e.touches.length === 1 && zoom > 1) {
            e.preventDefault();
            setPan({ x: s.px + (e.touches[0].clientX - s.cx), y: s.py + (e.touches[0].clientY - s.cy) });
            s.moved = true;
          } else if (e.touches.length === 1 && zoom <= 1) {
            const dx = e.touches[0].clientX - s.cx;
            if (Math.abs(dx) > 15) { s.moved = true; s.swipe = true; setDragX(dx); }
          }
        }}
        onTouchEnd={(e) => {
          const s = touch.current;
          if (!s || isVideo || e.touches.length !== 0) return;
          if (s.swipe && zoom <= 1) {
            const dx = dragX;
            if (dx <= -60 && index < items.length - 1) onIndexChange(index + 1);
            else if (dx >= 60 && index > 0) onIndexChange(index - 1);
            setDragX(0);
            touch.current = null;
            return;
          }
          if (s.moved && s.dist > 0 && zoom <= 1.05) { setZoom(1); setPan({ x: 0, y: 0 }); }
          if (!s.moved && Date.now() - s.t < 350) {
            const now = Date.now();
            if (lastTap.current && now - lastTap.current < 400) {
              if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); } else setZoom(2.5);
              lastTap.current = 0;
            } else {
              lastTap.current = now;
            }
          }
          touch.current = null;
        }}
      >
        {isVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video key={cur.id} src={cur.url} controls autoPlay playsInline className="w-full h-full object-contain bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={cur.id}
            src={cur.url}
            alt=""
            draggable={false}
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `translateX(${dragX}px) scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: touch.current ? "none" : "transform 0.2s ease-out",
            }}
          />
        )}
      </div>

      {/* Masaüstü ok butonları (mobilde kaydırma var) */}
      {index > 0 && (
        <button onClick={() => go(-1)} className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white">
          <ChevronLeft size={26} />
        </button>
      )}
      {index < items.length - 1 && (
        <button onClick={() => go(1)} className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white">
          <ChevronRight size={26} />
        </button>
      )}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
