"use client";

import { Reply, Forward, Copy, Trash2 } from "lucide-react";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function Action({ icon: Icon, label, onClick, danger }: { icon: typeof Reply; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-gray-100 transition ${danger ? "text-red-600" : "text-gray-800"}`}>
      <Icon size={19} className={danger ? "text-red-600" : "text-gray-500"} />
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}

/** Mesaja bas-tut menüsü: üstte emoji reaksiyon sırası, altında aksiyonlar. */
export default function MessageActionSheet({
  isText,
  onReact,
  onReply,
  onForward,
  onCopy,
  onDelete,
  onClose,
}: {
  isText: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] bg-black/30 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        {/* Emoji reaksiyon sırası */}
        <div className="mx-3 mb-2 bg-white rounded-full shadow-xl flex items-center justify-around px-2 py-2 modal-safe-bottom-0">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => onReact(e)} className="text-[26px] leading-none px-1.5 py-1 active:scale-125 transition" aria-label={`Tepki ${e}`}>
              {e}
            </button>
          ))}
        </div>
        {/* Aksiyonlar */}
        <div className="mx-3 mb-3 bg-white rounded-2xl shadow-xl overflow-hidden divide-y divide-gray-100" style={{ marginBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <Action icon={Reply} label="Yanıtla" onClick={onReply} />
          <Action icon={Forward} label="İlet" onClick={onForward} />
          {isText && <Action icon={Copy} label="Kopyala" onClick={onCopy} />}
          <Action icon={Trash2} label="Sil" danger onClick={onDelete} />
        </div>
      </div>
    </div>
  );
}
