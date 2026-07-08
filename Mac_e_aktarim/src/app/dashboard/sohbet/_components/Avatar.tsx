"use client";

import { useState, useEffect } from "react";
import { Users } from "lucide-react";

function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

const thumb = (u: string) => u + (u.includes("?") ? "&" : "?") + "size=thumb";

/** Yuvarlak avatar — resim varsa onu, yoksa baş harf (grup ise grup ikonu) gösterir. */
export default function Avatar({
  url,
  name,
  group,
  size = 44,
  className = "",
}: {
  url?: string | null;
  name?: string;
  group?: boolean;
  size?: number;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [url]); // url değişince kırık-resim bayrağını sıfırla
  const show = url && !err;
  const isLocal = !!url && (url.startsWith("blob:") || url.startsWith("data:"));
  const src = url ? (isLocal ? url : thumb(url)) : "";
  return (
    <div
      className={`rounded-full bg-[#1a1a2e] text-white flex items-center justify-center font-semibold flex-shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setErr(true)} />
      ) : group ? (
        <Users size={Math.round(size * 0.5)} />
      ) : (
        initialsOf(name || "")
      )}
    </div>
  );
}
