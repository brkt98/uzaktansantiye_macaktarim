"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search, Users, Check, Camera } from "lucide-react";
import { type Conversation, type ChatUser } from "../types";
import Avatar from "./Avatar";

export default function NewConversationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Conversation) => void;
}) {
  const [mode, setMode] = useState<"single" | "group">("single");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ChatUser[]>([]);
  const [groupName, setGroupName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/chat/users?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => setUsers(d.users || []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const start1to1 = async (userId: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [userId] }),
      });
      if (res.ok) {
        const d = await res.json();
        onCreated(d.conversation);
      }
    } finally {
      setCreating(false);
    }
  };

  const toggle = (u: ChatUser) =>
    setSelected((prev) => (prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]));

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const createGroup = async () => {
    if (creating || !groupName.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected.map((u) => u.id), title: groupName.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d?.error || "Grup oluşturulamadı"); return; }
      let conv = d.conversation as Conversation;
      if (photoFile && conv) {
        try {
          const fd = new FormData();
          fd.append("file", photoFile);
          fd.append("target", conv.id);
          const ar = await fetch("/api/chat/avatar", { method: "POST", body: fd });
          if (ar.ok) { const ad = await ar.json(); conv = { ...conv, avatarUrl: ad.url }; }
        } catch { /* foto opsiyonel */ }
      }
      onCreated(conv);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Başlık */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{mode === "group" ? "Yeni grup" : "Yeni sohbet"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Kapat"><X size={22} /></button>
        </div>

        {mode === "single" ? (
          <>
            <button
              onClick={() => setMode("group")}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-left flex-shrink-0"
            >
              <span className="w-10 h-10 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center flex-shrink-0"><Users size={20} /></span>
              <span className="font-medium text-[#1e3a5f]">Yeni grup oluştur</span>
            </button>
            <div className="p-3 border-b border-gray-100 flex-shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kişi ara…"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-gray-100 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {users.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">Kullanıcı bulunamadı</div>
              ) : (
                users.map((u) => (
                  <button key={u.id} onClick={() => start1to1(u.id)} disabled={creating}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-50">
                    <Avatar url={u.avatarUrl} name={`${u.firstName} ${u.lastName}`} size={40} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-500 truncate">@{u.username}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {/* Grup adı + foto */}
            <div className="flex items-center gap-3 p-3 border-b border-gray-100 flex-shrink-0">
              <button onClick={() => photoRef.current?.click()} className="relative flex-shrink-0" aria-label="Grup fotoğrafı">
                <Avatar url={photoPreview} group size={48} />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center border-2 border-white"><Camera size={12} /></span>
              </button>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Grup adı"
                className="flex-1 h-10 px-3 rounded-lg bg-gray-100 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            {/* Seçili çipler */}
            {selected.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-gray-100 flex-shrink-0">
                {selected.map((u) => (
                  <button key={u.id} onClick={() => toggle(u)} className="flex items-center gap-1 bg-[#1e3a5f]/10 text-[#1e3a5f] rounded-full pl-1 pr-2 py-1 flex-shrink-0">
                    <Avatar url={u.avatarUrl} name={`${u.firstName} ${u.lastName}`} size={22} />
                    <span className="text-xs font-medium whitespace-nowrap">{u.firstName}</span>
                    <X size={13} />
                  </button>
                ))}
              </div>
            )}
            <div className="p-3 border-b border-gray-100 flex-shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Üye ekle…"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-gray-100 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {users.map((u) => {
                const on = selected.some((x) => x.id === u.id);
                return (
                  <button key={u.id} onClick={() => toggle(u)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
                    <Avatar url={u.avatarUrl} name={`${u.firstName} ${u.lastName}`} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate text-sm">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-500 truncate">@{u.username}</p>
                    </div>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${on ? "bg-[#1e3a5f] text-white" : "border-2 border-gray-300"}`}>
                      {on && <Check size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-200 flex-shrink-0">
              <button onClick={createGroup} disabled={creating || !groupName.trim() || selected.length === 0}
                className="w-full h-11 rounded-lg bg-[#1e3a5f] text-white font-medium disabled:opacity-40 active:scale-[0.99] transition">
                {creating ? "Oluşturuluyor…" : `Grup oluştur${selected.length ? ` (${selected.length})` : ""}`}
              </button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          </>
        )}
      </div>
    </div>
  );
}
