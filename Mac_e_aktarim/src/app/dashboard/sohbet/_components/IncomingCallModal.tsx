"use client";

import { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { hapticMedium, hapticVibrate } from "@/lib/haptics";

export interface IncomingCall {
  conversationId: string;
  type: string; // "video" | "audio"
  callerName: string;
}

export default function IncomingCallModal({
  call,
  onAccept,
  onReject,
}: {
  call: IncomingCall;
  onAccept: () => void;
  onReject: () => void;
}) {
  // Çalan arama: modal açık kaldığı sürece tekrarlayan titreşim
  useEffect(() => {
    let alive = true;
    const buzz = () => { if (alive) hapticVibrate(600); };
    buzz();
    const id = setInterval(buzz, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 flex flex-col items-center justify-center text-white p-6">
      <div className="text-center mb-12">
        <div className="w-24 h-24 rounded-full bg-[#c0392b] flex items-center justify-center text-4xl font-semibold mx-auto mb-5 animate-pulse">
          {call.callerName?.[0]?.toUpperCase() || "?"}
        </div>
        <p className="text-2xl font-semibold">{call.callerName || "Bilinmeyen"}</p>
        <p className="text-gray-300 mt-2 flex items-center justify-center gap-2">
          {call.type === "video" ? <Video size={18} /> : <Phone size={18} />}
          {call.type === "video" ? "Görüntülü arama" : "Sesli arama"}…
        </p>
      </div>
      <div className="flex items-center gap-14">
        <button onClick={() => { hapticMedium(); onReject(); }} className="flex flex-col items-center gap-2" aria-label="Reddet">
          <span className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center hover:opacity-90">
            <PhoneOff size={28} />
          </span>
          <span className="text-sm">Reddet</span>
        </button>
        <button onClick={() => { hapticMedium(); onAccept(); }} className="flex flex-col items-center gap-2" aria-label="Kabul et">
          <span className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center animate-bounce">
            <Phone size={28} />
          </span>
          <span className="text-sm">Kabul et</span>
        </button>
      </div>
    </div>
  );
}
