"use client";

import { useState } from "react";
import { Plus, Search, MessageCircle } from "lucide-react";
import { type Conversation, type ChatUser, convTitle, convAvatar } from "../types";
import Avatar from "./Avatar";

export default function ConversationList({
  conversations,
  selectedId,
  meId,
  me,
  loading,
  onSelect,
  onNew,
  onProfile,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  meId: string;
  me?: ChatUser | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onProfile?: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = conversations.filter((c) =>
    convTitle(c, meId).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={onProfile} title="Profil fotoğrafı" aria-label="Profil" className="active:scale-95 transition">
            <Avatar url={me?.avatarUrl} name={me ? `${me.firstName} ${me.lastName}` : ""} size={34} />
          </button>
          <h1 className="font-semibold text-lg text-gray-900 truncate">Sohbet</h1>
        </div>
        <button
          onClick={onNew}
          className="w-9 h-9 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center hover:opacity-90 flex-shrink-0"
          title="Yeni sohbet"
          aria-label="Yeni sohbet"
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-gray-100 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#1e3a5f]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-gray-400 py-8 text-sm">Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-gray-400 py-12 px-4 text-center">
            <MessageCircle size={32} className="mb-2 opacity-40" />
            <p className="text-sm">Henüz sohbet yok</p>
            <button onClick={onNew} className="mt-3 text-sm text-[#1e3a5f] font-medium">
              Yeni sohbet başlat
            </button>
          </div>
        ) : (
          filtered.map((c) => {
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 border-b border-gray-50 ${
                  selectedId === c.id ? "bg-[#1e3a5f]/5" : ""
                }`}
              >
                <Avatar url={convAvatar(c, meId)} name={convTitle(c, meId)} group={c.isGroup} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{convTitle(c, meId)}</span>
                    {c.unread > 0 && (
                      <span className="bg-[#1e3a5f] text-white text-[11px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1.5 flex-shrink-0">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {c.lastMessage
                      ? c.lastMessage.type === "text"
                        ? c.lastMessage.body
                        : c.lastMessage.type === "image"
                        ? "📷 Fotoğraf"
                        : c.lastMessage.type === "video"
                        ? "📹 Video"
                        : c.lastMessage.type === "audio"
                        ? "🎤 Sesli mesaj"
                        : c.lastMessage.type === "file"
                        ? "📎 " + (c.lastMessage.body || "Dosya")
                        : "📎 Ek"
                      : "Yeni sohbet"}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
