"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { MessageCircle, Lock } from "lucide-react";
import { useUser } from "../layout";
import { useSocket } from "@/hooks/useSocket";
import type { Conversation, ChatMessage } from "./types";
import ConversationList from "./_components/ConversationList";
import ChatWindow from "./_components/ChatWindow";
import NewConversationDialog from "./_components/NewConversationDialog";
import ProfileDialog from "./_components/ProfileDialog";
import { useDevice } from "@/hooks/useDevice";
import { hapticTap } from "@/lib/haptics";
import { useModalBack } from "@/lib/backStack";

export default function SohbetPage() {
  const user = useUser();
  const { isMobile } = useDevice();
  // İki panel (sol liste + sağ sohbet) telefon DIŞINDA her yerde (tablet + masaüstü/web = WhatsApp-web)
  const twoPanel = !isMobile;
  const { socket } = useSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobilde tam-ekran sohbet açıkken Android geri-gesture'ı listeye döndürsün (sayfayı pop etmesin)
  useModalBack(isMobile && !!selectedId, () => setSelectedId(null));
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [myAvatarOverride, setMyAvatarOverride] = useState<string | null>(null);

  // Kendi avatarımı konuşma katılımcılarından türet (yükleme sonrası override anında yansır)
  const myAvatar = useMemo(() => {
    if (myAvatarOverride) return myAvatarOverride;
    for (const c of conversations) {
      const meP = c.participants.find((p) => p.userId === user?.id);
      if (meP?.user.avatarUrl) return meP.user.avatarUrl;
    }
    return null;
  }, [myAvatarOverride, conversations, user?.id]);

  const me = user
    ? { id: user.id, firstName: user.firstName, lastName: user.lastName, username: user.username || "", avatarUrl: myAvatar }
    : null;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Derin bağlantı: /dashboard/sohbet?c=<id>
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setSelectedId(c);
  }, []);

  // Socket: konuşma listesini canlı güncelle
  useEffect(() => {
    if (!socket) return;
    const onNew = (payload: { message: ChatMessage; conversationId: string }) => {
      const { message, conversationId } = payload;
      if (message.senderId !== user?.id) hapticTap(); // gelen mesajda titreşim
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) {
          load();
          return prev;
        }
        const updated: Conversation = {
          ...prev[idx],
          lastMessage: message,
          lastMessageAt: message.createdAt,
        };
        if (conversationId !== selectedId && message.senderId !== user?.id) {
          updated.unread = (updated.unread || 0) + 1;
        }
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
    };
    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [socket, selectedId, user?.id, load]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const handleCreated = (conv: Conversation) => {
    setConversations((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]));
    setSelectedId(conv.id);
    setShowNew(false);
  };

  const handleConversationUpdate = (conv: Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, ...conv } : c)));
  };

  const handleLeft = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const selected = conversations.find((c) => c.id === selectedId) || null;

  return (
    <>
      {/* Liste (tablet'te sol panel; telefonda tam genişlik, sohbet açıkken gizli) */}
      <div className={`flex overflow-hidden bg-white ${twoPanel ? "h-full" : "h-[calc(100dvh-7rem)] rounded-xl border border-gray-200"}`}>
        {(twoPanel || !selectedId) && (
          <div className={`${twoPanel ? "w-80 lg:w-96 border-r border-gray-200" : "w-full"} flex flex-col bg-white`}>
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              meId={user?.id || ""}
              me={me}
              loading={loading}
              onSelect={handleSelect}
              onNew={() => setShowNew(true)}
              onProfile={() => setShowProfile(true)}
            />
          </div>
        )}
        {/* Tablet / masaüstü (web): sağ panelde sohbet — WhatsApp-web düzeni */}
        {twoPanel && (
          <div className="flex-1 flex flex-col min-w-0">
            {selected ? (
              <ChatWindow
                key={selected.id}
                conversation={selected}
                meId={user?.id || ""}
                isTablet={twoPanel}
                onBack={() => setSelectedId(null)}
                onUpdated={handleConversationUpdate}
                onLeft={handleLeft}
                conversations={conversations}
                onOpenConversation={handleSelect}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-gradient-to-b from-gray-50 to-white">
                <div className="w-24 h-24 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center mb-5">
                  <MessageCircle size={44} className="text-[#1e3a5f]" />
                </div>
                <h2 className="text-xl font-semibold text-gray-800">Meşale Sohbet</h2>
                <p className="text-sm text-gray-500 mt-2 max-w-sm">
                  Soldaki listeden bir konuşma seçin ya da yeni bir sohbet başlatın.
                </p>
                <p className="text-xs text-gray-400 mt-4 flex items-center gap-1">
                  <Lock size={12} /> Mesajlarınız güvenle iletilir
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Telefon: tam ekran sohbet — üst menünün ÜSTÜNDE, dvh ile klavye uyumlu */}
      {!twoPanel && selected && (
        <div className="fixed left-0 right-0 top-0 h-[100dvh] z-[60] bg-gray-50">
          <ChatWindow
            key={selected.id}
            conversation={selected}
            meId={user?.id || ""}
            isTablet={false}
            onBack={() => setSelectedId(null)}
            onUpdated={handleConversationUpdate}
            onLeft={handleLeft}
            conversations={conversations}
            onOpenConversation={handleSelect}
          />
        </div>
      )}

      {showNew && (
        <NewConversationDialog onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}

      {showProfile && me && (
        <ProfileDialog me={me} onClose={() => setShowProfile(false)} onUpdated={(url) => setMyAvatarOverride(url)} />
      )}
    </>
  );
}
