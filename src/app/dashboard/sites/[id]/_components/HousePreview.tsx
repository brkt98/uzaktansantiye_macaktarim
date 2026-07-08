"use client";

/**
 * HousePreview — İnşaat Takip / Kaba İnşaat ekranı
 *
 * Tek, self-contained component. Veri çekmez; her şey props'tan gelir.
 * Bina kesiti inline SVG + Tailwind ile çizilir. Tam ekran overlay
 * (createPortal → document.body, z-[80]). Pinch-to-zoom + pan + çift-dokunuş.
 *
 * Kat kategorisi isimden türetilir:
 *   - ismi "Çatı" içerir            → çatı (tepede)
 *   - "Hafriyat"/"Yalıtım"/"Temel"  → toprak altı (en altta, config sırasıyla)
 *   - gerisi                         → üst kat (yukarıdan aşağı = config'in tersi)
 *
 * Her iş kalemi NUMARALI gösterilir (work.order ya da sıra no) — ikon yok.
 */

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type JSX } from "react";
import { ArrowLeft } from "lucide-react";

/* ---------- types (props birebir) ---------- */
export type WorkStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type Work = { id: string; name: string; order?: number };
export type Floor = { id: string; name: string; works?: Work[] };
// status: string — çağıran taraf gevşek string döndürüyor; karşılaştırmalar yine çalışır
export type Entry = { status?: string; mediaCount?: number } | undefined;

export interface HousePreviewProps {
  floors: Floor[];                     // İnşaat Takip Ayarı sırasında gelir
  getEntry: (workId: string) => Entry; // her işin durumu + foto sayısı
  title: string;                       // örn "Kaba İnşaat"
  onBack: () => void;                  // geri butonu
  muted?: boolean;
}

/* ---------- helpers ---------- */
type FloorKind = "roof" | "tower" | "under";

function categorize(name: string): FloorKind {
  const n = (name || "").toLocaleLowerCase("tr");
  if (n.includes("çatı")) return "roof";
  if (n.includes("hafriyat") || n.includes("yalıtım") || n.includes("temel")) return "under";
  return "tower";
}

function stripPrefix(workName: string, floorName: string): string {
  if (!workName) return "";
  const pre = `${floorName} - `;
  return workName.startsWith(pre) ? workName.slice(pre.length) : workName;
}

function chipClasses(entry: Entry): { wrap: string; fg: string } {
  const status = entry?.status;
  const media = entry?.mediaCount ?? 0;
  if (status === "COMPLETED") return { wrap: "bg-green-500 border-transparent", fg: "text-white" };
  if (status === "IN_PROGRESS" || media > 0) return { wrap: "bg-yellow-500 border-transparent", fg: "text-yellow-950" };
  return { wrap: "bg-gray-100 border-gray-300", fg: "text-gray-600" };
}

/* ---------- work chip (numaralı, simgesiz) ---------- */
function WorkChip({ work, floorName, getEntry, num }: { work: Work; floorName: string; getEntry: HousePreviewProps["getEntry"]; num: number }) {
  const entry = getEntry(work.id);
  const { wrap, fg } = chipClasses(entry);
  const label = stripPrefix(work.name, floorName);
  const count = entry?.mediaCount ?? 0;
  return (
    <div className={`flex-1 min-w-0 h-11 flex items-center justify-center px-[1px] py-[1px] overflow-hidden rounded-[5px] border shadow-sm ${wrap} ${fg}`}>
      <span className="w-full text-[6px] leading-[1.04] font-semibold text-center line-clamp-6 [letter-spacing:-0.02em] break-words [overflow-wrap:anywhere] [hyphens:auto]">
        {label}
      </span>
    </div>
  );
}

/* ---------- floor name on the CEILING (top) slab line ---------- */
function SlabLabel({ name }: { name: string }) {
  return (
    <div
      className="absolute left-[19px] right-[19px] top-0 h-[15px] z-[2] flex items-center pl-[9px] rounded-[1px]"
      style={{ background: SLAB, boxShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
    >
      <span className="text-[9.5px] font-extrabold whitespace-nowrap text-[#272f39] [letter-spacing:-0.02em] [text-shadow:0_1px_0_rgba(255,255,255,0.4)]">{name}</span>
    </div>
  );
}

/* ---------- gradients (inline style — Tailwind dışı) ---------- */
const WALL = "linear-gradient(90deg,#7c848d,#c5cace 38%,#e7eaed 50%,#aeb4ba 64%,#787f88)";
const SLAB = "linear-gradient(180deg,#eef1f3,#c2c7cd 55%,#969ca3)";
const INTERIOR = "linear-gradient(180deg,#0c141d,#070d14)";
const FOOTING = "linear-gradient(180deg,#cfd4d8,#9aa0a7 60%,#777e86)";

/* ---------- tower floor (tam genişlik) — walls drawn by TowerFrame ---------- */
function TowerFloor({ floor, getEntry }: { floor: Floor; getEntry: HousePreviewProps["getEntry"] }) {
  const works = floor.works ?? [];
  return (
    <div className="relative h-[60px]">
      <div
        className="absolute left-[19px] right-[19px] top-[15px] bottom-0 z-[1] flex items-center"
        style={{ background: INTERIOR, boxShadow: "inset 0 2px 6px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.03)" }}
      >
        <div className="flex gap-[3px] px-[5px] w-full">
          {works.map((w, i) => (
            <WorkChip key={w.id} work={w} floorName={floor.name} getEntry={getEntry} num={w.order ?? i + 1} />
          ))}
        </div>
      </div>
      <SlabLabel name={floor.name} />
    </div>
  );
}

/* sürekli, DÜZ inen dış duvarlar — tüm üst katları sarar (tam genişlik) */
function TowerFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute top-0 bottom-0 left-[6px] w-[13px] z-[3]" style={{ background: WALL, boxShadow: "0.5px 0 1px rgba(0,0,0,0.35)" }} />
      <div className="absolute top-0 bottom-0 right-[6px] w-[13px] z-[3]" style={{ background: WALL, boxShadow: "-0.5px 0 1px rgba(0,0,0,0.35)" }} />
      {children}
    </div>
  );
}

/* ---------- underground floor (tam genişlik) — walls drawn by UnderFrame ---------- */
function UnderFloor({ floor, getEntry }: { floor: Floor; getEntry: HousePreviewProps["getEntry"] }) {
  const works = floor.works ?? [];
  return (
    <div className="relative h-[58px]">
      <div
        className="absolute left-[19px] right-[19px] top-[15px] bottom-0 z-[1] flex items-center"
        style={{ backgroundColor: "#0d0a06", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.8)" }}
      >
        <div className="flex gap-[3px] px-[5px] w-full">
          {works.map((w, i) => (
            <WorkChip key={w.id} work={w} floorName={floor.name} getEntry={getEntry} num={w.order ?? i + 1} />
          ))}
        </div>
      </div>
      <SlabLabel name={floor.name} />
    </div>
  );
}

/* sürekli düz beton duvarlar + geniş temel ayağı (tam genişlik) */
function UnderFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative pb-[11px]">
      <div className="absolute top-0 bottom-[11px] left-[6px] w-[13px] z-[3]" style={{ background: WALL, boxShadow: "0.5px 0 1px rgba(0,0,0,0.4)" }} />
      <div className="absolute top-0 bottom-[11px] right-[6px] w-[13px] z-[3]" style={{ background: WALL, boxShadow: "-0.5px 0 1px rgba(0,0,0,0.4)" }} />
      {children}
      <div className="absolute bottom-0 left-0 right-0 h-[11px] rounded-[1px] z-[4]" style={{ background: FOOTING, boxShadow: "0 1px 2px rgba(0,0,0,0.5)" }} />
    </div>
  );
}

/* ---------- roof (tam genişlik) ---------- */
function Roof() {
  return (
    <div className="relative h-[58px]">
      <svg viewBox="0 0 320 62" preserveAspectRatio="none" className="absolute left-0 right-0 -bottom-[2px] w-full h-[62px]">
        <defs>
          <linearGradient id="hp-roof" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a5360" />
            <stop offset="1" stopColor="#2c333d" />
          </linearGradient>
        </defs>
        <rect x="2" y="48" width="316" height="11" fill="#d9dce0" />
        <polygon points="160,3 314,50 6,50" fill="url(#hp-roof)" stroke="#20262e" strokeWidth="1.5" />
        <line x1="160" y1="5" x2="310" y2="48" stroke="#5b6675" strokeWidth="1.5" />
        {[16, 28, 40, 52].map((o, i) => (
          <line key={i} x1={160 - o * 3.0} y1={3 + o} x2={160 + o * 3.0} y2={3 + o} stroke="#363d47" strokeWidth="1" opacity="0.55" />
        ))}
        <rect x="236" y="12" width="17" height="28" fill="#39414b" stroke="#20262e" strokeWidth="1" />
        <rect x="233" y="10" width="23" height="5" fill="#4a5360" stroke="#20262e" strokeWidth="1" />
      </svg>
    </div>
  );
}

/* ---------- sky: moon + glow, lit city, varied stars ---------- */
function SkyArt() {
  const stars = Array.from({ length: 64 }).map((_, i) => {
    const x = ((i * 53.7) % 392) + 2;
    const y = ((i * 31.3) % 250) + 4;
    const big = i % 7 === 0;
    return { x, y, r: big ? 1.4 : i % 3 === 0 ? 0.95 : 0.6, o: 0.4 + (i % 4) * 0.16, big };
  });
  const wins: { x: number; y: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const x = (i * 29.3) % 392;
    const y = 322 + ((i * 17) % 70);
    if (x > 96 && x < 300) continue;
    if (i % 3 === 0) wins.push({ x: x + 2, y });
  }
  return (
    <svg viewBox="0 0 394 400" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full z-0" aria-hidden>
      <defs>
        <radialGradient id="hp-moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#a9c2e6" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#6f8cb8" stopOpacity="0.12" />
          <stop offset="1" stopColor="#6f8cb8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hp-moonBody" cx="38%" cy="36%" r="68%">
          <stop offset="0" stopColor="#f4f7fc" />
          <stop offset="1" stopColor="#c3cfe2" />
        </radialGradient>
        <linearGradient id="hp-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a3a5c" stopOpacity="0" />
          <stop offset="1" stopColor="#27567f" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <circle cx="316" cy="58" r="58" fill="url(#hp-moonGlow)" />
      <circle cx="316" cy="58" r="17" fill="url(#hp-moonBody)" />
      <circle cx="322" cy="53" r="3.4" fill="#b9c6dc" opacity="0.55" />
      <circle cx="310" cy="63" r="2.3" fill="#b9c6dc" opacity="0.5" />
      <circle cx="318" cy="65" r="1.6" fill="#b9c6dc" opacity="0.45" />
      {stars.map((s, i) => (
        <g key={i}>
          {s.big && <circle cx={s.x} cy={s.y} r={s.r * 2.6} fill="#cdd9ec" opacity={0.12} />}
          <circle cx={s.x} cy={s.y} r={s.r} fill="#dce6f5" opacity={s.o} />
        </g>
      ))}
      <rect x="0" y="250" width="394" height="150" fill="url(#hp-haze)" />
      <g fill="#16304c" opacity="0.7">
        <rect x="-4" y="286" width="40" height="120" /><rect x="34" y="262" width="26" height="144" />
        <rect x="58" y="300" width="34" height="106" /><rect x="120" y="290" width="22" height="116" />
        <rect x="160" y="274" width="20" height="132" /><rect x="214" y="296" width="24" height="110" />
        <rect x="252" y="280" width="22" height="126" /><rect x="300" y="266" width="30" height="140" />
        <rect x="330" y="300" width="24" height="106" /><rect x="356" y="282" width="40" height="124" />
      </g>
      <g fill="#0e2138">
        <rect x="-6" y="318" width="54" height="90" /><rect x="44" y="300" width="34" height="108" />
        <rect x="72" y="330" width="28" height="78" /><rect x="296" y="312" width="36" height="96" />
        <rect x="328" y="296" width="28" height="112" /><rect x="352" y="324" width="46" height="84" />
      </g>
      <g fill="#f0cf86">
        {wins.map((w, i) => <rect key={i} x={w.x} y={w.y} width="2.4" height="3.2" opacity={0.35 + (i % 3) * 0.18} />)}
      </g>
    </svg>
  );
}

/* ---------- grass ground edge: blades + shrubs ---------- */
function GroundEdge() {
  const blades: JSX.Element[] = [];
  for (let x = 0; x <= 394; x += 7) {
    const h = 6 + ((x * 7) % 9);
    const lean = ((x % 3) - 1) * 2;
    const tone = ["#6cb83f", "#4f9a2b", "#3c7a1f"][((x / 7) | 0) % 3];
    blades.push(<path key={x} d={`M${x} 26 Q${x + lean} ${26 - h} ${x + 2.4} 26 Z`} fill={tone} />);
  }
  const shrub = (cx: number, sc: number, c1: string, c2: string) => (
    <g>
      <ellipse cx={cx - 6 * sc} cy={24} rx={7 * sc} ry={6 * sc} fill={c2} />
      <ellipse cx={cx + 6 * sc} cy={24} rx={7 * sc} ry={6 * sc} fill={c2} />
      <ellipse cx={cx} cy={21} rx={9 * sc} ry={8 * sc} fill={c1} />
    </g>
  );
  return (
    <div className="relative z-[2] h-[26px] -mt-2">
      <svg viewBox="0 0 394 26" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="hp-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4d8f2c" />
            <stop offset="1" stopColor="#2b5316" />
          </linearGradient>
        </defs>
        <rect x="0" y="11" width="394" height="15" fill="url(#hp-grass)" />
        <rect x="0" y="13" width="394" height="2" fill="#5fa536" opacity="0.5" />
        {blades}
      </svg>
      <svg viewBox="0 0 394 26" preserveAspectRatio="xMaxYMax meet" className="absolute inset-0 w-full h-full overflow-visible">
        {shrub(26, 1, "#3f7d22", "#2f6019")}
        {shrub(372, 0.85, "#3f7d22", "#2f6019")}
      </svg>
    </div>
  );
}

/* ---------- soil: strata, pebbles, roots ---------- */
function SoilArt() {
  const pebbles = Array.from({ length: 30 }).map((_, i) => ({
    cx: ((i * 61.7) % 388) + 3, cy: ((i * 43.3) % 300) + 16,
    rx: 1.6 + (i % 3) * 1.2, ry: 1.2 + (i % 2) * 1.0,
    tone: ["#5a4a36", "#6e5c42", "#3d3221"][i % 3], o: 0.4 + (i % 3) * 0.15,
  }));
  const roots = [4, 70, 150, 232, 312, 388].map((x, i) => (
    <path key={i} d={`M${x} 0 q${i % 2 ? 4 : -4} ${10 + (i % 3) * 5} ${i % 2 ? -2 : 3} ${20 + (i % 3) * 6}`} stroke="#241808" strokeWidth="1" fill="none" opacity="0.5" />
  ));
  return (
    <svg viewBox="0 0 394 320" preserveAspectRatio="none" className="absolute inset-0 w-full h-full z-0" aria-hidden>
      <path d="M0 26 Q197 16 394 30 L394 58 Q197 50 0 60 Z" fill="#2f2113" opacity="0.55" />
      <path d="M0 108 Q197 122 394 104 L394 138 Q197 152 0 138 Z" fill="#23190d" opacity="0.55" />
      <path d="M0 196 Q197 186 394 200 L394 230 Q197 220 0 232 Z" fill="#2b1e10" opacity="0.5" />
      {roots}
      {pebbles.map((p, i) => <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={p.tone} opacity={p.o} />)}
    </svg>
  );
}

/* ---------- pinch-to-zoom + pan + double-tap surface ---------- */
function ZoomSurface({ children }: { children: React.ReactNode }) {
  const vp = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const ctl = useRef<{ zoomBy: (d: number) => void; reset: () => void } | null>(null);
  const [z, setZ] = useState(1);

  useEffect(() => {
    const v = vp.current!;
    const el = inner.current!;
    const s = { scale: 1, tx: 0, ty: 0 };
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; cx: number; cy: number; scale: number; tx: number; ty: number } | null = null;
    let pan: { x: number; y: number; tx: number; ty: number } | null = null;
    let lastTap = 0;

    const apply = () => { el.style.transform = `translate(${s.tx}px,${s.ty}px) scale(${s.scale})`; };
    const clamp = () => {
      const vw = v.clientWidth, vh = v.clientHeight;
      const cw = el.offsetWidth * s.scale, ch = el.offsetHeight * s.scale;
      s.tx = cw <= vw ? (vw - cw) / 2 : Math.max(vw - cw, Math.min(0, s.tx));
      s.ty = ch <= vh ? 0 : Math.max(vh - ch, Math.min(0, s.ty));
    };
    const zoomAt = (ns: number, fx: number, fy: number) => {
      ns = Math.max(1, Math.min(4, ns));
      const factor = ns / s.scale;
      s.scale = ns;
      s.tx = fx - (fx - s.tx) * factor;
      s.ty = fy - (fy - s.ty) * factor;
      clamp(); apply(); setZ(ns);
    };
    ctl.current = {
      zoomBy: (d) => zoomAt(s.scale + d, v.clientWidth / 2, v.clientHeight / 2),
      reset: () => zoomAt(1, 0, 0),
    };

    const onStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, scale: s.scale, tx: s.tx, ty: s.ty };
        pan = null;
      } else if (pts.size === 1) {
        const t = e.touches[0];
        pan = { x: t.clientX, y: t.clientY, tx: s.tx, ty: s.ty };
      }
    };
    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (pts.has(t.identifier)) pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      const r = v.getBoundingClientRect();
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ns = Math.max(1, Math.min(4, pinch.scale * (dist / pinch.dist)));
        const factor = ns / pinch.scale;
        const fx = pinch.cx - r.left, fy = pinch.cy - r.top;
        s.scale = ns;
        s.tx = fx - (fx - pinch.tx) * factor;
        s.ty = fy - (fy - pinch.ty) * factor;
        clamp(); apply(); setZ(ns); e.preventDefault();
      } else if (pts.size === 1 && pan) {
        const t = e.touches[0];
        s.tx = pan.tx + (t.clientX - pan.x);
        s.ty = pan.ty + (t.clientY - pan.y);
        clamp(); apply(); e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) pts.delete(t.identifier);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) { const t = e.touches[0]; pan = { x: t.clientX, y: t.clientY, tx: s.tx, ty: s.ty }; }
      if (pts.size === 0) {
        pan = null;
        const now = Date.now();
        const ct = e.changedTouches[0];
        if (now - lastTap < 300 && ct) {
          const r = v.getBoundingClientRect();
          zoomAt(s.scale > 1.2 ? 1 : 2.4, ct.clientX - r.left, ct.clientY - r.top);
        }
        lastTap = now;
      }
    };
    const onWheel = (e: WheelEvent) => {
      const r = v.getBoundingClientRect();
      if (e.ctrlKey) zoomAt(s.scale * (1 - e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      else { s.ty -= e.deltaY; s.tx -= e.deltaX; clamp(); apply(); }
      e.preventDefault();
    };

    v.addEventListener("touchstart", onStart, { passive: false });
    v.addEventListener("touchmove", onMove, { passive: false });
    v.addEventListener("touchend", onEnd, { passive: false });
    v.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      v.removeEventListener("touchstart", onStart);
      v.removeEventListener("touchmove", onMove);
      v.removeEventListener("touchend", onEnd);
      v.removeEventListener("wheel", onWheel);
    };
  }, []);

  const btn =
    "w-[34px] h-[34px] rounded-[9px] border border-white/20 bg-[#0f1f33]/80 text-white flex items-center justify-center shadow-lg backdrop-blur";
  return (
    <div ref={vp} className="flex-1 relative overflow-hidden touch-none" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div ref={inner} className="origin-top-left will-change-transform">{children}</div>
      <div className="absolute right-[10px] bottom-4 flex flex-col gap-[6px] z-20">
        <button onClick={() => ctl.current?.zoomBy(0.6)} className={`${btn} text-[19px] font-bold`}>+</button>
        <button onClick={() => ctl.current?.zoomBy(-0.6)} className={`${btn} text-[19px] font-bold`}>−</button>
      </div>
      {z > 1.02 && (
        <button onClick={() => ctl.current?.reset()} className={`${btn} absolute left-[10px] bottom-4 w-auto px-3 text-[12px] font-semibold z-20`}>Sığdır</button>
      )}
    </div>
  );
}

/* ============================================================ */
export default function HousePreview({ floors, getEntry, title, onBack, muted }: HousePreviewProps): JSX.Element | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const roof = floors.filter((f) => categorize(f.name) === "roof");
  const tower = floors.filter((f) => categorize(f.name) === "tower"); // config: alt → üst
  const under = floors.filter((f) => categorize(f.name) === "under"); // config: Hafriyat → Temel
  const towerTopDown = [...tower].reverse();                          // en yüksek kat tepede

  const overlay = (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0a121d]" style={{ filter: muted ? "grayscale(0.6) brightness(0.85)" : undefined }}>
      {/* header */}
      <div className="shrink-0 bg-[#0f1f33] border-b border-white/5" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="relative h-[52px] flex items-center px-[14px]">
          <button onClick={onBack} className="flex items-center gap-[5px] bg-white/10 text-white rounded-lg px-3 py-[7px] text-[13px] font-semibold">
            <ArrowLeft size={15} /> Geri
          </button>
          <div className="pointer-events-none absolute inset-x-0 text-center text-white text-[15px] font-bold">{title}</div>
        </div>
      </div>

      {/* zoomable body */}
      <ZoomSurface>
        {/* sky */}
        <div className="relative pt-[14px]" style={{ background: "linear-gradient(180deg,#0c1d33 0%,#13314f 60%,#1a3a5c 100%)" }}>
          <SkyArt />
          <div className="relative z-[2]">
            {/* Bina Genel'de çatı katı olmasa bile görsel kapak olarak çatı gelsin */}
            {(roof.length > 0 || title.includes("Bina Genel")) && <Roof />}
            <TowerFrame>
              {roof.map((f) => <TowerFloor key={f.id} floor={f} getEntry={getEntry} />)}
              {towerTopDown.map((f) => <TowerFloor key={f.id} floor={f} getEntry={getEntry} />)}
            </TowerFrame>
          </div>
          <GroundEdge />
        </div>

        {/* soil */}
        <div className="relative pb-[30px]" style={{ background: "linear-gradient(180deg,#3a2c1d 0%,#2a1f14 55%,#1c140c 100%)" }}>
          <SoilArt />
          <div
            className="absolute inset-0 z-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.035) 0 1px, transparent 1px), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.28) 0 1.5px, transparent 1.5px), radial-gradient(circle at 45% 80%, rgba(255,255,255,0.025) 0 1px, transparent 1px)",
              backgroundSize: "38px 38px, 52px 52px, 28px 28px",
            }}
          />
          <div className="relative z-[2] pt-1">
            <UnderFrame>
              {under.map((f) => <UnderFloor key={f.id} floor={f} getEntry={getEntry} />)}
            </UnderFrame>
          </div>
        </div>
      </ZoomSurface>
    </div>
  );

  return createPortal(overlay, document.body);
}
