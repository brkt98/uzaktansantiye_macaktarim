"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { ArrowLeft, FileText, Download, Link as LinkIcon, Play } from "lucide-react";
import ChatMediaViewer, { type ChatMediaItem } from "./ChatMediaViewer";
import { downloadFile } from "@/lib/downloadFile";

const PdfViewer = lazy(() => import("@/components/PdfViewer"));
const thumb = (u: string) => u + (u.includes("?") ? "&" : "?") + "size=thumb";
const isPdf = (u: string, n?: string) => u.toLowerCase().split("?")[0].endsWith(".pdf") || !!n?.toLowerCase().endsWith(".pdf");
const shortDate = (d: string) => { try { return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }); } catch { return ""; } };

type MediaA = { id: string; type: string; url: string; fileName: string; createdAt: string };
type DocA = { id: string; url: string; fileName: string; createdAt: string };
type LinkA = { id: string; url: string; createdAt: string };

export default function GroupMediaDialog({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [tab, setTab] = useState<"media" | "docs" | "links">("media");
  const [data, setData] = useState<{ media: MediaA[]; docs: DocA[]; links: LinkA[] }>({ media: [], docs: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    fetch(`/api/chat/conversations/${conversationId}/attachments`)
      .then((r) => (r.ok ? r.json() : { media: [], docs: [], links: [] }))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [conversationId]);

  const mediaItems: ChatMediaItem[] = data.media.map((m) => ({ id: m.id, url: m.url, type: m.type, fileName: m.fileName }));

  const openDoc = async (d: DocA) => {
    if (isPdf(d.url, d.fileName)) { setPdf({ url: d.url, name: d.fileName }); return; }
    try { const msg = await downloadFile(d.url, d.fileName); if (msg) alert(msg); } catch { alert("İndirilemedi"); }
  };

  const tabs: [typeof tab, string, number][] = [
    ["media", "Medya", data.media.length],
    ["docs", "Belgeler", data.docs.length],
    ["links", "Bağlantılar", data.links.length],
  ];

  return (
    <div className="fixed inset-0 z-[85] bg-gray-50 flex flex-col" style={{ height: "100dvh" }}>
      <div className="modal-safe-top flex items-center gap-3 px-4 bg-[#1e3a5f] text-white flex-shrink-0" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "0.75rem" }}>
        <button onClick={onClose} aria-label="Geri" className="active:scale-90 transition"><ArrowLeft size={22} /></button>
        <h2 className="font-semibold">Medya, bağlantı ve belgeler</h2>
      </div>

      <div className="flex bg-white border-b border-gray-200 flex-shrink-0">
        {tabs.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${tab === k ? "border-[#1e3a5f] text-[#1e3a5f]" : "border-transparent text-gray-500"}`}>
            {label} {n > 0 && <span className="text-xs opacity-70">({n})</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-gray-400 py-10 text-sm">Yükleniyor…</div>
        ) : tab === "media" ? (
          data.media.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">Henüz medya yok</div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">
              {data.media.map((m, i) => (
                <button key={m.id} onClick={() => setViewerIndex(i)} className="relative aspect-square bg-black/10 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb(m.url)} alt="" loading="lazy" className="w-full h-full object-cover" />
                  {m.type === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center"><Play size={15} className="text-white ml-0.5" fill="currentColor" /></span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )
        ) : tab === "docs" ? (
          data.docs.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">Henüz belge yok</div>
          ) : (
            <div className="bg-white">
              {data.docs.map((d) => (
                <button key={d.id} onClick={() => openDoc(d)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 hover:bg-gray-50">
                  <span className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center flex-shrink-0"><FileText size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-gray-900 truncate text-sm">{d.fileName}</span>
                    <span className="block text-xs text-gray-400">{shortDate(d.createdAt)}</span>
                  </span>
                  <Download size={16} className="text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          )
        ) : (
          data.links.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">Henüz bağlantı yok</div>
          ) : (
            <div className="bg-white">
              {data.links.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50">
                  <span className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center flex-shrink-0"><LinkIcon size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[#1e3a5f] truncate text-sm">{l.url}</span>
                    <span className="block text-xs text-gray-400">{shortDate(l.createdAt)}</span>
                  </span>
                </a>
              ))}
            </div>
          )
        )}
      </div>

      {viewerIndex !== null && (
        <ChatMediaViewer items={mediaItems} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />
      )}
      {pdf && (
        <Suspense fallback={null}>
          <PdfViewer fileUrl={pdf.url} fileName={pdf.name} onClose={() => setPdf(null)} />
        </Suspense>
      )}
    </div>
  );
}
