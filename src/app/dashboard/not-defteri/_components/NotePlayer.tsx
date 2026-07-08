"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

function fmtDur(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// URL'den deterministik dalga-formu (her notta sabit, decode'a gerek yok → hafif).
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

/**
 * NotePlayer — Not Defteri için modern sesli kayıt oynatıcısı.
 * Sohbetteki tasarımla aynı: oynat/duraklat + dalga-formu + tıkla-konumlan + süre.
 * webm (MediaRecorder) "duration:Infinity" bug'ını seek-hile ile düzeltir → süre doğru.
 */
export default function NotePlayer({ url, dur: knownDur }: { url: string; dur?: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const fixing = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [metaDur, setMetaDur] = useState(0);
  const [cur, setCur] = useState(0);
  const bars = useMemo(() => makeBars(url, 36), [url]);
  // Saklanan kayıt süresi varsa onu kullan (webm metadata güvenilmez); yoksa seek-hile fallback.
  const hasKnown = !!knownDur && knownDur > 0;
  const dur = hasKnown ? (knownDur as number) : metaDur;
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
  }, [url, hasKnown]);

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

  // Saklanan süre tamsayıdır; gerçek media biraz uzun olabilir → cur/dur 1'i aşmasın
  const progress = dur ? Math.min(1, cur / dur) : 0;
  const shownCur = dur ? Math.min(cur, dur) : cur;

  return (
    <div data-noteplayer className="inline-flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[#1e3a5f]/[0.05] border border-[#1e3a5f]/10 w-[290px] max-w-full my-2 align-middle">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={ref} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Duraklat" : "Oynat"}
        className="w-10 h-10 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center shrink-0 shadow-sm active:scale-90 transition hover:bg-[#172e4a]"
      >
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div onClick={seek} className="flex items-center gap-[2px] h-8 cursor-pointer">
          {bars.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${i / bars.length < progress ? "bg-[#1e3a5f]" : "bg-[#1e3a5f]/25"}`}
              style={{ height: `${Math.round(h * 100)}%`, minWidth: 2 }}
            />
          ))}
        </div>
        <div className="text-[11px] mt-1 tabular-nums text-gray-500">
          {fmtDur(playing || cur > 0 ? shownCur : dur)}
        </div>
      </div>
    </div>
  );
}
