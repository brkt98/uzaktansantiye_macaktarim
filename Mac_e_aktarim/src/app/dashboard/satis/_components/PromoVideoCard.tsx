"use client";

import { useEffect, useRef, useState } from "react";
import { Video, Upload, Link2, Trash2, Loader2, Play } from "lucide-react";
import { useDialog } from "./DialogProvider";
import { useDevice } from "@/hooks/useDevice";

type Props = {
  targetType: "salesProject" | "constructionSite";
  targetId: string;
  canEdit?: boolean;
};

type Promo = {
  videoUrl?: string | null;
  embedUrl?: string | null;
};

function toEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.replace(/^\/+/, "").split("/")[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {}
  return null;
}

export default function PromoVideoCard({ targetType, targetId, canEdit = true }: Props) {
  const { alert, confirm } = useDialog();
  const { isMobile } = useDevice();
  const [promo, setPromo] = useState<Promo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [urlEdit, setUrlEdit] = useState("");
  const [showPlayer, setShowPlayer] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/sales/promo-video?targetType=${targetType}&targetId=${targetId}`
      );
      const d = await r.json();
      setPromo(d.promo || null);
      setUrlEdit(d.promo?.embedUrl || "");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [targetType, targetId]);

  const onUpload = async (f: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("targetType", targetType);
      fd.append("targetId", targetId);
      fd.append("file", f);
      if (urlEdit) fd.append("embedUrl", urlEdit);
      const r = await fetch("/api/sales/promo-video", { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok) setPromo(d.promo);
      else await alert({ message: d.error || "Yüklenemedi", variant: "danger" });
    } finally {
      setUploading(false);
    }
  };

  const saveUrl = async () => {
    const fd = new FormData();
    fd.append("targetType", targetType);
    fd.append("targetId", targetId);
    fd.append("embedUrl", urlEdit);
    const r = await fetch("/api/sales/promo-video", { method: "POST", body: fd });
    const d = await r.json();
    if (r.ok) setPromo(d.promo);
    else await alert({ message: d.error || "Kaydedilemedi", variant: "danger" });
  };

  const remove = async () => {
    if (!(await confirm({ message: "Tanıtım videosu silinsin mi?", variant: "danger", confirmText: "Sil" }))) return;
    const r = await fetch(
      `/api/sales/promo-video?targetType=${targetType}&targetId=${targetId}`,
      { method: "DELETE" }
    );
    if (r.ok) setPromo(null);
  };

  const hasContent = !!(promo?.videoUrl || promo?.embedUrl);
  const embed = promo?.embedUrl ? toEmbed(promo.embedUrl) : null;

  return (
    <>
      <div className={`${isMobile ? "min-h-[200px]" : "aspect-square"} rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md hover:shadow-xl transition border border-violet-400/50 p-4 flex flex-col`}>
        <div className="flex items-center gap-2 mb-2">
          <Video size={20} />
          <h3 className="font-bold">Tanitim Videosu</h3>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : hasContent ? (
          <div className="flex-1 flex flex-col">
            <button
              onClick={() => setShowPlayer(true)}
              className="flex-1 rounded-xl bg-black/30 hover:bg-black/40 flex items-center justify-center transition"
            >
              <Play size={48} className="text-white drop-shadow" />
            </button>
            {canEdit && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 text-xs bg-white/20 hover:bg-white/30 rounded-lg py-1.5 flex items-center justify-center gap-1"
                >
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  Degistir
                </button>
                <button
                  onClick={remove}
                  className="text-xs bg-rose-500/80 hover:bg-rose-500 rounded-lg px-2 py-1.5"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ) : canEdit ? (
          <div className="flex-1 flex flex-col gap-2 justify-center">
            <div className="flex gap-1">
              <Link2 size={14} className="mt-2.5 opacity-80" />
              <input
                value={urlEdit}
                onChange={(e) => setUrlEdit(e.target.value)}
                placeholder="YouTube / Vimeo URL"
                className="flex-1 text-xs bg-white/20 placeholder-white/60 rounded-lg px-2 py-2 outline-none"
              />
            </div>
            <button
              onClick={saveUrl}
              disabled={!urlEdit.trim()}
              className="text-xs bg-white text-violet-700 font-semibold rounded-lg py-1.5 disabled:opacity-50"
            >
              URL Kaydet
            </button>
            <div className="text-center text-[10px] opacity-80">veya</div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs bg-white/20 hover:bg-white/30 rounded-lg py-1.5 flex items-center justify-center gap-1"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Video Yukle
            </button>
            {uploading && (
              <div className="text-[10px] text-center opacity-90">
                Donusturuluyor (webm)...
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs opacity-80">
            Tanitim videosu yok
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {showPlayer && hasContent && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowPlayer(false)}
        >
          <div
            className="bg-black rounded-xl shadow-2xl max-w-4xl w-full aspect-video"
            onClick={(e) => e.stopPropagation()}
          >
            {promo?.videoUrl ? (
              <video controls autoPlay src={promo.videoUrl} className="w-full h-full rounded-xl" />
            ) : embed ? (
              <iframe
                src={embed}
                className="w-full h-full rounded-xl"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : promo?.embedUrl ? (
              <video controls autoPlay src={promo.embedUrl} className="w-full h-full rounded-xl" />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
