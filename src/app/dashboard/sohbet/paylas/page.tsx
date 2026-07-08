"use client";

/* Paylaşım hedefi ekranı — başka uygulamadan/görüntüleyiciden gelen içeriği
   bir sohbete iletir. Mevcut /api/chat/media upload + socket message:send akışını
   yeniden kullanır. SADECE native (Android); web/masaüstü/iPad'de sohbete döner. */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../layout";
import { useSocket } from "@/hooks/useSocket";
import type { Conversation } from "../types";
import ForwardDialog from "../_components/ForwardDialog";
import { ShareTarget, isNativeShare, type ShareData, type SharedFile } from "@/lib/shareTarget";

function newTempId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function base64ToFile(f: SharedFile): File {
  const bin = atob(f.base64 || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], f.name || "dosya", { type: f.mimeType || "application/octet-stream" });
}

export default function PaylasPage() {
  const user = useUser();
  const router = useRouter();
  const { socket } = useSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [share, setShare] = useState<ShareData | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Bekleyen paylaşımı al; yoksa / native değilse sohbete dön
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isNativeShare()) {
        router.replace("/dashboard/sohbet");
        return;
      }
      try {
        const data = await ShareTarget.getPendingShare();
        if (!alive) return;
        const hasContent = !!data && data.id > 0 && ((data.files?.length || 0) > 0 || (data.texts?.length || 0) > 0);
        if (!hasContent) {
          router.replace("/dashboard/sohbet");
          return;
        }
        setShare(data);
        setReady(true);
      } catch {
        router.replace("/dashboard/sohbet");
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  // Konuşmaları yükle
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/chat/conversations");
        if (res.ok) {
          const d = await res.json();
          setConversations(d.conversations || []);
        }
      } catch {
        /* yoksay */
      }
    })();
  }, []);

  const sendOne = useCallback(
    async (conversationId: string, payload: { body: string; type?: string; attachmentUrl?: string }) => {
      const tempId = newTempId();
      const ok = await new Promise<boolean>((resolve) => {
        if (socket && socket.connected) {
          let done = false;
          const t = setTimeout(() => {
            if (!done) {
              done = true;
              resolve(false);
            }
          }, 12000);
          socket.emit("message:send", { conversationId, ...payload, tempId }, (res?: { ok?: boolean }) => {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve(!!(res && res.ok));
          });
        } else {
          resolve(false);
        }
      });
      if (!ok) {
        // REST yedeği (canlı yayınlamaz ama kalıcı yazar; alıcı yenileyince görür)
        await fetch(`/api/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    },
    [socket]
  );

  const onPick = useCallback(
    async (conversationId: string) => {
      if (!share || busy) return;
      setBusy(true);
      try {
        let skipped = 0;
        for (const f of share.files || []) {
          if (f.tooLarge) {
            skipped++;
            continue;
          }
          try {
            const file = base64ToFile(f);
            const fd = new FormData();
            fd.append("file", file);
            fd.append("conversationId", conversationId);
            const res = await fetch("/api/chat/media", { method: "POST", body: fd });
            const d = await res.json();
            if (!res.ok) {
              skipped++;
              continue;
            }
            const body = d.type === "file" ? d.fileName || "Dosya" : "";
            await sendOne(conversationId, { body, type: d.type, attachmentUrl: d.url });
          } catch {
            skipped++;
          }
        }
        for (const t of share.texts || []) {
          if (t && t.trim()) await sendOne(conversationId, { body: t.trim() });
        }
        try {
          await ShareTarget.clearPendingShare();
        } catch {
          /* yoksay */
        }
        if (skipped > 0) alert(`${skipped} dosya gönderilemedi (25MB'tan büyük veya hata).`);
        router.replace(`/dashboard/sohbet?c=${conversationId}`);
      } finally {
        setBusy(false);
      }
    },
    [share, busy, sendOne, router]
  );

  const onClose = useCallback(() => {
    void ShareTarget.clearPendingShare().catch(() => {});
    router.replace("/dashboard/sohbet");
  }, [router]);

  if (!ready || !user) {
    return (
      <div className="fixed inset-0 z-[96] bg-black/40 flex items-center justify-center text-white text-sm">
        Paylaşım hazırlanıyor…
      </div>
    );
  }

  return (
    <ForwardDialog
      conversations={conversations}
      meId={user.id}
      busy={busy}
      title="Sohbete paylaş"
      onPick={onPick}
      onClose={onClose}
    />
  );
}
