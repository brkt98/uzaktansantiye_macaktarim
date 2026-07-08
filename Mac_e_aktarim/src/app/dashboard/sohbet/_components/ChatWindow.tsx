"use client";

import { useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
import { ArrowLeft, Phone, Video, Send, Paperclip, Camera, Mic, Trash2, X, Image as ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import { useUser } from "../../layout";
import { type Conversation, type ChatMessage, convTitle, groupReactions } from "../types";
import { downloadFile } from "@/lib/downloadFile";
import { takeNativePhoto } from "@/lib/nativeCamera";
import { hapticTap, hapticBuzz } from "@/lib/haptics";
import MessageBubble from "./MessageBubble";
import CameraDialog from "../../satis/_components/CameraDialog";
import MediaAlbum from "./MediaAlbum";
import Avatar from "./Avatar";
import GroupInfoDialog from "./GroupInfoDialog";
import MessageActionSheet from "./MessageActionSheet";
import ForwardDialog from "./ForwardDialog";
import ChatMediaViewer, { type ChatMediaItem } from "./ChatMediaViewer";

const PdfViewer = lazy(() => import("@/components/PdfViewer"));

const isPdfUrl = (u: string, name?: string) =>
  u.toLowerCase().split("?")[0].endsWith(".pdf") || !!name?.toLowerCase().endsWith(".pdf");

const newTempId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const replyPreviewText = (m: ChatMessage) =>
  m.type === "image" ? "📷 Fotoğraf" : m.type === "video" ? "📹 Video" : m.type === "audio" ? "🎤 Sesli mesaj" : m.type === "file" ? "📎 " + (m.body || "Dosya") : m.body;

type SendPayload = { body: string; type?: string; attachmentUrl?: string; replyToId?: string; forwarded?: boolean };

export default function ChatWindow({
  conversation,
  meId,
  isTablet,
  onBack,
  onUpdated,
  onLeft,
  conversations,
  onOpenConversation,
}: {
  conversation: Conversation;
  meId: string;
  isTablet: boolean;
  onBack: () => void;
  onUpdated?: (c: Conversation) => void;
  onLeft?: (id: string) => void;
  conversations?: Conversation[];
  onOpenConversation?: (id: string) => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<ChatMessage | null>(null);
  const [forwardBusy, setForwardBusy] = useState(false);
  const { socket } = useSocket();
  const router = useRouter();
  const me = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const convId = conversation.id;

  const scrollToEnd = () =>
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

  // Okundu: socket ile (realtime hem /read'i çağırır HEM "read" yayınlar → karşı taraf anında mavi tik).
  const markRead = useCallback(() => {
    // Uygulama ARKA PLANDAYSA (görünür değil) okundu YAPMA — kullanıcı gerçekten bakmıyor.
    // (Arka planda açık WebView, gelen mesajı sahte "okundu" yapmasın.) Öne gelince işaretlenir.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (socket && socket.connected) socket.emit("message:read", { conversationId: convId });
    else fetch(`/api/chat/conversations/${convId}/read`, { method: "POST" }).catch(() => {});
    window.dispatchEvent(new Event("chat:read"));
  }, [socket, convId]);

  // Arka planda PUSH'la gelip (socket kopuk olabilir) listeye girmemiş mesajları geri çek (backfill).
  // Bildirimden açık sohbete dönünce kaçan mesaj görünsün. Sadece EKLER, var olanı silmez.
  const refetch = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat/conversations/${convId}/messages?limit=50`);
      if (!r.ok) return;
      const d = await r.json();
      const fetched: ChatMessage[] = d.messages || [];
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        const missing = fetched.filter((m) => !have.has(m.id));
        if (missing.length === 0) return prev;
        const merged = [...prev, ...missing];
        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return merged;
      });
    } catch {
      /* yoksay */
    }
  }, [convId]);

  // Geçmiş
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/chat/conversations/${convId}/messages?limit=50`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (active) {
          setMessages(d.messages || []);
          setLoading(false);
          scrollToEnd();
        }
      });
    return () => {
      active = false;
    };
  }, [convId]);

  // Odaya katıl + okundu + canlı dinleyiciler (yeni mesaj, okundu, ulaştı)
  useEffect(() => {
    if (!socket) return;
    socket.emit("conversation:join", { conversationId: convId });
    markRead();

    // Uygulama ÖNE gelince: kaçan mesajları geri çek (backfill) + okundu yap.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      refetch();
      markRead();
    };
    document.addEventListener("visibilitychange", onVisible);

    const onNew = (payload: { message: ChatMessage; conversationId: string; tempId?: string }) => {
      if (payload.conversationId !== convId) return;
      const { message, tempId } = payload;
      setMessages((prev) => {
        if (tempId) {
          const i = prev.findIndex((m) => m.tempId === tempId);
          if (i !== -1) {
            const copy = [...prev];
            copy[i] = { ...message, tempId, status: message.senderId === meId ? "sent" : undefined };
            return copy;
          }
        }
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      scrollToEnd();
      if (message.senderId !== meId) markRead();
    };
    const onRead = (p: { conversationId: string; userId?: string }) => {
      if (p.conversationId !== convId) return;
      if (p.userId && p.userId === meId) return; // kendi okuma event'im → kendi mesajlarımı yanlış işaretleme
      setMessages((prev) => prev.map((m) => (m.senderId === meId ? { ...m, status: "read" } : m)));
    };
    const onDelivered = (p: { conversationId: string; messageId?: string }) => {
      if (p.conversationId !== convId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === meId && m.status !== "read" && (!p.messageId || m.id === p.messageId)
            ? { ...m, status: "delivered" }
            : m
        )
      );
    };

    const onReaction = (p: { messageId: string; reactions: { emoji: string; userIds: string[] }[] }) => {
      setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, reactions: groupReactions(p.reactions, meId) } : m)));
    };
    const onDeleted = (p: { messageId: string }) => {
      setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, deleted: true, type: "deleted", body: "", attachmentUrl: null, reactions: [], replyTo: null } : m)));
    };

    socket.on("message:new", onNew);
    socket.on("read", onRead);
    socket.on("delivered", onDelivered);
    socket.on("reaction", onReaction);
    socket.on("deleted", onDeleted);
    return () => {
      socket.off("message:new", onNew);
      socket.off("read", onRead);
      socket.off("delivered", onDelivered);
      socket.off("reaction", onReaction);
      socket.off("deleted", onDeleted);
      document.removeEventListener("visibilitychange", onVisible);
      socket.emit("conversation:leave", { conversationId: convId });
    };
  }, [socket, convId, meId, markRead, refetch]);

  // ── Güvenilir gönderim: socket(ack) + zaman aşımı/başarısızlıkta REST yedeği (veri kaybı YOK) ──
  const restFallback = useCallback(async (payload: SendPayload, tempId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...d.message, tempId, status: "sent" } : m)));
    } catch {
      setMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m)));
    }
  }, [convId]);

  const sendPayload = useCallback((payload: SendPayload, optimistic: ChatMessage) => {
    const tempId = optimistic.tempId as string;
    setMessages((prev) => [...prev, optimistic]);
    scrollToEnd();
    if (socket && socket.connected) {
      // Socket birincil yol: realtime hem KALICI yazar hem CANLI yayınlar (ack döner).
      let done = false;
      // Zaman aşımı → "başarısız" işaretle (REST yedeği DEĞİL — aksi halde realtime de yazmışsa duplicate olur).
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        pendingTimers.current.delete(timer);
        setMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m)));
      }, 12000);
      pendingTimers.current.add(timer);
      socket.emit("message:send", { conversationId: convId, ...payload, tempId }, (res: { ok?: boolean; message?: ChatMessage } | undefined) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        pendingTimers.current.delete(timer);
        if (res && res.ok && res.message) {
          setMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...res.message!, tempId, status: "sent" } : m)));
        } else {
          // ack ok:false → realtime KALICI YAZAMADI → REST ile yaz (duplicate riski yok).
          restFallback(payload, tempId);
        }
      });
    } else {
      // Socket yok → REST ile kalıcı yaz (veri kaybı yok; canlı yayın olmaz, karşı taraf yenileyince görür).
      restFallback(payload, tempId);
    }
  }, [socket, convId, restFallback]);

  const send = useCallback(() => {
    const body = text.trim();
    if (!body) return;
    hapticTap();
    const tempId = newTempId();
    const r = replyTo;
    setText("");
    setReplyTo(null);
    const replyPreview = r
      ? { id: r.id, type: r.type, body: r.body, senderName: r.senderId === meId ? "Sen" : (r.sender ? `${r.sender.firstName} ${r.sender.lastName}`.trim() : ""), deleted: false }
      : null;
    sendPayload(
      { body, replyToId: r?.id },
      { id: tempId, tempId, conversationId: convId, senderId: meId, type: "text", body, createdAt: new Date().toISOString(), pending: true, replyToId: r?.id || null, replyTo: replyPreview }
    );
  }, [text, convId, meId, sendPayload, replyTo]);

  const resend = useCallback((m: ChatMessage) => {
    const tempId = newTempId();
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    sendPayload(
      { body: m.body, type: m.type, attachmentUrl: m.attachmentUrl || undefined, replyToId: m.replyToId || undefined, forwarded: m.forwarded || undefined },
      { ...m, id: tempId, tempId, pending: true, failed: false, status: undefined, createdAt: new Date().toISOString() }
    );
  }, [sendPayload]);

  // Bekleyen gönderim timer'larını unmount/sohbet değişiminde temizle (terk edilen sohbette tetiklenmesin)
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, [convId]);

  // ── Etkileşimler: reaksiyon, sil, ilet, kopyala ──
  const reactTo = useCallback(async (m: ChatMessage, emoji: string) => {
    if (m.pending || m.id.startsWith("t-")) return;
    try {
      const res = await fetch(`/api/chat/messages/${m.id}/reaction`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }),
      });
      const d = await res.json();
      if (!res.ok) return;
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: groupReactions(d.reactions, meId) } : x)));
      socket?.emit("chat:relay", { conversationId: convId, event: "reaction", payload: { messageId: m.id, reactions: d.reactions } });
    } catch { /* yoksay */ }
  }, [socket, convId, meId]);

  const doDelete = useCallback(async (m: ChatMessage, scope: "me" | "everyone") => {
    setDeleteMsg(null);
    try {
      const res = await fetch(`/api/chat/messages/${m.id}/delete`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d?.error || "Silinemedi"); return; }
      if (scope === "everyone") {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted: true, type: "deleted", body: "", attachmentUrl: null, reactions: [], replyTo: null } : x)));
        socket?.emit("chat:relay", { conversationId: convId, event: "deleted", payload: { messageId: m.id } });
      } else {
        setMessages((prev) => prev.filter((x) => x.id !== m.id));
      }
    } catch { alert("Silinemedi"); }
  }, [socket, convId]);

  const forwardTo = useCallback(async (targetId: string) => {
    const m = forwardMsg;
    if (!m) return;
    setForwardBusy(true);
    try {
      if (targetId === convId) {
        const tempId = newTempId();
        sendPayload(
          { body: m.body, type: m.type, attachmentUrl: m.attachmentUrl || undefined, forwarded: true },
          { id: tempId, tempId, conversationId: convId, senderId: meId, type: m.type, body: m.body, attachmentUrl: m.attachmentUrl, createdAt: new Date().toISOString(), pending: true, forwarded: true }
        );
      } else if (socket && socket.connected) {
        // Başka konuşma → socket yolu: realtime tüm hedef üyelere message:new yayınlar + offline push
        const tempId = newTempId();
        socket.emit("message:send", { conversationId: targetId, body: m.body, type: m.type, attachmentUrl: m.attachmentUrl || undefined, forwarded: true, tempId }, (res?: { ok?: boolean }) => {
          if (!(res && res.ok)) {
            fetch(`/api/chat/conversations/${targetId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: m.body, type: m.type, attachmentUrl: m.attachmentUrl, forwarded: true }) }).catch(() => {});
          }
        });
      } else {
        const res = await fetch(`/api/chat/conversations/${targetId}/messages`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: m.body, type: m.type, attachmentUrl: m.attachmentUrl, forwarded: true }),
        });
        if (!res.ok) { alert("İletilemedi"); return; }
      }
      setForwardMsg(null);
      // İletildikten sonra hedef sohbete geç (mevcut sohbet ise zaten oradayız)
      if (targetId !== convId) onOpenConversation?.(targetId);
    } finally { setForwardBusy(false); }
  }, [forwardMsg, convId, meId, sendPayload, socket, onOpenConversation]);

  const copyMsg = (m: ChatMessage) => { try { navigator.clipboard?.writeText(m.body || ""); } catch { /* yoksay */ } };
  const canDeleteEveryone = (m: ChatMessage) => m.senderId === meId && Date.now() - new Date(m.createdAt).getTime() < 60_000;

  // ── Yükleme (medya/dosya/ses) ──
  const [uploading, setUploading] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false); // PC webcam (CameraDialog)

  const uploadAndSend = useCallback(async (file: File, audioDurSec?: number) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("conversationId", convId);
      const res = await fetch("/api/chat/media", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d?.error || "Yüklenemedi"); return; }
      const tempId = newTempId();
      const body = d.type === "file" ? (d.fileName || "Dosya") : "";
      // Sesli mesaj: kayıt anında ölçülen KESİN süreyi URL fragment'ına göm (#dur=sn).
      // webm (MediaRecorder) metadata süresi güvenilmez (örn. 3sn kayıt 51sn görünür);
      // fragment sunucuya gitmez, DB'de attachmentUrl içinde verbatim taşınır.
      const url = d.type === "audio" && audioDurSec && audioDurSec > 0 ? `${d.url}#dur=${audioDurSec}` : d.url;
      sendPayload(
        { body, type: d.type, attachmentUrl: url },
        { id: tempId, tempId, conversationId: convId, senderId: meId, type: d.type, body, attachmentUrl: url, createdAt: new Date().toISOString(), pending: true }
      );
    } catch {
      alert("Yüklenemedi");
    } finally {
      setUploading(false);
    }
  }, [convId, meId, sendPayload]);

  // Çoklu seçim: sırayla yükle (sıra korunur)
  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) {
      await uploadAndSend(f);
    }
  }, [uploadAndSend]);

  // ── Bas-tut sesli mesaj (dalga + sola-kaydır kilit) ──
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [vol, setVol] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const recordingRef = useRef(false);
  const lockedRef = useRef(false);
  const startXRef = useRef(0);
  const recStartedAtRef = useRef(0); // kayıt başlangıcı — kesin süre ölçümü (webm metadata güvenilmez)

  const setLockedB = (v: boolean) => { lockedRef.current = v; setLocked(v); };
  const setRecordingB = (v: boolean) => { recordingRef.current = v; setRecording(v); };

  const finishRecord = useCallback((shouldSend: boolean) => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    const rec = recRef.current;
    recRef.current = null;
    if (rec && rec.state !== "inactive") {
      // Kesin süre: kayıt başlangıcından ŞU ANA (durdurma anına) kadar geçen gerçek zaman.
      const durSec = recStartedAtRef.current > 0
        ? Math.max(1, Math.round((Date.now() - recStartedAtRef.current) / 1000))
        : 0;
      rec.onstop = () => {
        const blob = new Blob(recChunksRef.current, { type: rec.mimeType || "audio/webm" });
        recChunksRef.current = [];
        recStreamRef.current?.getTracks().forEach((t) => t.stop());
        recStreamRef.current = null;
        if (shouldSend && blob.size > 800) {
          const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : "webm";
          uploadAndSend(new File([blob], `ses_${Date.now()}.${ext}`, { type: blob.type || "audio/webm" }), durSec);
        }
      };
      rec.stop();
    } else {
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
      recChunksRef.current = [];
    }
    setRecordingB(false);
    setLockedB(false);
    setRecSec(0);
    setVol(0);
  }, [uploadAndSend]);

  const beginRecord = useCallback(async () => {
    if (recordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      recChunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      recRef.current = rec;
      rec.start();
      recStartedAtRef.current = Date.now();
      setRecordingB(true);
      setLockedB(false);
      setRecSec(0);
      setVol(0);
      recTimerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          an.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          setVol(sum / data.length / 255);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch { /* dalga animasyonu olmadan da kayıt sürer */ }
    } catch {
      alert("Mikrofona erişilemedi. Telefon ayarlarından bu uygulamaya mikrofon izni verin.");
    }
  }, [uploadAndSend]);

  const onMicDown = (e: React.PointerEvent) => {
    hapticBuzz();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yoksay */ }
    startXRef.current = e.clientX;
    (document.activeElement as HTMLElement | null)?.blur?.();
    beginRecord();
  };
  const onMicMove = (e: React.PointerEvent) => {
    if (recordingRef.current && !lockedRef.current && startXRef.current - e.clientX > 70) setLockedB(true);
  };
  const onMicUp = () => {
    if (recordingRef.current && !lockedRef.current) finishRecord(true);
  };

  useEffect(() => () => { if (recordingRef.current) finishRecord(false); }, [finishRecord]);

  const startCall = useCallback(
    (type: "audio" | "video") => {
      if (!socket) return;
      const toUserIds = conversation.participants.filter((p) => p.userId !== meId).map((p) => p.userId);
      const callerName = me ? `${me.firstName} ${me.lastName}`.trim() : "";
      socket.emit("call:ring", { conversationId: convId, type, toUserIds, callerName });
      router.push(`/dashboard/arama/${convId}?video=${type === "video" ? "1" : "0"}&caller=1`);
    },
    [socket, conversation.participants, meId, me, convId, router]
  );

  // ── Medya görüntüleyici + PDF + indirme ──
  const mediaItems: ChatMediaItem[] = messages
    .filter((m) => (m.type === "image" || m.type === "video") && m.attachmentUrl)
    .map((m) => ({ id: m.id, url: m.attachmentUrl as string, type: m.type, fileName: m.body || "" }));
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);

  const openMedia = (m: ChatMessage) => {
    const idx = mediaItems.findIndex((it) => it.id === m.id);
    if (idx >= 0) setViewerIndex(idx);
  };
  const openFile = async (m: ChatMessage) => {
    const url = m.attachmentUrl || "";
    if (!url) return;
    if (isPdfUrl(url, m.body)) { setPdf({ url, name: m.body || "Belge.pdf" }); return; }
    try {
      const msg = await downloadFile(url, m.body || "dosya");
      if (msg) alert(msg);
    } catch {
      alert("İndirilemedi");
    }
  };

  const other = conversation.participants.find((p) => p.userId !== meId)?.user;

  // Ardışık (aynı gönderen, başlıksız, ~90sn) resim/video → albüm (WhatsApp gibi); aksi → tek balon.
  const renderMessages = (): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      const albumable = (m.type === "image" || m.type === "video") && m.attachmentUrl && !m.body && !m.failed;
      if (albumable) {
        const group = [m];
        let j = i + 1;
        while (j < messages.length) {
          const nx = messages[j];
          const ok = (nx.type === "image" || nx.type === "video") && nx.attachmentUrl && !nx.body && !nx.failed &&
            nx.senderId === m.senderId &&
            new Date(nx.createdAt).getTime() - new Date(group[0].createdAt).getTime() < 90000;
          if (ok) { group.push(nx); j++; } else break;
        }
        if (group.length >= 2) {
          out.push(
            <MediaAlbum key={`alb-${group[0].tempId ?? group[0].id}`} items={group} mine={m.senderId === meId} status={group[group.length - 1].status} onOpen={openMedia} />
          );
          i = j;
          continue;
        }
      }
      out.push(
        <MessageBubble key={m.id} message={m} mine={m.senderId === meId} isGroup={conversation.isGroup}
          onOpenMedia={() => openMedia(m)} onOpenFile={() => openFile(m)} onRetry={() => resend(m)}
          onMenu={(mm) => { if (!mm.pending && !mm.id.startsWith("t-")) setMenuMsg(mm); }}
          onReplySwipe={(mm) => { if (!mm.pending && !mm.id.startsWith("t-")) setReplyTo(mm); }}
          onToggleReaction={reactTo} />
      );
      i++;
    }
    return out;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 chat-enter">
      <div
        className="flex items-center gap-3 px-4 bg-white border-b border-gray-200 flex-shrink-0"
        style={isTablet ? { height: "3.5rem" } : { paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}
      >
        {!isTablet && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 -ml-1" aria-label="Geri">
            <ArrowLeft size={22} />
          </button>
        )}
        <button
          onClick={() => { if (conversation.isGroup) setShowInfo(true); }}
          disabled={!conversation.isGroup}
          className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:cursor-default"
        >
          <Avatar
            url={conversation.isGroup ? conversation.avatarUrl : other?.avatarUrl}
            name={convTitle(conversation, meId)}
            group={conversation.isGroup}
            size={38}
          />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{convTitle(conversation, meId)}</p>
            {conversation.isGroup && (
              <p className="text-xs text-gray-500 truncate">{conversation.participants.length} üye</p>
            )}
          </div>
        </button>
        <button onClick={() => startCall("audio")} className="text-gray-500 hover:text-[#1e3a5f] p-1" title="Sesli arama" aria-label="Sesli arama">
          <Phone size={20} />
        </button>
        <button onClick={() => startCall("video")} className="text-gray-500 hover:text-[#1e3a5f] p-1" title="Görüntülü arama" aria-label="Görüntülü arama">
          <Video size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {loading ? (
          <div className="text-center text-gray-400 py-8 text-sm">Yükleniyor…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">Henüz mesaj yok</div>
        ) : (
          renderMessages()
        )}
        <div ref={endRef} />
      </div>

      <div
        className="bg-white border-t border-gray-200 flex-shrink-0"
        style={isTablet ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {replyTo && (
          <div className="flex items-center gap-2 px-3 pt-2">
            <div className="flex-1 min-w-0 border-l-[3px] border-[#1e3a5f] bg-[#1e3a5f]/5 rounded px-2 py-1">
              <p className="text-[11px] font-semibold text-[#1e3a5f] truncate">{replyTo.senderId === meId ? "Sen" : (replyTo.sender ? `${replyTo.sender.firstName} ${replyTo.sender.lastName}` : "")}</p>
              <p className="text-[11px] text-gray-500 truncate">{replyPreviewText(replyTo)}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Yanıtı iptal"><X size={18} /></button>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-2.5 py-2.5">
        <input ref={imageInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onPick} />
        <input ref={docInputRef} type="file" multiple className="hidden" onChange={onPick} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
        <CameraDialog
          open={showCamera}
          type="photo"
          onClose={() => setShowCamera(false)}
          onCapture={(blob, fileName) => { setShowCamera(false); uploadAndSend(new File([blob], fileName, { type: blob.type || "image/jpeg" })); }}
        />

        {recording ? (
          <div className="flex-1 flex items-center gap-2 h-11 px-3 rounded-full bg-red-50 border border-red-200 overflow-hidden">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-sm font-semibold text-red-600 tabular-nums shrink-0">
              {Math.floor(recSec / 60)}:{String(recSec % 60).padStart(2, "0")}
            </span>
            <div className="flex-1 flex items-center justify-center gap-[2px] h-7 overflow-hidden">
              {Array.from({ length: 24 }).map((_, i) => {
                const w = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.8 + 1));
                const h = Math.max(3, Math.min(26, (4 + vol * 70) * w));
                return <span key={i} className="w-[3px] rounded-full bg-[#1e3a5f]/60" style={{ height: `${h}px`, transition: "height 0.08s linear" }} />;
              })}
            </div>
            {locked ? (
              <button onClick={() => finishRecord(false)} className="shrink-0 text-gray-400 hover:text-red-600" aria-label="İptal"><Trash2 size={20} /></button>
            ) : (
              <span className="shrink-0 text-[11px] text-gray-400 whitespace-nowrap">‹ kaydır: kilitle</span>
            )}
          </div>
        ) : (
          <>
            <button onClick={() => docInputRef.current?.click()} disabled={uploading} className="text-gray-500 hover:text-[#1e3a5f] p-1.5 shrink-0 disabled:opacity-40 transition-colors" title="Dosya ekle" aria-label="Dosya ekle"><Paperclip size={22} /></button>
            <button onClick={() => imageInputRef.current?.click()} disabled={uploading} className="text-gray-500 hover:text-[#1e3a5f] p-1.5 shrink-0 disabled:opacity-40 transition-colors" title="Fotoğraf / Video" aria-label="Fotoğraf / Video"><ImageIcon size={22} /></button>
            <button onClick={async () => {
              const f = await takeNativePhoto();           // Capacitor native (telefon app)
              if (f) { uploadAndSend(f); return; }
              const isTouch = typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window);
              if (isTouch) cameraInputRef.current?.click(); // mobil-web: sistem kamerası (capture)
              else setShowCamera(true);                     // PC/web: webcam (CameraDialog)
            }} disabled={uploading} className="text-gray-500 hover:text-[#1e3a5f] p-1.5 shrink-0 disabled:opacity-40 transition-colors" title="Kamera" aria-label="Kamera"><Camera size={22} /></button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={uploading ? "Yükleniyor…" : "Mesaj yaz…"}
              disabled={uploading}
              className="flex-1 min-w-0 h-11 px-4 rounded-full border border-gray-300 focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f] outline-none text-sm disabled:bg-gray-50"
            />
          </>
        )}

        {text.trim() && !recording ? (
          <button onClick={send} className="w-11 h-11 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center flex-shrink-0 hover:opacity-90 active:scale-95 transition" aria-label="Gönder"><Send size={18} /></button>
        ) : recording && locked ? (
          <button onClick={() => finishRecord(true)} className="w-11 h-11 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center flex-shrink-0 hover:opacity-90 active:scale-95 transition" aria-label="Gönder"><Send size={18} /></button>
        ) : (
          <button
            onPointerDown={onMicDown}
            onPointerMove={onMicMove}
            onPointerUp={onMicUp}
            disabled={uploading}
            className={`w-11 h-11 rounded-full text-white flex items-center justify-center flex-shrink-0 transition disabled:opacity-40 ${recording ? "bg-red-500 scale-110 shadow-lg" : "bg-[#1e3a5f] hover:opacity-90 active:scale-95"}`}
            aria-label="Sesli mesaj (basılı tut)"
            style={{ touchAction: "none" }}
          >
            <Mic size={20} />
          </button>
        )}
        </div>
      </div>

      {viewerIndex !== null && (
        <ChatMediaViewer
          items={mediaItems}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
      {pdf && (
        <Suspense fallback={null}>
          <PdfViewer fileUrl={pdf.url} fileName={pdf.name} onClose={() => setPdf(null)} />
        </Suspense>
      )}
      {showInfo && conversation.isGroup && (
        <GroupInfoDialog
          conversation={conversation}
          meId={meId}
          onClose={() => setShowInfo(false)}
          onUpdated={(c) => onUpdated?.(c)}
          onLeft={() => { setShowInfo(false); onLeft?.(conversation.id); }}
        />
      )}

      {menuMsg && (
        <MessageActionSheet
          isText={menuMsg.type === "text"}
          onReact={(emoji) => { reactTo(menuMsg, emoji); setMenuMsg(null); }}
          onReply={() => { setReplyTo(menuMsg); setMenuMsg(null); }}
          onForward={() => { setForwardMsg(menuMsg); setMenuMsg(null); }}
          onCopy={() => { copyMsg(menuMsg); setMenuMsg(null); }}
          onDelete={() => { setDeleteMsg(menuMsg); setMenuMsg(null); }}
          onClose={() => setMenuMsg(null)}
        />
      )}
      {forwardMsg && (
        <ForwardDialog conversations={conversations || []} meId={meId} busy={forwardBusy} onPick={forwardTo} onClose={() => setForwardMsg(null)} />
      )}
      {deleteMsg && (
        <div className="fixed inset-0 z-[95] bg-black/30 flex items-end sm:items-center sm:justify-center" onClick={() => setDeleteMsg(null)}>
          <div className="w-full sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="mx-3 bg-white rounded-2xl shadow-xl overflow-hidden divide-y divide-gray-100" style={{ marginBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
              {canDeleteEveryone(deleteMsg) && (
                <button onClick={() => doDelete(deleteMsg, "everyone")} className="w-full px-5 py-3.5 text-left text-red-600 font-medium text-sm active:bg-gray-100">Herkesten sil</button>
              )}
              <button onClick={() => doDelete(deleteMsg, "me")} className="w-full px-5 py-3.5 text-left text-gray-800 font-medium text-sm active:bg-gray-100">Benden sil</button>
              <button onClick={() => setDeleteMsg(null)} className="w-full px-5 py-3.5 text-left text-gray-500 text-sm active:bg-gray-100">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
