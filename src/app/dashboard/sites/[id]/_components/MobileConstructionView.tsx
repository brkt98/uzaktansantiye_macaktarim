"use client";

/* ============================================================
   Mobil İnşaat Tablosu görünümü (Kaba / Bina Genel / Belgeler)
   Telefonda 2B tablo (kat × iş) yerine:
     • Kat seçimi <select> (enumerated)
     • Seçili katın işleri 2 sütun buton (durum renkli)
     • "Önizle" → tüm tablo pinch-zoom ile (focal-zoom, clamp)
   Masaüstü/iPad mevcut tabloyu kullanmaya devam eder (bu bileşen sadece isMobile'da render edilir).
   ============================================================ */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Eye } from "lucide-react";
import HousePreview from "./HousePreview";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type AnyWork = { id: string; name: string; order?: number };
type AnyFloor = { id: string; name: string; works?: AnyWork[] };
type Entry = { status?: string; mediaCount?: number } | undefined;

function cellColor(status: string, hasStarted: boolean, muted: boolean) {
  if (muted) {
    if (status === "COMPLETED") return "bg-green-400 text-white";
    if (hasStarted) return "bg-yellow-400 text-white";
    return "bg-gray-100 text-gray-500 border border-gray-200";
  }
  if (status === "COMPLETED") return "bg-green-500 text-white";
  if (hasStarted) return "bg-yellow-500 text-white";
  return "bg-gray-100 text-gray-600 border border-gray-200";
}

function stripPrefix(floorName: string, workName: string) {
  const prefix = floorName + " - ";
  return workName.startsWith(prefix) ? workName.slice(prefix.length) : workName;
}

/* Tüm tabloyu önizleme: genişliğe sığar + iki parmakla yakınlaştır/uzaklaştır + sürükle (focal-zoom). */
function MobileTablePreview({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1, h: 1, cw: 1, ch: 1 });
  const [base, setBase] = useState(1);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const t = useRef<{ dist: number; scale: number; px: number; py: number; cx: number; cy: number } | null>(null);
  const [animate, setAnimate] = useState(true);

  const fitScale = (w: number, h: number, cw: number, ch: number) => Math.min(1, w / cw, h / ch);
  const centerPan = (s: number, w: number, h: number, cw: number, ch: number) => ({
    x: Math.max(0, (w - cw * s) / 2),
    y: Math.max(0, (h - ch * s) / 2),
  });
  const clampPan = (px: number, py: number, s: number, w: number, h: number, cw: number, ch: number) => {
    const cwS = cw * s, chS = ch * s;
    const cx = cwS <= w ? (w - cwS) / 2 : Math.min(0, Math.max(w - cwS, px));
    const cy = chS <= h ? (h - chS) / 2 : Math.min(0, Math.max(h - chS, py));
    return { x: cx, y: cy };
  };

  useIsoLayoutEffect(() => {
    const measure = () => {
      const w = wrapRef.current?.clientWidth || 1;
      const h = wrapRef.current?.clientHeight || 1;
      const cw = innerRef.current?.scrollWidth || 1;
      const ch = innerRef.current?.scrollHeight || 1;
      setDims({ w, h, cw, ch });
      const b = fitScale(w, h, cw, ch);
      setBase(b);
      setScale(b);
      setPan(centerPan(b, w, h, cw, ch));
    };
    measure();
    const id = window.setTimeout(measure, 120);
    window.addEventListener("resize", measure);
    return () => { window.clearTimeout(id); window.removeEventListener("resize", measure); };
  }, []);

  const localPoint = (clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { mx: clientX - (r?.left || 0), my: clientY - (r?.top || 0) };
  };

  const content = (
    <div className="fixed inset-0 z-[120] bg-[#0f2238] flex flex-col" style={{ touchAction: "none" }}>
      <div className="modal-safe-top flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-medium text-sm">
          <ArrowLeft size={18} /> Geri
        </button>
        <span className="font-semibold truncate px-2">{title}</span>
        <span className="w-[68px] shrink-0" />
      </div>
      <div
        ref={wrapRef}
        className="flex-1 overflow-hidden"
        onTouchStart={(e) => {
          setAnimate(false);
          if (e.touches.length === 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY;
            const { mx, my } = localPoint(
              (e.touches[0].clientX + e.touches[1].clientX) / 2,
              (e.touches[0].clientY + e.touches[1].clientY) / 2,
            );
            t.current = { dist: Math.sqrt(dx * dx + dy * dy), scale, px: pan.x, py: pan.y, cx: mx, cy: my };
          } else if (e.touches.length === 1) {
            const { mx, my } = localPoint(e.touches[0].clientX, e.touches[0].clientY);
            t.current = { dist: 0, scale, px: pan.x, py: pan.y, cx: mx, cy: my };
          }
        }}
        onTouchMove={(e) => {
          if (!t.current) return;
          if (e.touches.length === 2 && t.current.dist > 0) {
            e.preventDefault();
            const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY;
            const d = Math.sqrt(dx * dx + dy * dy);
            const sPrev = t.current.scale;
            const sNew = Math.min(base * 5, Math.max(base, sPrev * (d / t.current.dist)));
            const k = 1 - sNew / sPrev;
            const nx = t.current.px + (t.current.cx - t.current.px) * k;
            const ny = t.current.py + (t.current.cy - t.current.py) * k;
            const c = clampPan(nx, ny, sNew, dims.w, dims.h, dims.cw, dims.ch);
            setScale(sNew);
            setPan(c);
          } else if (e.touches.length === 1) {
            e.preventDefault();
            const { mx, my } = localPoint(e.touches[0].clientX, e.touches[0].clientY);
            const nx = t.current.px + (mx - t.current.cx);
            const ny = t.current.py + (my - t.current.cy);
            setPan(clampPan(nx, ny, scale, dims.w, dims.h, dims.cw, dims.ch));
          }
        }}
        onTouchEnd={(e) => {
          if (e.touches.length === 0) {
            setAnimate(true);
            if (scale <= base * 1.02) {
              setScale(base);
              setPan(centerPan(base, dims.w, dims.h, dims.cw, dims.ch));
            } else {
              setPan((p) => clampPan(p.x, p.y, scale, dims.w, dims.h, dims.cw, dims.ch));
            }
            t.current = null;
          } else if (e.touches.length === 1) {
            const { mx, my } = localPoint(e.touches[0].clientX, e.touches[0].clientY);
            t.current = { dist: 0, scale, px: pan.x, py: pan.y, cx: mx, cy: my };
          }
        }}
      >
        <div ref={innerRef} style={{ width: "max-content", transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "top left", transition: animate ? "transform 0.18s ease-out" : "none" }}>
          {children}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}

/* Önizleme içeriği: kat=satır, iş=hücre tam tablo (salt görüntü). */
function OverviewTable({ floors, getEntry, muted }: { floors: AnyFloor[]; getEntry: (id: string) => Entry; muted: boolean }) {
  let n = 0;
  return (
    <table className="w-max border-collapse pointer-events-none">
      <tbody>
        {floors.map((floor, fi) => (
          <tr key={floor.id} className={fi < floors.length - 1 ? "border-b-[3px] border-[#1e3a5f]/30" : ""}>
            <td className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-base whitespace-nowrap align-middle min-w-[130px] sticky left-0 z-10">{floor.name}</td>
            {(floor.works || []).map((work) => {
              n++;
              const entry = getEntry(work.id);
              const hasMedia = !!entry && (entry.mediaCount || 0) > 0;
              const status = entry?.status || "NOT_STARTED";
              const hasStarted = status !== "NOT_STARTED" || hasMedia;
              const dn = stripPrefix(floor.name, work.name);
              return (
                <td key={work.id} className="p-1 h-px align-top w-[9rem] min-w-[9rem]">
                  <div className={`w-full h-full min-h-[3.75rem] px-2.5 py-2 rounded-lg text-sm font-semibold leading-snug flex items-center gap-2 ${cellColor(status, hasStarted, muted)}`}>
                    <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${hasStarted ? "bg-white/30 text-white" : "bg-[#1e3a5f] text-white"}`}>{n}</span>
                    <span className="flex-1 text-left">
                      <span className="block leading-snug">{dn}</span>
                      {hasMedia && <span className="block text-[11px] opacity-80 mt-0.5">({entry!.mediaCount})</span>}
                    </span>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MobileConstructionView({
  floors,
  getEntry,
  onCellClick,
  title = "Tablo",
  readOnly = false,
  muted = false,
}: {
  floors: AnyFloor[];
  getEntry: (id: string) => Entry;
  onCellClick?: (work: AnyWork, floor: AnyFloor) => void;
  title?: string;
  readOnly?: boolean;
  muted?: boolean;
}) {
  const [floorId, setFloorId] = useState<string>(floors[0]?.id ?? "");
  const [preview, setPreview] = useState(false);
  const selFloor = floors.find((f) => f.id === floorId) || floors[0];
  if (!selFloor) return null;

  let offset = 0;
  for (const f of floors) {
    if (f.id === selFloor.id) break;
    offset += (f.works || []).length;
  }
  const works = selFloor.works || [];

  // HousePreview için global iş numarası (masaüstü tablo + ana floor-select ile aynı: 1..N kesintisiz).
  // Mevcut w.order per-kat 0-indeksli gelebiliyor → EZ, global n kullan.
  const floorsForHouse = (() => {
    let n = 0;
    return floors.map((f) => ({
      ...f,
      works: (f.works || []).map((w) => { n++; return { ...w, order: n }; }),
    }));
  })();

  return (
    <div className="space-y-3">
      {/* Kat seçimi (enumerated) + Önizle */}
      <div className="flex items-center gap-2">
        <select
          value={selFloor.id}
          onChange={(e) => setFloorId(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#1e3a5f] shadow-sm"
        >
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {(f.works || []).length} iş
            </option>
          ))}
        </select>
        {/* Belgeler'de ev kesiti önizlemesi anlamsız → gizle */}
        {title !== "Belgeler" && (
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="pressable shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold active:scale-95 transition-all shadow-sm"
          >
            <Eye size={16} /> Önizle
          </button>
        )}
      </div>

      {/* Seçili katın işleri — 2 sütun buton */}
      {works.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-gray-200 text-gray-400 text-sm">
          Bu katta iş yok
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {works.map((work, i) => {
            const num = offset + i + 1;
            const entry = getEntry(work.id);
            const hasMedia = !!entry && (entry.mediaCount || 0) > 0;
            const status = entry?.status || "NOT_STARTED";
            const hasStarted = status !== "NOT_STARTED" || hasMedia;
            const dn = stripPrefix(selFloor.name, work.name);
            const clickable = !readOnly || hasMedia;
            return (
              <button
                key={work.id}
                type="button"
                disabled={!clickable}
                onClick={() => { if (clickable) onCellClick?.(work, selFloor); }}
                className={`construction-cell-btn mob-fade-up w-full px-3 py-3 rounded-xl text-sm font-semibold transition-all leading-tight flex items-center gap-2 ${cellColor(status, hasStarted, muted)} ${clickable ? "pressable active:scale-95" : "cursor-default"}`}
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              >
                <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${hasStarted ? "bg-white/30 text-white" : "bg-[#1e3a5f] text-white"}`}>{num}</span>
                <span className="flex-1 text-left">
                  <span className="block">{dn}</span>
                  {hasMedia && <span className="block text-[11px] opacity-80 mt-0.5">({entry!.mediaCount})</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {preview && (
        <HousePreview floors={floorsForHouse} getEntry={getEntry} muted={muted} title={title} onBack={() => setPreview(false)} />
      )}
    </div>
  );
}
