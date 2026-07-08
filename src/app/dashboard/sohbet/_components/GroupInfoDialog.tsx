"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Pencil, Check, UserPlus, LogOut, Search, X, Images, ChevronRight } from "lucide-react";
import { type Conversation, type ChatUser } from "../types";
import Avatar from "./Avatar";
import ConfirmDialog from "./ConfirmDialog";
import GroupMediaDialog from "./GroupMediaDialog";

type ConfirmAction = { kind: "remove"; userId: string; name: string } | { kind: "leave" } | null;

export default function GroupInfoDialog({
  conversation,
  meId,
  onClose,
  onUpdated,
  onLeft,
}: {
  conversation: Conversation;
  meId: string;
  onClose: () => void;
  onUpdated: (c: Conversation) => void;
  onLeft: () => void;
}) {
  const [conv, setConv] = useState<Conversation>(conversation);
  const isAdmin = conv.participants.find((p) => p.userId === meId)?.role === "admin";
  const isCreator = conv.createdBy === meId;
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(conv.title || "");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ChatUser[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [showMedia, setShowMedia] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const apply = (c: Conversation) => { setConv(c); onUpdated(c); };

  // Dışarıdan (socket/yeni mesaj) gelen prop güncellemesini yerel state'e yansıt
  useEffect(() => { setConv(conversation); }, [conversation]);

  useEffect(() => {
    if (!adding) return;
    const t = setTimeout(() => {
      fetch(`/api/chat/users?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => setResults(d.users || []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q, adding]);

  const saveName = async () => {
    const t = name.trim();
    if (!t || t === conv.title) { setEditName(false); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conv.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t }),
      });
      const d = await res.json();
      if (res.ok) { apply(d.conversation); setEditName(false); } else alert(d?.error || "Kaydedilemedi");
    } finally { setBusy(false); }
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("target", conv.id);
      const res = await fetch("/api/chat/avatar", { method: "POST", body: fd });
      const d = await res.json();
      if (res.ok) apply({ ...conv, avatarUrl: d.url });
      else alert(d?.error || "Yüklenemedi");
    } finally { setBusy(false); }
  };

  const addMember = async (u: ChatUser) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conv.id}/participants`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: [u.id] }),
      });
      const d = await res.json();
      if (res.ok) { apply(d.conversation); setQ(""); }
      else alert(d?.error || "Eklenemedi");
    } finally { setBusy(false); }
  };

  const removeMember = async (userId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conv.id}/participants`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
      });
      const d = await res.json();
      if (res.ok && d.conversation) apply(d.conversation);
      else if (!res.ok) alert(d?.error || "Çıkarılamadı");
    } finally { setBusy(false); }
  };

  const doLeave = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conv.id}/participants`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: meId }),
      });
      if (res.ok) onLeft();
      else { const d = await res.json(); alert(d?.error || "Ayrılınamadı"); }
    } finally { setBusy(false); }
  };

  const runConfirm = () => {
    const a = confirmAction;
    setConfirmAction(null);
    if (!a) return;
    if (a.kind === "remove") removeMember(a.userId);
    else if (a.kind === "leave") doLeave();
  };

  const existingIds = new Set(conv.participants.map((p) => p.userId));
  const addable = results.filter((u) => !existingIds.has(u.id)).slice(0, 8);
  const sorted = [...conv.participants].sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1));

  return (
    <div className="fixed inset-0 z-[80] bg-gray-50 flex flex-col" style={{ height: "100dvh" }}>
      <div className="modal-safe-top flex items-center gap-3 px-4 bg-[#1e3a5f] text-white flex-shrink-0" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "0.75rem" }}>
        <button onClick={onClose} aria-label="Geri" className="active:scale-90 transition"><ArrowLeft size={22} /></button>
        <h2 className="font-semibold">Grup bilgisi</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar + ad */}
        <div className="flex flex-col items-center gap-3 bg-white px-6 py-6 border-b border-gray-100">
          <div className="relative">
            <Avatar url={conv.avatarUrl} name={conv.title || "Grup"} group size={104} />
            {isAdmin && (
              <button onClick={() => photoRef.current?.click()} disabled={busy}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center border-2 border-white shadow disabled:opacity-50 active:scale-95 transition" aria-label="Fotoğraf değiştir">
                <Camera size={16} />
              </button>
            )}
          </div>
          {editName ? (
            <div className="flex items-center gap-2 w-full max-w-xs">
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
                className="flex-1 h-10 px-3 rounded-lg border border-gray-300 text-center font-semibold outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              <button onClick={saveName} disabled={busy} className="w-10 h-10 rounded-lg bg-[#1e3a5f] text-white flex items-center justify-center disabled:opacity-50"><Check size={18} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-gray-900">{conv.title || "Grup"}</h3>
              {isAdmin && <button onClick={() => { setName(conv.title || ""); setEditName(true); }} className="text-gray-400 hover:text-[#1e3a5f]" aria-label="Adı düzenle"><Pencil size={16} /></button>}
            </div>
          )}
          <p className="text-sm text-gray-500">{conv.participants.length} üye</p>
        </div>

        {/* Medya, bağlantı ve belgeler */}
        <button onClick={() => setShowMedia(true)} className="w-full flex items-center gap-3 px-4 py-3.5 bg-white mt-2 hover:bg-gray-50 active:bg-gray-100 transition">
          <span className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center flex-shrink-0"><Images size={18} /></span>
          <span className="flex-1 text-left text-gray-900 font-medium text-sm">Medya, bağlantı ve belgeler</span>
          <ChevronRight size={18} className="text-gray-400" />
        </button>

        {/* Üyeler / Üye ekle */}
        <div className="bg-white mt-2">
          <div className="flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>{adding ? "Yeni üye ekle" : "Üyeler"}</span>
            {isAdmin && (
              <button onClick={() => { setAdding((v) => !v); setQ(""); }} className="flex items-center gap-1 text-[#1e3a5f] normal-case text-sm font-medium">
                {adding ? <><X size={15} /> Kapat</> : <><UserPlus size={15} /> Üye ekle</>}
              </button>
            )}
          </div>

          {/* Üye ekleme — ayrı tonlu kutu (mevcut üyelerle karışmaz) */}
          {adding && isAdmin && (
            <div className="bg-[#1e3a5f]/5 border-y border-[#1e3a5f]/10 px-3 py-2.5">
              <div className="relative mb-1.5">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Eklenecek kişiyi ara…"
                  className="w-full h-9 pl-9 pr-3 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              {addable.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">{q ? "Eklenebilecek kişi yok" : "Aramaya başlayın"}</p>
              ) : (
                addable.map((u) => (
                  <button key={u.id} onClick={() => addMember(u)} disabled={busy}
                    className="w-full flex items-center gap-3 px-1.5 py-2 text-left hover:bg-white/70 rounded-lg disabled:opacity-50">
                    <Avatar url={u.avatarUrl} name={`${u.firstName} ${u.lastName}`} size={36} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">{u.firstName} {u.lastName}</span>
                      <span className="block text-xs text-gray-500 truncate">@{u.username}</span>
                    </span>
                    <UserPlus size={17} className="text-[#1e3a5f] flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* Mevcut katılımcılar başlığı (ekleme modunda ayrım net olsun) */}
          {adding && (
            <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Mevcut katılımcılar ({conv.participants.length})
            </div>
          )}

          {sorted.map((p) => (
            <div key={p.userId} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50">
              <Avatar url={p.user.avatarUrl} name={`${p.user.firstName} ${p.user.lastName}`} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate text-sm">
                  {p.user.firstName} {p.user.lastName} {p.userId === meId && <span className="text-gray-400">(Sen)</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">@{p.user.username}</p>
              </div>
              {p.role === "admin" && <span className="text-[11px] font-medium text-[#1e3a5f] bg-[#1e3a5f]/10 px-2 py-0.5 rounded-full flex-shrink-0">Yönetici</span>}
              {isAdmin && p.userId !== meId && (p.role !== "admin" || isCreator) && (
                <button
                  onClick={() => setConfirmAction({ kind: "remove", userId: p.userId, name: `${p.user.firstName} ${p.user.lastName}`.trim() })}
                  disabled={busy} className="text-gray-300 hover:text-red-600 disabled:opacity-50 flex-shrink-0" aria-label="Çıkar"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Ayrıl */}
        <div className="p-4">
          <button onClick={() => setConfirmAction({ kind: "leave" })} disabled={busy} className="w-full flex items-center justify-center gap-2 h-11 rounded-lg text-red-600 bg-white border border-red-100 font-medium disabled:opacity-50 active:scale-[0.99] transition">
            <LogOut size={18} /> Gruptan ayrıl
          </button>
        </div>
      </div>

      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.kind === "leave" ? "Gruptan ayrıl" : "Üyeyi çıkar"}
          message={confirmAction.kind === "leave"
            ? "Bu gruptan ayrılmak istediğinize emin misiniz?"
            : `${confirmAction.name} kişisini gruptan çıkarmak istediğinize emin misiniz?`}
          confirmLabel={confirmAction.kind === "leave" ? "Ayrıl" : "Çıkar"}
          danger
          onConfirm={runConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {showMedia && <GroupMediaDialog conversationId={conv.id} onClose={() => setShowMedia(false)} />}
    </div>
  );
}
