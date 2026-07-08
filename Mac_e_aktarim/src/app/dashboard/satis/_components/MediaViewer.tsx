"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useDevice } from "@/hooks/useDevice";
import { useDialog } from "./DialogProvider";
import {
  Download,
  Maximize2,
  Minimize2,
  Share2,
  Trash2,
  Video,
  X,
} from "lucide-react";

export type MediaItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  title?: string | null;
  description?: string | null;
};

type Props = {
  open: boolean;
  items: MediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onDelete?: (item: MediaItem) => void;
  title?: string;
  subtitle?: string;
};

type TouchState = {
  dist: number;
  cx: number;
  cy: number;
  scale: number;
  px: number;
  py: number;
  moved: boolean;
  t: number;
  swipeDx?: number;
};

export default function MediaViewer({
  open,
  items,
  index,
  onIndexChange,
  onClose,
  onDelete,
  title,
  subtitle,
}: Props) {
  const { alert } = useDialog();
  const { isMobile } = useDevice();
  useBodyScrollLock(open);
  const [imgZoom, setImgZoom] = useState(1);
  const [imgPan, setImgPan] = useState({ x: 0, y: 0 });
  const [imgFullscreen, setImgFullscreen] = useState(false);
  const [swipeDx, setSwipeDx] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgTouchRef = useRef<TouchState | null>(null);
  const lastTapRef = useRef<number>(0);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const videoSwipeRef = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  const resetZoom = useCallback(() => {
    setImgZoom(1);
    setImgPan({ x: 0, y: 0 });
    setSwipeDx(0);
  }, []);

  // Track container width for strip translation
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (imgContainerRef.current) setContainerWidth(imgContainerRef.current.clientWidth);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, imgFullscreen]);

  // Reset zoom on index change & scroll active thumbnail into view
  useEffect(() => {
    resetZoom();
    thumbRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [index, resetZoom]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setImgZoom(1);
      setImgPan({ x: 0, y: 0 });
      setImgFullscreen(false);
    }
  }, [open]);

  // Auto-fullscreen on tablet when opened (telefonda DEĞİL — mobilde tam ekran saf CSS)
  useEffect(() => {
    if (!open || isMobile) return;
    const isTablet =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse) and (hover: none) and (min-width: 600px)").matches;
    if (!isTablet) return;
    const t = setTimeout(() => {
      const el = imgContainerRef.current;
      if (!el) return;
      try {
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
        setImgFullscreen(true);
      } catch {}
    }, 120);
    return () => clearTimeout(t);
  }, [open, isMobile]);

  // Tarayıcı tam ekrandan çıkışı dinle (örn. iPad'de aşağı kaydırma).
  // MOBİLDE devre dışı: telefonda tam ekran saf CSS (overlay zaten fixed inset-0). WebView gerçek
  // fullscreen'e girmediğinde bu dinleyici imgFullscreen'i yanlışlıkla false'a düşürüp büyüt ikonunu
  // takıyordu (Bug #2). Mobilde durum yalnızca dokunuş/butonla yönetilir — inline viewer ile aynı.
  useEffect(() => {
    const onFsChange = () => {
      if (isMobile) return;
      const fs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (!fs) {
        setImgFullscreen(false);
        setImgZoom(1);
        setImgPan({ x: 0, y: 0 });
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as any);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as any);
    };
  }, [isMobile]);

  // Body scroll lock when open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
          setImgFullscreen(false);
        } else {
          closeAll();
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        onIndexChange(index - 1);
      } else if (e.key === "ArrowRight" && index < items.length - 1) {
        onIndexChange(index + 1);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, items.length]);

  if (!open || items.length === 0) return null;
  const current = items[index];
  if (!current) return null;

  function closeAll() {
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
      } catch {}
    }
    onClose();
    setImgZoom(1);
    setImgPan({ x: 0, y: 0 });
    setImgFullscreen(false);
  }

  const isVideo = current.mimeType?.startsWith("video/");
  // Mobilde foto da (video gibi) tüm alanı doldurur ve pinch-zoom her zaman aktiftir.
  const zoomable = imgFullscreen || isMobile;

  const node = (
    <div
      className="fixed inset-0 bg-black/90 flex flex-col z-[200] select-none"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Header (mobilde tam ekranda gizli — immersive görünüm, inline viewer ile aynı) */}
      <div className={`modal-safe-top flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/50 ${isMobile && imgFullscreen ? "hidden" : ""}`}>
        <div className="text-white min-w-0">
          {title && <h3 className="text-sm font-semibold truncate">{title}</h3>}
          <p className="text-xs text-white/60">
            {subtitle ? subtitle + " — " : ""}
            {index + 1} / {items.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              window.open(
                `/api/download?url=${encodeURIComponent(current.fileUrl)}&name=${encodeURIComponent(
                  current.fileName || "medya"
                )}`,
                "_self"
              );
            }}
            className="p-3 hover:bg-white/20 rounded-xl text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="İndir"
          >
            <Download size={22} />
          </button>
          <button
            onClick={() => {
              const url = window.location.origin + current.fileUrl;
              navigator.clipboard.writeText(url).then(() => alert({ message: "Link kopyalandı!", variant: "success" }));
            }}
            className="p-3 hover:bg-white/20 rounded-xl text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Link Kopyala"
          >
            <Share2 size={22} />
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(current)}
              className="p-3 hover:bg-white/20 rounded-xl text-red-400 min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Sil"
            >
              <Trash2 size={22} />
            </button>
          )}
          <button
            onClick={closeAll}
            className="p-3 hover:bg-white/20 rounded-xl text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Kapat"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 flex flex-col items-center justify-center overflow-hidden relative"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeAll();
        }}
      >
        {/* Media display */}
        <div
          className={`w-full flex-1 flex items-center justify-center overflow-hidden ${isMobile ? "" : "p-2"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo ? (
            <div
              className="relative w-full h-full flex items-center justify-center"
              onTouchStart={(e) => { if (e.touches.length === 1) videoSwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, dy: 0 }; }}
              onTouchMove={(e) => { const s = videoSwipeRef.current; if (s && e.touches.length === 1) { s.dx = e.touches[0].clientX - s.x; s.dy = e.touches[0].clientY - s.y; } }}
              onTouchEnd={() => {
                const s = videoSwipeRef.current; videoSwipeRef.current = null;
                if (!s) return;
                const threshold = Math.max(60, containerWidth * 0.2);
                if (Math.abs(s.dx) > threshold && Math.abs(s.dx) > Math.abs(s.dy)) {
                  if (s.dx < 0 && index < items.length - 1) onIndexChange(index + 1);
                  else if (s.dx > 0 && index > 0) onIndexChange(index - 1);
                }
              }}
            >
            <video
              key={current.id}
              src={current.fileUrl}
              controls
              controlsList={isMobile ? "nofullscreen" : undefined}
              disablePictureInPicture
              playsInline
              preload="auto"
              className={isMobile ? "w-full h-full object-contain bg-black" : "w-full max-h-[85vh] rounded-lg cursor-pointer"}
              onPlay={(e) => {
                // Mobilde Android WebView native video tam ekranı küçük kalıyor → CSS zaten tüm alanı dolduruyor, native fullscreen çağırma.
                if (isMobile) return;
                const video = e.currentTarget;
                if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
                  if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
                  else if ((video as any).webkitEnterFullscreen) (video as any).webkitEnterFullscreen();
                  else if ((video as any).webkitRequestFullscreen) (video as any).webkitRequestFullscreen();
                }
              }}
            />
            </div>
          ) : (
            <div
              ref={imgContainerRef}
              className={`relative w-full h-full flex items-center justify-center ${imgFullscreen ? "bg-black" : ""}`}
              style={{ touchAction: "none" }}
              onTouchStart={(e) => {
                if (e.touches.length === 2 && zoomable) {
                  const dx = e.touches[1].clientX - e.touches[0].clientX;
                  const dy = e.touches[1].clientY - e.touches[0].clientY;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  imgTouchRef.current = {
                    dist,
                    cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
                    scale: imgZoom,
                    px: imgPan.x,
                    py: imgPan.y,
                    moved: false,
                    t: Date.now(),
                  };
                } else if (e.touches.length === 1) {
                  imgTouchRef.current = {
                    dist: 0,
                    cx: e.touches[0].clientX,
                    cy: e.touches[0].clientY,
                    scale: imgZoom,
                    px: imgPan.x,
                    py: imgPan.y,
                    moved: false,
                    t: Date.now(),
                  };
                }
              }}
              onTouchMove={(e) => {
                if (!imgTouchRef.current) return;
                if (e.touches.length === 2 && zoomable) {
                  e.preventDefault();
                  const dx = e.touches[1].clientX - e.touches[0].clientX;
                  const dy = e.touches[1].clientY - e.touches[0].clientY;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const newScale = Math.min(
                    5,
                    Math.max(1, imgTouchRef.current.scale * (dist / imgTouchRef.current.dist))
                  );
                  const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                  const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                  const panX = imgTouchRef.current.px + (cx - imgTouchRef.current.cx);
                  const panY = imgTouchRef.current.py + (cy - imgTouchRef.current.cy);
                  setImgZoom(newScale);
                  setImgPan(newScale > 1 ? { x: panX, y: panY } : { x: 0, y: 0 });
                  imgTouchRef.current.moved = true;
                } else if (e.touches.length === 1 && zoomable && imgZoom > 1) {
                  e.preventDefault();
                  const panX =
                    imgTouchRef.current.px + (e.touches[0].clientX - imgTouchRef.current.cx);
                  const panY =
                    imgTouchRef.current.py + (e.touches[0].clientY - imgTouchRef.current.cy);
                  setImgPan({ x: panX, y: panY });
                  imgTouchRef.current.moved = true;
                } else if (e.touches.length === 1 && imgZoom <= 1) {
                  // Horizontal swipe for navigation (iOS-style)
                  const dx = e.touches[0].clientX - imgTouchRef.current.cx;
                  const dy = e.touches[0].clientY - imgTouchRef.current.cy;
                  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
                    e.preventDefault();
                    imgTouchRef.current.moved = true;
                    imgTouchRef.current.swipeDx = dx;
                    // Apply rubber-band at edges
                    let effectiveDx = dx;
                    if ((index === 0 && dx > 0) || (index === items.length - 1 && dx < 0)) {
                      effectiveDx = dx * 0.35;
                    }
                    setSwipeDx(effectiveDx);
                  }
                }
              }}
              onTouchEnd={(e) => {
                if (!imgTouchRef.current || e.touches.length !== 0) return;
                // Swipe navigation
                if (
                  imgTouchRef.current.moved &&
                  imgTouchRef.current.swipeDx !== undefined &&
                  imgZoom <= 1
                ) {
                  const dx = imgTouchRef.current.swipeDx;
                  const threshold = Math.max(60, containerWidth * 0.2);
                  if (dx <= -threshold && index < items.length - 1) {
                    onIndexChange(index + 1);
                  } else if (dx >= threshold && index > 0) {
                    onIndexChange(index - 1);
                  } else {
                    setSwipeDx(0);
                  }
                  imgTouchRef.current = null;
                  return;
                }
                // Pinch end snap
                if (imgTouchRef.current.moved && imgTouchRef.current.dist > 0) {
                  if (imgZoom <= 1.05) {
                    setImgZoom(1);
                    setImgPan({ x: 0, y: 0 });
                  }
                  imgTouchRef.current = null;
                  return;
                }
                const elapsed = Date.now() - imgTouchRef.current.t;
                if (!imgTouchRef.current.moved && elapsed < 400) {
                  const now = Date.now();
                  if (zoomable && lastTapRef.current && now - lastTapRef.current < 500) {
                    // Double-tap in fullscreen — toggle zoom
                    if (imgZoom > 1) {
                      setImgZoom(1);
                      setImgPan({ x: 0, y: 0 });
                    } else {
                      setImgZoom(2.5);
                    }
                    lastTapRef.current = 0;
                  } else if (zoomable) {
                    lastTapRef.current = now;
                  } else {
                    // Tap to enter fullscreen
                    lastTapRef.current = 0;
                    const el = imgContainerRef.current;
                    if (el) {
                      // MOBİLDE tarayıcı fullscreen API'si KULLANILMAZ: portal içinde geçiş yapınca
                      // alttaki ekran (depo malzeme listesi) anlık görünüyordu (Bug #1) ve gerçek
                      // fullscreen'e girilemediğinde state desync oluyordu (Bug #2). Overlay zaten
                      // fixed inset-0 → saf CSS tam ekran (ana sayfadaki foto/video viewer ile birebir).
                      if (!isMobile) {
                        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                        else if ((el as any).webkitRequestFullscreen)
                          (el as any).webkitRequestFullscreen();
                      }
                      setImgFullscreen(true);
                    }
                  }
                }
                imgTouchRef.current = null;
              }}
              onClick={(e) => {
                if ("ontouchstart" in window) return;
                e.stopPropagation();
                // Desktop click — toggle fullscreen
                if (!imgFullscreen) {
                  const el = imgContainerRef.current;
                  if (el) {
                    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                    else if ((el as any).webkitRequestFullscreen)
                      (el as any).webkitRequestFullscreen();
                    setImgFullscreen(true);
                  }
                } else {
                  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                  else if ((document as any).webkitExitFullscreen)
                    (document as any).webkitExitFullscreen();
                  setImgFullscreen(false);
                  setImgZoom(1);
                  setImgPan({ x: 0, y: 0 });
                }
              }}
              onDoubleClick={(e) => {
                if ("ontouchstart" in window) return;
                e.stopPropagation();
                if (imgZoom > 1) {
                  setImgZoom(1);
                  setImgPan({ x: 0, y: 0 });
                } else if (imgFullscreen) {
                  setImgZoom(2.5);
                }
              }}
              onWheel={(e) => {
                if (!imgFullscreen) return;
                e.preventDefault();
                const delta = -e.deltaY * 0.005;
                setImgZoom((z) => Math.min(5, Math.max(1, z + delta)));
              }}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translateX(${swipeDx}px)`,
                  transition: imgTouchRef.current?.swipeDx !== undefined ? "none" : "transform 0.25s ease-out",
                }}
              >
                {/* Previous image (off-screen left) */}
                {index > 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={items[index - 1].fileUrl}
                    alt=""
                    draggable={false}
                    className={`absolute object-contain rounded-lg select-none pointer-events-none ${imgFullscreen || isMobile ? "w-full h-full" : "w-full max-h-[85vh]"}`}
                    style={{ left: "-100%", paddingRight: 16 }}
                  />
                )}
                {/* Current */}
                <img
                  key={current.id}
                  src={current.fileUrl}
                  alt={current.fileName}
                  className={`object-contain rounded-lg select-none cursor-pointer ${imgFullscreen || isMobile ? "w-full h-full" : "w-full max-h-[85vh]"}`}
                  draggable={false}
                  style={{
                    transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px)`,
                    transition: imgTouchRef.current ? "none" : "transform 0.2s ease-out",
                  }}
                />
                {/* Next image (off-screen right) */}
                {index < items.length - 1 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={items[index + 1].fileUrl}
                    alt=""
                    draggable={false}
                    className={`absolute object-contain rounded-lg select-none pointer-events-none ${imgFullscreen || isMobile ? "w-full h-full" : "w-full max-h-[85vh]"}`}
                    style={{ left: "100%", paddingLeft: 16 }}
                  />
                )}
              </div>
              {/* Fullscreen indicator (mobilde gizli — foto zaten ekranı dolduruyor) */}
              {!imgFullscreen && !isMobile && (
                <div className="absolute bottom-4 right-4 z-20 p-2 bg-black/50 rounded-full text-white/70 pointer-events-none">
                  <Maximize2 size={18} />
                </div>
              )}
              {/* Zoom % indicator + reset */}
              {imgFullscreen && imgZoom > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImgZoom(1);
                    setImgPan({ x: 0, y: 0 });
                  }}
                  className="absolute top-4 right-4 z-20 px-3 py-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white text-xs font-medium flex items-center gap-1.5 transition-all"
                >
                  <X size={14} /> {Math.round(imgZoom * 100)}%
                </button>
              )}
              {/* Exit fullscreen button (zoom'dayken de görünür — inline viewer ile aynı) */}
              {imgFullscreen && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                    else if ((document as any).webkitExitFullscreen)
                      (document as any).webkitExitFullscreen();
                    setImgFullscreen(false);
                    setImgZoom(1);
                    setImgPan({ x: 0, y: 0 });
                  }}
                  className="absolute bottom-4 right-4 z-20 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-all"
                >
                  <Minimize2 size={18} />
                </button>
              )}
              {/* Counter in fullscreen */}
              {imgFullscreen && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-black/50 rounded-full text-white text-xs">
                  {index + 1} / {items.length}
                </div>
              )}
              {/* Title + description overlay in fullscreen */}
              {imgFullscreen && (current.title || current.description) && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 max-w-[90%] px-4 py-2 bg-black/55 rounded-lg text-center pointer-events-none">
                  {current.title && (
                    <p className="text-white text-sm font-semibold">{current.title}</p>
                  )}
                  {current.description && (
                    <p className="text-white/80 text-xs mt-0.5 line-clamp-2">
                      {current.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Title & description (non-fullscreen) */}
        {!imgFullscreen && (current.title || current.description) && (
          <div className="flex-shrink-0 w-full max-w-2xl px-6 pb-2 text-center">
            {current.title && (
              <h4 className="text-white text-sm font-semibold">{current.title}</h4>
            )}
            {current.description && (
              <p className="text-white/70 text-xs mt-1">{current.description}</p>
            )}
          </div>
        )}
      </div>

      {/* Thumbnail strip (videoda da görünür → videodan diğer medyalara geçilebilir) */}
      {items.length > 1 && !(isMobile && imgFullscreen) && (
        <div
          className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 bg-black/50 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {items.map((media, idx) => (
            <button
              key={media.id}
              ref={(el) => {
                thumbRefs.current[idx] = el;
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onIndexChange(idx)}
              className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                idx === index
                  ? "border-white scale-110"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {media.mimeType?.startsWith("video/") ? (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <Video size={16} className="text-white" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={media.fileUrl + (media.fileUrl.includes("?") ? "&" : "?") + "size=thumb"}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
