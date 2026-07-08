"use client";

import { useRef, useState } from "react";
import { Camera, Plus, Trash2, X, GripVertical, FileText } from "lucide-react";

export type ScanImage = { id: string; data: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onDone: (images: { data: string }[]) => void;
  doneLabel?: string;
  title?: string;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

export default function PhotoToPdfScanner({
  open,
  onClose,
  onDone,
  doneLabel = "PDF Olustur",
  title = "Fotograflar",
}: Props) {
  const [imgs, setImgs] = useState<ScanImage[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  if (!open) return null;

  const addFromFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items: ScanImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i);
      if (!f || !f.type.startsWith("image/")) continue;
      const data = await fileToDataUrl(f);
      items.push({ id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`, data });
    }
    setImgs((prev) => [...prev, ...items]);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addFromFiles(e.target.files);
    e.target.value = "";
  };

  const removeAt = (i: number) =>
    setImgs((prev) => prev.filter((_, idx) => idx !== i));

  const onDragStart = (i: number) => {
    dragIdx.current = i;
  };
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOverIdx(i);
  };
  const onDrop = (i: number) => {
    const from = dragIdx.current;
    dragIdx.current = null;
    setDragOverIdx(null);
    if (from === null || from === i) return;
    setImgs((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(i, 0, item);
      return next;
    });
  };

  // Touch fallback: tap-to-move (long press not needed; just reorder via arrow buttons)
  const moveLeft = (i: number) => {
    if (i <= 0) return;
    setImgs((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };
  const moveRight = (i: number) => {
    setImgs((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  const triggerCamera = () => {
    if (inputRef.current) {
      inputRef.current.setAttribute("capture", "environment");
      inputRef.current.click();
    }
  };
  const triggerGallery = () => {
    if (inputRef.current) {
      inputRef.current.removeAttribute("capture");
      inputRef.current.click();
    }
  };

  const handleClose = () => {
    setImgs([]);
    onClose();
  };

  const handleDone = () => {
    if (imgs.length === 0) return;
    onDone(imgs.map(({ data }) => ({ data })));
    setImgs([]);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-3"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-slate-600" />
            <h4 className="font-semibold text-slate-800">
              {title} ({imgs.length})
            </h4>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50 flex-wrap">
          <button
            onClick={triggerCamera}
            className="px-4 py-2.5 text-sm rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow hover:shadow-md inline-flex items-center gap-2"
          >
            <Camera size={16} /> Fotograf Cek
          </button>
          <button
            onClick={triggerGallery}
            className="px-4 py-2.5 text-sm rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
          >
            <Plus size={16} /> Galeriden Sec
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPick}
          />
        </div>

        <div className="flex-1 overflow-auto p-3">
          {imgs.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-12">
              Henuz fotograf yok. Yukaridan fotograf cekin veya galeriden secin.
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {imgs.map((im, i) => (
                <div
                  key={im.id}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDrop={() => onDrop(i)}
                  onDragEnd={() => {
                    dragIdx.current = null;
                    setDragOverIdx(null);
                  }}
                  className={`relative group aspect-[3/4] rounded-lg overflow-hidden bg-slate-100 border-2 ${
                    dragOverIdx === i ? "border-blue-500" : "border-slate-200"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.data} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-1 left-1 bg-black/60 text-white text-xs font-bold rounded px-1.5 py-0.5">
                    {i + 1}
                  </div>
                  <button
                    onClick={() => removeAt(i)}
                    className="absolute top-1 right-1 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1.5 shadow-lg"
                    title="Sil"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
                    <button
                      onClick={() => moveLeft(i)}
                      disabled={i === 0}
                      className="bg-white/90 hover:bg-white text-slate-700 rounded px-2 py-1 text-xs font-bold disabled:opacity-30"
                      title="Sola tasi"
                    >
                      ←
                    </button>
                    <div
                      className="bg-white/80 rounded p-1 cursor-grab active:cursor-grabbing"
                      title="Surukle"
                    >
                      <GripVertical size={12} className="text-slate-500" />
                    </div>
                    <button
                      onClick={() => moveRight(i)}
                      disabled={i === imgs.length - 1}
                      className="bg-white/90 hover:bg-white text-slate-700 rounded px-2 py-1 text-xs font-bold disabled:opacity-30"
                      title="Saga tasi"
                    >
                      →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-3 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 text-sm rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Vazgec
          </button>
          <button
            onClick={handleDone}
            disabled={imgs.length === 0}
            className="px-5 py-2.5 text-sm rounded-lg bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow hover:shadow-md disabled:opacity-50 font-semibold"
          >
            {doneLabel} ({imgs.length})
          </button>
        </div>
      </div>
    </div>
  );
}
