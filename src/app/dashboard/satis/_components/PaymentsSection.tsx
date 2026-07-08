"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, Plus, Trash2, Paperclip, Camera, FileText, X } from "lucide-react";
import CameraDialog from "./CameraDialog";
import PhotoToPdfScanner from "./PhotoToPdfScanner";
import MediaViewer, { type MediaItem } from "./MediaViewer";
import PdfViewer from "@/components/PdfViewer";
import { useDialog } from "./DialogProvider";
import { useDevice } from "@/hooks/useDevice";
import { imagesToPdfFile } from "@/lib/pdf-utils";

export type PaymentDoc = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
};

export type Payment = {
  id: string;
  amount: string;
  paidAt: string;
  method: string | null;
  notes: string | null;
  documents: PaymentDoc[];
};

type Props = {
  buyerId: string | null;
  price: string | null;
  targetType?: "unit" | "daire";
  targetId?: string;
  onTotalsChange?: (totalPaid: number, remaining: number | null) => void;
};

const formatTl = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0 });

export default function PaymentsSection({ buyerId, price, targetType, targetId, onTotalsChange }: Props) {
  const { alert, confirm } = useDialog();
  const { isMobile } = useDevice();
  const dekontCaptureRef = useRef<HTMLInputElement | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [dekontFile, setDekontFile] = useState<File | null>(null);
  const [scannedImages, setScannedImages] = useState<{ data: string }[]>([]);
  const [cameraOpen, setCameraOpen] = useState<null | "dekont" | "scan">(null);
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number } | null>(null);
  const [pdf, setPdf] = useState<{ fileUrl: string; fileName: string } | null>(null);

  const load = async () => {
    let bid = buyerId;
    if (!bid && targetType && targetId) {
      try {
        const res = await fetch(
          `/api/sales/buyers?targetType=${targetType}&targetId=${targetId}`
        );
        const data = await res.json();
        if (res.ok && data.buyer?.id) bid = data.buyer.id;
      } catch {}
    }
    if (!bid) {
      setPayments([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/payments?buyerId=${bid}`);
      const data = await res.json();
      if (res.ok) setPayments(data.payments || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerId, targetType, targetId]);

  const resolveBuyerId = async (): Promise<string | null> => {
    if (buyerId) return buyerId;
    if (!targetType || !targetId) return null;
    for (let i = 0; i < 12; i++) {
      try {
        const res = await fetch(
          `/api/sales/buyers?targetType=${targetType}&targetId=${targetId}`
        );
        const data = await res.json();
        if (res.ok && data.buyer?.id) return data.buyer.id as string;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const priceNum = price ? Number(price) : null;
  const remaining = priceNum != null ? Math.max(0, priceNum - totalPaid) : null;

  useEffect(() => {
    onTotalsChange?.(totalPaid, remaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPaid, remaining]);

  const submit = async () => {
    // Ödeme girebilmek için dairenin satış fiyatı girilmiş olmalı.
    if (priceNum == null || priceNum <= 0) {
      await alert({
        title: "Satış Fiyatı Gerekli",
        message: "Ödeme girebilmek için önce dairenin satış fiyatını girin.",
        variant: "warning",
      });
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      await alert("Geçerli bir tutar girin");
      return;
    }
    setSaving(true);
    try {
      const bId = await resolveBuyerId();
      if (!bId) {
        alert("Once alici adini yazin (otomatik kaydedilir)");
        setSaving(false);
        return;
      }
      let file: File | null = dekontFile;
      if (!file && scannedImages.length > 0) {
        file = await imagesToPdfFile(scannedImages, "Dekont");
      }
      const fd = new FormData();
      fd.append("buyerId", bId);
      fd.append("amount", String(n));
      fd.append("paidAt", paidAt);
      if (method) fd.append("method", method);
      if (notes) fd.append("notes", notes);
      if (file) fd.append("file", file);

      const res = await fetch("/api/sales/payments", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setPayments((prev) => [data.payment, ...prev]);
        setAdding(false);
        setAmount("");
        setMethod("");
        setNotes("");
        setDekontFile(null);
        setScannedImages([]);
      } else {
        alert(data.error || "Kaydedilemedi");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ message: "Bu ödemeyi silmek istediğinize emin misiniz?", variant: "danger", confirmText: "Sil" }))) return;
    const res = await fetch(`/api/sales/payments?paymentId=${id}`, { method: "DELETE" });
    if (res.ok) setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Banknote size={16} className="text-slate-600" />
          <h4 className="font-semibold text-sm text-slate-800">Alinan Odemeler</h4>
        </div>
        {(buyerId || (targetType && targetId)) && !adding && priceNum != null && priceNum > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="px-3.5 py-2 text-xs rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 text-white font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Yeni Ödeme
          </button>
        )}
      </div>

      {!buyerId && !(targetType && targetId) ? (
        <div className="text-xs text-gray-400 text-center py-3">
          Once alici adini yazin (otomatik kaydedilir)
        </div>
      ) : (
        <>
          {(priceNum == null || priceNum <= 0) && (
            <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Ödeme girebilmek için önce dairenin satış fiyatını girin.
            </div>
          )}
          <div className="flex items-center justify-between gap-2 mb-3 text-xs">
            <span className="text-slate-500">Toplam Alinan:</span>
            <span className="font-semibold text-emerald-700">{formatTl(totalPaid)} TL</span>
            {remaining != null && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">Kalan:</span>
                <span className="font-semibold text-rose-600">{formatTl(remaining)} TL</span>
              </>
            )}
          </div>

          {adding && (
            <div className="note-editor-in rounded-lg border border-slate-200 p-3 mb-3 bg-slate-50 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount ? Number(amount).toLocaleString("tr-TR") : ""}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Tutar (TL)"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                />
                <input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Odeme yontemi (Nakit / Havale / ...)"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Not"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <label className="px-3 py-2 text-xs rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1">
                  <Paperclip size={12} />
                  {dekontFile ? dekontFile.name : "Dekont sec"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setDekontFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  onClick={() => (isMobile ? dekontCaptureRef.current?.click() : setCameraOpen("dekont"))}
                  className="px-3 py-2 text-xs rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 active:scale-95 transition-all inline-flex items-center gap-1"
                >
                  <Camera size={12} /> Dekont çek
                </button>
                <input
                  ref={dekontCaptureRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const n = payments.reduce((s, p) => s + p.documents.length, 0) + 1;
                      setDekontFile(new File([f], `Dekont${n}.jpg`, { type: f.type || "image/jpeg" }));
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => setCameraOpen("scan")}
                  className="px-3 py-2 text-xs rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <FileText size={12} /> Coklu PDF ({scannedImages.length})
                </button>
                {scannedImages.length > 0 && (
                  <button
                    onClick={() => setScannedImages([])}
                    className="px-2 py-1 text-[10px] rounded-md bg-rose-50 text-rose-700 border border-rose-200"
                  >
                    Temizle
                  </button>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setAdding(false);
                    setAmount("");
                    setMethod("");
                    setNotes("");
                    setDekontFile(null);
                    setScannedImages([]);
                  }}
                  className="px-3 py-2 text-xs rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Vazgec
                </button>
                <button
                  onClick={submit}
                  disabled={saving}
                  className="px-5 py-2 text-xs rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 text-white font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-xs text-gray-400 text-center py-3">Yukleniyor...</div>
          ) : payments.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-3">Henuz odeme kaydi yok</div>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-emerald-700">
                        {formatTl(Number(p.amount))} TL
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(p.paidAt).toLocaleDateString("tr-TR")}
                      </span>
                      {p.method && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {p.method}
                        </span>
                      )}
                    </div>
                    {p.notes && <div className="text-[11px] text-slate-600 mt-0.5">{p.notes}</div>}
                    {p.documents.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {p.documents.map((d) => {
                          const isImg = d.mimeType?.startsWith("image/");
                          const isPdf = d.mimeType === "application/pdf" || d.fileName?.toLowerCase().endsWith(".pdf");
                          const cls = "text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100";
                          return isImg ? (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => {
                                const imgs = p.documents.filter((x) => x.mimeType?.startsWith("image/"));
                                const idx = imgs.findIndex((x) => x.id === d.id);
                                setViewer({ items: imgs, index: Math.max(0, idx) });
                              }}
                              className={cls}
                            >
                              <Paperclip size={10} /> {d.fileName}
                            </button>
                          ) : isPdf ? (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setPdf({ fileUrl: d.fileUrl, fileName: d.fileName })}
                              className={cls}
                            >
                              <Paperclip size={10} /> {d.fileName}
                            </button>
                          ) : (
                            <a key={d.id} href={d.fileUrl} target="_blank" rel="noreferrer" className={cls}>
                              <Paperclip size={10} /> {d.fileName}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => remove(p.id)}
                    className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50"
                    title="Sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <CameraDialog
        open={cameraOpen === "dekont"}
        type="photo"
        onClose={() => setCameraOpen(null)}
        onCapture={(blob, fileName) => {
          setDekontFile(new File([blob], fileName, { type: blob.type }));
          setCameraOpen(null);
        }}
      />
      {cameraOpen === "scan" && (
        <PhotoToPdfScanner
          open={true}
          onClose={() => setCameraOpen(null)}
          onDone={(imgs) => {
            setScannedImages((prev) => [...prev, ...imgs]);
            setCameraOpen(null);
          }}
          doneLabel="Tamam"
          title="Dekont Tarama"
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

