"use client";

/* Yüzde say-up + bar dolum animasyonu (easeOutCubic). Veri yüklendiğinde 0'dan hedefe akar.
   Tüm platformlarda çalışır (additive — masaüstünde de hoş durur). */

import { useEffect, useRef, useState } from "react";

function useCountUp(target: number, dur = 900) {
  const [v, setV] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, dur]);
  return v;
}

export default function AnimatedProgress({
  pct,
  completed,
  total,
  accent = "text-gray-700",
}: {
  pct: number;
  completed?: number;
  total?: number;
  accent?: string;
}) {
  const shown = useCountUp(Math.max(0, Math.min(100, pct)));
  const barColor =
    pct >= 100 ? "bg-emerald-500" : pct >= 67 ? "bg-emerald-400" : pct >= 34 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-500 font-medium">İlerleme</span>
        <span className={`font-bold tabular-nums ${accent}`}>%{shown}</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-[width] duration-200 ease-out`}
          style={{ width: `${shown}%` }}
        />
      </div>
      {completed != null && total != null && (
        <div className="text-[10px] text-gray-400 mt-1">
          {completed}/{total} iş
        </div>
      )}
    </div>
  );
}
