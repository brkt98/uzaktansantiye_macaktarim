"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ChatReplyPreview } from "../types";
import { FileText, Download, Check, CheckCheck, Play, Pause, RotateCcw, Reply, Ban, ChevronDown } from "lucide-react";
import { hapticMedium } from "@/lib/haptics";

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}
const thumbUrl = (u: string) => u + (u.includes("?") ? "&" : "?") + "size=thumb";

function previewOf(type: string, body: string, deleted?: boolean): string {
  if (deleted) return "Bu mesaj silindi";
  if (type === "image") return "📷 Fotoğraf";
  if (type === "video") return "📹 Video";
  if (type === "audio") return "🎤 Sesli mesaj";
  if (type === "file") return "📎 " + (body || "Dosya");
  return body;
}

function ReplyQuote({ r }: { r: ChatReplyPreview }) {
  return (
    <div className="border-l-[3px] border-[#1e3a5f]/60 bg-black/[0.04] rounded px-2 py-1 mt-1 mx-1">
      <p className="text-[11px] font-semibold text-[#1e3a5f] truncate">{r.senderName || "Mesaj"}</p>
      <p className={`text-[11px] truncate ${r.deleted ? "italic text-gray-400" : "text-gray-500"}`}>{previewOf(r.type, r.body, r.deleted)}</p>
    </div>
  );
}

function fmtDur(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// URL'den deterministik dalga-formu (her mesajda sabit, gerçek decode'a gerek yok → hafif).
function makeBars(seedStr: string, n: number): number[] {
  let s = 0;
  for (let i = 0; i < seedStr.length; i++) s = (Math.imul(s, 31) + seedStr.charCodeAt(i)) | 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) | 0;
    out.push(0.32 + ((s >>> 8) & 0xffff) / 0xffff * 0.68); // 0.32..1.0
  }
  return out;
}

// WhatsApp/Telegram tarzı modern sesli mesaj oynatıcısı: oynat/duraklat + dalga-formu +
// tıkla-konumlan + süre. webm MediaRecorder'ın `duration:Infinity` bug'ını seek-hile ile düzeltir.
function VoiceMessage({ url, mine }: { url: string; mine: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const fixing = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [metaDur, setMetaDur] = useState(0);
  const [cur, setCur] = useState(0);
  // URL fragment'ındaki #dur=<sn>: kayıt anında ölçülen KESİN süre (webm metadata güvenilmez —
  // Android WebView'da 3sn kayıt 51sn görünebiliyordu). Varsa onu kullan, seek-hile'ye gerek yok.
  const knownDur = useMemo(() => { const m = url.match(/#dur=(\d+)/); return m ? Number(m[1]) : 0; }, [url]);
  const cleanUrl = useMemo(() => url.replace(/#dur=\d+/, ""), [url]);
  const bars = useMemo(() => makeBars(cleanUrl, 30), [cleanUrl]);
  const hasKnown = knownDur > 0;
  const dur = hasKnown ? knownDur : metaDur;
  const setDur = setMetaDur;

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onMeta = () => {
      if (hasKnown) return; // kesin süre biliniyor → metadata/seek-hile gereksiz
      if (a.duration === Infinity || isNaN(a.duration)) {
        fixing.current = true;
        try { a.currentTime = 1e101; } catch { /* yoksay */ } // süreyi hesaplamaya zorla
      } else setDur(a.duration);
    };
    const onTime = () => {
      if (fixing.current) {
        fixing.current = false;
        if (a.duration !== Infinity && !isNaN(a.duration)) setDur(a.duration);
        try { a.currentTime = 0; } catch { /* yoksay */ }
        return;
      }
      setCur(a.currentTime);
    };
    const onEnd = () => { setPlaying(false); setCur(0); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    if (a.readyState >= 1) onMeta();
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [cleanUrl, hasKnown]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setCur(a.currentTime);
  };

  // Saklanan süre tamsayı; gerçek media biraz uzun olabilir → çubuk/etiket 1'i aşmasın
  const progress = dur ? Math.min(1, cur / dur) : 0;
  const shownCur = dur ? Math.min(cur, dur) : cur;
  const btn = mine ? "bg-white text-[#1e3a5f]" : "bg-[#1e3a5f] text-white";
  const onCol = mine ? "bg-white" : "bg-[#1e3a5f]";
  const offCol = mine ? "bg-white/35" : "bg-[#1e3a5f]/25";

  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2 w-[230px] max-w-full">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={ref} src={cleanUrl} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Duraklat" : "Oynat"}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm active:scale-90 transition ${btn}`}
      >
        {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div onClick={seek} className="flex items-center gap-[2px] h-7 cursor-pointer">
          {bars.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${i / bars.length < progress ? onCol : offCol}`}
              style={{ height: `${Math.round(h * 100)}%`, minWidth: 2 }}
            />
          ))}
        </div>
        <div className={`text-[10px] mt-0.5 tabular-nums ${mine ? "text-white/70" : "text-gray-400"}`}>
          {fmtDur(playing || cur > 0 ? shownCur : dur)}
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({
  message,
  mine,
  isGroup,
  onOpenMedia,
  onOpenFile,
  onRetry,
  onMenu,
  onReplySwipe,
  onToggleReaction,
}: {
  message: ChatMessage;
  mine: boolean;
  isGroup: boolean;
  onOpenMedia?: () => void;
  onOpenFile?: () => void;
  onRetry?: () => void;
  onMenu?: (m: ChatMessage) => void;
  onReplySwipe?: (m: ChatMessage) => void;
  onToggleReaction?: (m: ChatMessage, emoji: string) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const press = useRef<{ x: number; y: number; moved: boolean; swiping: boolean; maxDx: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const suppressClick = useRef(false);

  // Silinmiş mesaj (herkesten) → tombstone, aksiyon yok
  if (message.deleted) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[80%] rounded-2xl px-3 py-2 text-sm italic text-gray-400 bg-gray-100 border border-gray-200 flex items-center gap-1.5">
          <Ban size={14} /> Bu mesaj silindi
        </div>
      </div>
    );
  }

  const t = message.type;
  const url = message.attachmentUrl || "";
  const isImg = t === "image" && !!url;
  const isVid = t === "video" && !!url;
  const isAud = t === "audio" && !!url;
  const isFile = t === "file" && !!url;
  const isMedia = isImg || isVid;
  const hasCaption = !!message.body && isMedia;
  const reactions = message.reactions || [];

  const tick = mine && !message.failed ? (
    message.status === "read" ? <CheckCheck size={15} className="text-sky-300" />
    : message.status === "delivered" ? <CheckCheck size={15} className="text-white/70" />
    : <Check size={15} className="text-white/70" />
  ) : null;

  // ── Jestler: bas-tut → menü, sağa kaydır → yanıtla ──
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return; // jestler (bas-tut/kaydır) SADECE dokunmatik; PC mouse'ta normal tık
    suppressClick.current = false; // yeni jest: takılı bayrağı temizle (sonraki tap yutulmasın)
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yoksay */ }
    press.current = {
      x: e.clientX, y: e.clientY, moved: false, swiping: false, maxDx: 0,
      timer: setTimeout(() => {
        if (press.current && !press.current.moved) { suppressClick.current = true; hapticMedium(); onMenu?.(message); }
      }, 500),
    };
  };
  const onMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) > 8) { p.moved = true; clearTimeout(p.timer); }
    if (Math.abs(dx) > Math.abs(dy) && dx > 0) { p.swiping = true; p.maxDx = Math.max(p.maxDx, dx); setDragX(Math.min(dx, 72)); }
  };
  const onUp = () => {
    const p = press.current;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.swiping && p.maxDx > 50) { suppressClick.current = true; onReplySwipe?.(message); } // senkron ref → güvenilir eşik
    setDragX(0);
    press.current = null;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
  };

  return (
    <div className={`relative flex ${mine ? "justify-end" : "justify-start"}`} style={{ touchAction: "pan-y" }}>
      {dragX > 4 && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[#1e3a5f]" style={{ opacity: Math.min(1, dragX / 50) }}>
          <Reply size={18} />
        </span>
      )}
      <div
        className={`relative flex flex-col max-w-[80%] group ${mine ? "items-end" : "items-start"}`}
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined, transition: dragX ? undefined : "transform 0.15s ease-out" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClickCapture={onClickCapture}
      >
        {onMenu && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onMenu(message); }}
            className={`hidden sm:flex absolute top-0 ${mine ? "-left-7" : "-right-7"} items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-gray-700 hover:bg-black/5 opacity-0 group-hover:opacity-100 transition z-10`}
            aria-label="Mesaj menüsü"
          >
            <ChevronDown size={18} />
          </button>
        )}
        <div
          className={`rounded-2xl text-sm overflow-hidden shadow-sm ${
            mine ? "bg-[#1e3a5f] text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-900 rounded-bl-sm"
          } ${message.pending ? "opacity-70" : ""}`}
        >
          {message.forwarded && (
            <p className={`text-[11px] italic px-3 pt-1.5 flex items-center gap-1 ${mine ? "text-white/60" : "text-gray-400"}`}>
              <Reply size={11} className="-scale-x-100" /> İletildi
            </p>
          )}
          {isGroup && !mine && message.sender && (
            <p className="text-[11px] font-semibold px-3 pt-1.5 text-[#1e3a5f]">
              {message.sender.firstName} {message.sender.lastName}
            </p>
          )}
          {message.replyTo && <ReplyQuote r={message.replyTo} />}

          {isImg && (
            <button type="button" onClick={onOpenMedia} className="block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(url)} alt="" loading="lazy" decoding="async" className="block w-[200px] max-w-full max-h-[280px] object-cover bg-black/10" />
            </button>
          )}
          {isVid && (
            <button type="button" onClick={onOpenMedia} className="relative block w-full">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={url} preload="metadata" muted className="block w-[200px] max-w-full max-h-[280px] object-cover bg-black pointer-events-none" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-12 h-12 rounded-full bg-black/55 flex items-center justify-center"><Play size={24} className="text-white ml-0.5" fill="currentColor" /></span>
              </span>
            </button>
          )}
          {isAud && <VoiceMessage url={url} mine={mine} />}
          {isFile && (
            <button type="button" onClick={onOpenFile} className={`flex items-center gap-2.5 px-3 py-2.5 w-full text-left ${mine ? "hover:bg-white/10" : "hover:bg-gray-50"}`}>
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${mine ? "bg-white/20" : "bg-[#1e3a5f]/10 text-[#1e3a5f]"}`}><FileText size={18} /></span>
              <span className="flex-1 min-w-0 truncate font-medium">{message.body || "Dosya"}</span>
              <Download size={16} className="shrink-0 opacity-70" />
            </button>
          )}

          {(t === "text" || hasCaption) && <p className="whitespace-pre-wrap break-words px-3 pt-2">{message.body}</p>}

          <div className={`flex items-center justify-end gap-1 px-2.5 pb-1 ${isMedia && !hasCaption ? "pt-1" : "pt-0.5"}`}>
            {mine && message.failed ? (
              <button onClick={onRetry} className="text-[10px] text-red-300 flex items-center gap-1 font-medium">
                <RotateCcw size={11} /> Gönderilemedi · Yeniden dene
              </button>
            ) : (
              <>
                <span className={`text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>{fmt(message.createdAt)}</span>
                {tick}
              </>
            )}
          </div>
        </div>

        {reactions.length > 0 && (
          <div className={`flex gap-1 -mt-1.5 ${mine ? "mr-1.5" : "ml-1.5"} z-10`}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onToggleReaction?.(message, r.emoji)}
                className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] shadow-sm ${r.mine ? "bg-[#1e3a5f]/10 ring-1 ring-[#1e3a5f]/40" : "bg-white border border-gray-200"}`}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="text-gray-600 font-medium">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
