"use client";

import { useEffect, useState } from "react";
import { FileText, Trash2, Paperclip, Camera, Edit2, Check, X, Download } from "lucide-react";
import PhotoToPdfScanner from "./PhotoToPdfScanner";
import MediaViewer, { type MediaItem } from "./MediaViewer";
import PdfViewer from "@/components/PdfViewer";
import { useDialog } from "./DialogProvider";
import { imagesToPdfFile } from "@/lib/pdf-utils";

export type SalesDoc = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
};

type Props = {
  targetType: "unit" | "daire";
  targetId: string;
};

export default function DocumentsSection({ targetType, targetId }: Props) {
  const { alert, confirm } = useDialog();
  const [docs, setDocs] = useState<SalesDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number } | null>(null);
  const [pdf, setPdf] = useState<{ fileUrl: string; fileName: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sales/documents?targetType=${targetType}&targetId=${targetId}`
      );
      const data = await res.json();
      if (res.ok) setDocs(data.documents || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  const uploadFile = async (file: File, customName?: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("targetType", targetType);
      fd.append("targetId", targetId);
      fd.append("file", file);
      if (customName) fd.append("fileName", customName);
      const res = await fetch("/api/sales/documents", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) setDocs((prev) => [data.document, ...prev]);
      else await alert({ message: data.error || "Yüklenemedi", variant: "danger" });
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) await uploadFile(f);
  };

  const onScanDone = async (imgs: { data: string }[]) => {
    setScanOpen(false);
    if (imgs.length === 0) return;
    setUploading(true);
    try {
      const file = await imagesToPdfFile(imgs, "Belge");
      await uploadFile(file);
    } finally {
      setUploading(false);
    }
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) return;
    const res = await fetch("/api/sales/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: id, fileName: editName.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setDocs((prev) => prev.map((d) => (d.id === id ? data.document : d)));
      setEditingId(null);
      setEditName("");
    } else {
      await alert({ message: data.error || "Güncellenemedi", variant: "danger" });
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ message: "Bu belgeyi silmek istediğinize emin misiniz?", variant: "danger", confirmText: "Sil" }))) return;
    const res = await fetch(`/api/sales/documents?documentId=${id}`, { method: "DELETE" });
    if (res.ok) setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={16} className="text-slate-600" />
          <h4 className="font-semibold text-sm text-slate-800">Belgeler</h4>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 text-white text-sm font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all cursor-pointer">
            <Paperclip size={15} /> Dosya Yükle
            <input type="file" className="hidden" onChange={onPickFile} disabled={uploading} />
          </label>
          <button
            onClick={() => setScanOpen(true)}
            disabled={uploading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-50"
          >
            <Camera size={15} /> Foto → PDF
          </button>
        </div>
      </div>

      {uploading && (
        <div className="text-xs text-blue-600 text-center py-2">Yukleniyor...</div>
      )}

      {loading ? (
        <div className="text-xs text-gray-400 text-center py-3">Yukleniyor...</div>
      ) : docs.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-3">Henuz belge yok</div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200"
            >
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <FileText size={14} className="text-slate-500 shrink-0" />
                {editingId === d.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(d.id);
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditName("");
                      }
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none"
                  />
                ) : (
                  <div className="flex-1 min-w-0">
                    {d.mimeType?.startsWith("image/") ? (
                      <button
                        type="button"
                        onClick={() => {
                          const imgs = docs.filter((x) => x.mimeType?.startsWith("image/"));
                          const idx = imgs.findIndex((x) => x.id === d.id);
                          setViewer({ items: imgs, index: Math.max(0, idx) });
                        }}
                        className="text-xs text-blue-700 hover:underline truncate block text-left w-full"
                      >
                        {d.fileName}
                      </button>
                    ) : (d.mimeType === "application/pdf" || d.fileName?.toLowerCase().endsWith(".pdf")) ? (
                      <button
                        type="button"
                        onClick={() => setPdf({ fileUrl: d.fileUrl, fileName: d.fileName })}
                        className="text-xs text-blue-700 hover:underline truncate block text-left w-full"
                      >
                        {d.fileName}
                      </button>
                    ) : (
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-700 hover:underline truncate block"
                      >
                        {d.fileName}
                      </a>
                    )}
                    <div className="text-[10px] text-slate-500">
                      {new Date(d.createdAt).toLocaleDateString("tr-TR")} ·{" "}
                      {(d.fileSize / 1024).toFixed(0)} KB
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editingId === d.id ? (
                  <>
                    <button
                      onClick={() => saveRename(d.id)}
                      className="p-2 rounded-md text-emerald-600 hover:bg-emerald-50"
                      title="Kaydet"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditName("");
                      }}
                      className="p-2 rounded-md text-slate-500 hover:bg-slate-100"
                      title="Vazgec"
                    >
                      <X size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <a
                      href={d.fileUrl}
                      download={d.fileName}
                      className="p-2 rounded-md text-slate-600 hover:bg-slate-100"
                      title="Indir"
                    >
                      <Download size={18} />
                    </a>
                    <button
                      onClick={() => {
                        setEditingId(d.id);
                        setEditName(d.fileName);
                      }}
                      className="p-2 rounded-md text-slate-600 hover:bg-slate-100"
                      title="Yeniden adlandir"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => remove(d.id)}
                      className="p-2 rounded-md text-rose-600 hover:bg-rose-50"
                      title="Sil"
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {scanOpen && (
        <PhotoToPdfScanner
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onDone={onScanDone}
          doneLabel="PDF Olustur"
          title="Belge Tarama"
        />
      )}

      {viewer && (
        <MediaViewer
          open
          items={viewer.items}
          index={viewer.index}
          onIndexChange={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onClose={() => setViewer(null)}
        />
      )}

      {pdf && (
        <PdfViewer fileUrl={pdf.fileUrl} fileName={pdf.fileName} onClose={() => setPdf(null)} />
      )}
    </div>
  );
}

