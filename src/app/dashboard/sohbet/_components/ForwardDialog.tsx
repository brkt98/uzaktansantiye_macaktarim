"use client";

import { useState } from "react";
import { X, Search } from "lucide-react";
import { type Conversation, convTitle, convAvatar } from "../types";
import Avatar from "./Avatar";

/** Mesaj iletme: hedef konuşma seçici. */
export default function ForwardDialog({
  conversations,
  meId,
  busy,
  title = "İlet",
  onPick,
  onClose,
}: {
  conversations: Conversation[];
  meId: string;
  busy?: boolean;
  title?: string;
  onPick: (conversationId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = conversations.filter((c) => convTitle(c, meId).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[96] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Kapat"><X size={22} /></button>
        </div>
        <div className="p-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sohbet ara…"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-gray-100 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#1e3a5f]" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">Sohbet bulunamadı</div>
          ) : (
            filtered.map((c) => (
              <button key={c.id} onClick={() => onPick(c.id)} disabled={busy}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-50">
                <Avatar url={convAvatar(c, meId)} name={convTitle(c, meId)} group={c.isGroup} size={40} />
                <span className="font-medium text-gray-900 truncate">{convTitle(c, meId)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
