"use client";

import { Play, Check, CheckCheck } from "lucide-react";
import type { ChatMessage } from "../types";

const thumb = (u: string) => u + (u.includes("?") ? "&" : "?") + "size=thumb";
function fmt(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

function Cell({ m, onOpen, extra }: { m: ChatMessage; onOpen: (m: ChatMessage) => void; extra?: number }) {
  return (
    <button type="button" onClick={() => onOpen(m)} className="relative overflow-hidden bg-black/10 w-full h-full block">
      {m.type === "video" ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={m.attachmentUrl || ""} preload="metadata" muted playsInline className="w-full h-full object-cover bg-black pointer-events-none" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb(m.attachmentUrl || "")} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
      )}
      {m.type === "video" && !extra && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center"><Play size={18} className="text-white ml-0.5" fill="currentColor" /></span>
        </span>
      )}
      {extra ? (
        <span className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-2xl font-semibold">+{extra}</span>
      ) : null}
    </button>
  );
}

/** WhatsApp tarzı çoklu medya albümü (2/3/4/4+). Her hücre tıklanınca viewer açılır. */
export default function MediaAlbum({
  items,
  mine,
  status,
  onOpen,
}: {
  items: ChatMessage[];
  mine: boolean;
  status?: "sent" | "delivered" | "read";
  onOpen: (m: ChatMessage) => void;
}) {
  const n = items.length;
  const last = items[n - 1];
  const tick = mine ? (
    status === "read" ? <CheckCheck size={15} className="text-sky-300" />
    : status === "delivered" ? <CheckCheck size={15} className="text-white/90" />
    : <Check size={15} className="text-white/90" />
  ) : null;

  let grid;
  if (n === 2) {
    grid = (
      <div className="grid grid-cols-2 gap-0.5">
        {items.map((m) => <div key={m.tempId ?? m.id} className="aspect-square"><Cell m={m} onOpen={onOpen} /></div>)}
      </div>
    );
  } else if (n === 3) {
    grid = (
      <div className="grid grid-cols-2 grid-rows-2 gap-0.5 h-56">
        <div className="row-span-2"><Cell m={items[0]} onOpen={onOpen} /></div>
        <div><Cell m={items[1]} onOpen={onOpen} /></div>
        <div><Cell m={items[2]} onOpen={onOpen} /></div>
      </div>
    );
  } else {
    const shown = items.slice(0, 4);
    grid = (
      <div className="grid grid-cols-2 grid-rows-2 gap-0.5 h-56">
        {shown.map((m, i) => <div key={m.tempId ?? m.id}><Cell m={m} onOpen={onOpen} extra={i === 3 && n > 4 ? n - 4 : undefined} /></div>)}
      </div>
    );
  }

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`relative w-56 max-w-[80%] rounded-2xl overflow-hidden shadow-sm ${mine ? "rounded-br-sm" : "rounded-bl-sm"}`}>
        {grid}
        <div className="absolute bottom-1 right-1.5 flex items-center gap-1 bg-black/40 rounded-full px-1.5 py-0.5">
          <span className="text-[10px] text-white">{fmt(last.createdAt)}</span>
          {tick}
        </div>
      </div>
    </div>
  );
}
