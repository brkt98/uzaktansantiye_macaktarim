"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  Home,
  Clock,
  CheckCircle2,
  FileText,
  X,
  Upload,
  Camera,
  Trash2,
  Video as VideoIcon,
  Save,
} from "lucide-react";
import { useUser } from "@/app/dashboard/layout";
import { isSalesMediaOnly } from "@/lib/roles";
import { DialogProvider, useDialog } from "../_components/DialogProvider";
import CameraDialog from "../_components/CameraDialog";
import MediaViewer, { type MediaItem as ViewerItem } from "../_components/MediaViewer";
import PdfViewer from "@/components/PdfViewer";
import BuildingView, { type BuildingFloor } from "../_components/BuildingView";
import BuyerSection, { type Buyer } from "../_components/BuyerSection";
import PaymentsSection from "../_components/PaymentsSection";
import DocumentsSection from "../_components/DocumentsSection";
import PriceInput from "../_components/PriceInput";
import PromoVideoCard from "../_components/PromoVideoCard";
import { requestPageFullscreen } from "../_components/openFullscreen";
import { useDevice } from "@/hooks/useDevice";

type Daire = {
  id: string;
  name: string;
  floorId: string;
  floorName: string;
  salesUnitId: string | null;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "LAND_OWNER";
  price: string | null;
  reservedFor: string | null;
  notes: string | null;
  mediaCount: number;
  hasMedia?: boolean;
  hasDocuments?: boolean;
  buyerName?: string | null;
  buyerPhone?: string | null;
  totalPaid?: string | null;
  remainingAmount?: string | null;
};

type Block = {
  id: string;
  name: string;
  order: number;
  floors: { id: string; name: string }[];
  daires: Daire[];
  total: number;
  sold: number;
  reserved: number;
  available: number;
};

type SiteInfo = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
};

type MediaItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  title: string | null;
  description: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<Daire["status"], string> = {
  AVAILABLE: "Boş",
  RESERVED: "Rezerve",
  SOLD: "Satıldı",
  LAND_OWNER: "Arsa Sahibi",
};

const STATUS_BG: Record<Daire["status"], string> = {
  AVAILABLE: "bg-green-100 hover:bg-green-200 border-green-300 text-green-800",
  RESERVED: "bg-yellow-100 hover:bg-yellow-200 border-yellow-300 text-yellow-800",
  SOLD: "bg-red-100 hover:bg-red-200 border-red-300 text-red-800",
  LAND_OWNER: "bg-purple-100 hover:bg-purple-200 border-purple-300 text-purple-800",
};

export default function SalesDetailPage() {
  return (
    <DialogProvider>
      <SalesDetailInner />
    </DialogProvider>
  );
}

function SalesDetailInner() {
  const { alert, confirm } = useDialog();
  const params = useParams();
  const siteId = params?.id as string;
  const { isMobile } = useDevice();

  const [site, setSite] = useState<SiteInfo | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ block: Block; daire: Daire } | null>(null);
  // Daire alanları taslağı — yazdıkça kayıt YOK; yalnız "Kaydet" ile kaydedilir
  const [draftStatus, setDraftStatus] = useState<Daire["status"]>("AVAILABLE");
  const [draftReservedFor, setDraftReservedFor] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [savingDaire, setSavingDaire] = useState(false);
  const [docsPopup, setDocsPopup] = useState<{ title: string; items: ViewerItem[] } | null>(null);
  const [docPdf, setDocPdf] = useState<{ fileUrl: string; fileName: string } | null>(null);
  const [docImg, setDocImg] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerTitle, setViewerTitle] = useState<string | null>(null);
  const [noMediaWarn, setNoMediaWarn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState<null | "photo" | "video">(null);
  const [currentBuyer, setCurrentBuyer] = useState<Buyer | null>(null);
    useBodyScrollLock(!!(editing || viewerIndex !== null || cameraOpen || noMediaWarn));

  // Yalnızca Şantiye Şefi (admin/müdür/muhasebe değil): daireye tıklayınca yönetim
  // pop-up'ı yerine medya viewer açılır.
  const user = useUser();
  const salesMediaOnly = isSalesMediaOnly(user?.roles);

  const viewDaireMedia = async (block: Block, daire: Daire) => {
    setViewerTitle(`${block.name} · ${daire.name}`);
    try {
      const res = await fetch(
        `/api/sales/${siteId}/media?blockId=${block.id}&daireName=${encodeURIComponent(daire.name)}`
      );
      const data = await res.json();
      const items: MediaItem[] = res.ok ? data.media || [] : [];
      if (items.length > 0) {
        setMedia(items);
        setViewerIndex(0);
      } else {
        setNoMediaWarn(true);
      }
    } catch {
      setNoMediaWarn(true);
    }
  };

  const viewDaireDocuments = async (block: Block, daire: Daire) => {
    if (!daire.salesUnitId) { setDocsPopup({ title: `${block.name} · ${daire.name}`, items: [] }); return; }
    try {
      const res = await fetch(`/api/sales/documents?targetType=unit&targetId=${daire.salesUnitId}`);
      const data = await res.json();
      setDocsPopup({ title: `${block.name} · ${daire.name}`, items: res.ok ? data.documents || [] : [] });
    } catch {
      setDocsPopup({ title: `${block.name} · ${daire.name}`, items: [] });
    }
  };

  const openDaire = async (block: Block, daire: Daire) => {
    if (!salesMediaOnly) {
      setEditing({ block, daire });
      return;
    }
    await viewDaireMedia(block, daire);
  };

  const triggerCamera = (type: "photo" | "video") => {
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) {
      if (type === "photo") cameraPhotoRef.current?.click();
      else cameraVideoRef.current?.click();
      return;
    }
    setCameraOpen(type);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/${siteId}`);
      const data = await res.json();
      if (res.ok) {
        setSite(data.site);
        setBlocks(data.blocks || []);
      }
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (siteId) load();
  }, [siteId, load]);

  // Daire seçildiğinde medyayı yükle
  useEffect(() => {
    if (!editing) {
      setMedia([]);
      setCurrentBuyer(null);
      return;
    }
    setMediaLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/sales/${siteId}/media?blockId=${editing.block.id}&daireName=${encodeURIComponent(editing.daire.name)}`
        );
        const data = await res.json();
        if (res.ok) setMedia(data.media || []);
      } finally {
        setMediaLoading(false);
      }
    })();
  }, [editing, siteId]);

  // Popup acildiginda salesUnit yoksa otomatik olarak olustur (alici/odeme/belge icin gerekli)
  useEffect(() => {
    if (!editing || editing.daire.salesUnitId) return;
    const block = editing.block;
    const daire = editing.daire;
    (async () => {
      try {
        const res = await fetch(`/api/sales/${siteId}/units`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockId: block.id, daireName: daire.name }),
        });
        const data = await res.json();
        if (res.ok && data.unit?.id) {
          const newSalesUnitId = data.unit.id;
          setBlocks((prev) =>
            prev.map((b) =>
              b.id !== block.id
                ? b
                : {
                    ...b,
                    daires: b.daires.map((d) =>
                      d.id === daire.id ? { ...d, salesUnitId: newSalesUnitId } : d
                    ),
                  }
            )
          );
          setEditing((cur) =>
            cur && cur.daire.id === daire.id
              ? { block, daire: { ...cur.daire, salesUnitId: newSalesUnitId } }
              : cur
          );
        }
      } catch {}
    })();
  }, [editing, siteId]);

  // Düzenleme açılınca taslakları doldur (yazdıkça kayıt yok)
  useEffect(() => {
    if (editing) {
      setDraftStatus(editing.daire.status);
      setDraftReservedFor(editing.daire.reservedFor || "");
      setDraftNotes(editing.daire.notes || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.daire.id]);

  const updateDaire = async (
    block: Block,
    daire: Daire,
    patch: Partial<Pick<Daire, "status" | "price" | "reservedFor" | "notes">>
  ) => {
    const res = await fetch(`/api/sales/${siteId}/units`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId: block.id, daireName: daire.name, ...patch }),
    });
    if (res.ok) {
      // local state güncelle
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== block.id) return b;
          const newDaires = b.daires.map((d) => {
            if (d.id !== daire.id) return d;
            const merged = { ...d, ...patch } as Daire;
            if (patch.price !== undefined) {
              const priceNum = merged.price ? Number(merged.price) : null;
              const paidNum = merged.totalPaid ? Number(merged.totalPaid) : 0;
              merged.remainingAmount =
                priceNum != null ? Math.max(0, priceNum - paidNum).toFixed(2) : null;
            }
            return merged;
          });
          const sold = newDaires.filter((d) => d.status === "SOLD").length;
          const reserved = newDaires.filter((d) => d.status === "RESERVED").length;
          const available = newDaires.filter((d) => d.status === "AVAILABLE").length;
          return { ...b, daires: newDaires, sold, reserved, available };
        })
      );
      if (editing?.daire.id === daire.id) {
        setEditing((cur) => {
          if (!cur || cur.daire.id !== daire.id) return cur;
          const merged = { ...daire, ...patch } as Daire;
          if (patch.price !== undefined) {
            const priceNum = merged.price ? Number(merged.price) : null;
            const paidNum = merged.totalPaid ? Number(merged.totalPaid) : 0;
            merged.remainingAmount =
              priceNum != null ? Math.max(0, priceNum - paidNum).toFixed(2) : null;
          }
          return { block, daire: merged };
        });
      }
    }
  };

  // Listeyi sunucudan sessizce tazele (tam sayfa spinner'ı tetiklemeden).
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/sales/${siteId}`);
      const data = await res.json();
      if (res.ok) {
        setSite(data.site);
        setBlocks(data.blocks || []);
      }
    } catch {
      // sessiz
    }
  }, [siteId]);

  // Pop-up kapanırken: bekleyen fiyat değişikliğini kaydet, sonra listeyi tazeleyerek
  // tüm değişikliklerin (medya, alıcı, ödeme, belge, durum, fiyat) yansıdığını garanti et.
  const closeEditing = async () => {
    setEditing(null);
    await refresh();
  };

  // Tüm daire alanlarını TEK "Kaydet" butonuyla kaydet
  const saveDaireFields = async () => {
    if (!editing || savingDaire) return;
    setSavingDaire(true);
    const el = document.getElementById("daire-price-input") as HTMLInputElement | null;
    const rawPrice = el ? el.value.replace(/\D/g, "") : "";
    try {
      await updateDaire(editing.block, editing.daire, {
        status: draftStatus,
        price: rawPrice || null,
        reservedFor: draftReservedFor.trim() || null,
        notes: draftNotes.trim() || null,
      });
      setEditing(null);
      await refresh();
    } finally {
      setSavingDaire(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!editing) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("blockId", editing.block.id);
    fd.append("daireName", editing.daire.name);
    const res = await fetch(`/api/sales/${siteId}/media`, {
      method: "POST",
      body: fd,
    });
    if (res.ok) {
      const data = await res.json();
      setMedia((prev) => [data.media, ...prev]);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id !== editing.block.id
            ? b
            : {
                ...b,
                daires: b.daires.map((d) =>
                  d.id === editing.daire.id
                    ? { ...d, mediaCount: d.mediaCount + 1 }
                    : d
                ),
              }
        )
      );
    } else {
      alert("Yükleme başarısız");
    }
  };

  const deleteMedia = async (id: string) => {
    if (!(await confirm({ message: "Bu medyayı silmek istediğinize emin misiniz?", variant: "danger", confirmText: "Sil" }))) return;
    const res = await fetch(`/api/sales/${siteId}/media?mediaId=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMedia((prev) => prev.filter((m) => m.id !== id));
      if (editing) {
        setBlocks((prev) =>
          prev.map((b) =>
            b.id !== editing.block.id
              ? b
              : {
                  ...b,
                  daires: b.daires.map((d) =>
                    d.id === editing.daire.id
                      ? { ...d, mediaCount: Math.max(0, d.mediaCount - 1) }
                      : d
                  ),
                }
          )
        );
      }
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Yükleniyor...</div>;
  }
  if (!site) {
    return <div className="p-10 text-center text-gray-500">Şantiye bulunamadı.</div>;
  }

  const openBlock = blocks.find((b) => b.id === openBlockId);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link
          href="/dashboard/satis"
          aria-label="Geri"
          className="flex items-center justify-center p-3 min-w-[48px] min-h-[48px] hover:bg-gray-100 active:bg-gray-200 rounded-xl text-gray-700 border border-gray-200 shadow-sm transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-800">{site.name}</h1>
      </div>
      {site.description && <p className="text-gray-500 ml-12 mb-6">{site.description}</p>}

      {/* Blok kartları (resimdeki gibi) */}
      {!openBlock ? (
        blocks.length === 0 ? (
          <div className="text-center py-16 text-gray-500 bg-white rounded-xl border-2 border-dashed">
            Bu şantiyede henüz blok / daire tanımlı değil.
          </div>
        ) : (
          <div className={isMobile ? "flex flex-col gap-3 mt-6" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6"}>
            <PromoVideoCard targetType="constructionSite" targetId={siteId} />
            {blocks.map((b) => isMobile ? (
              /* MOBİL: kompakt yatay satır */
              <button
                key={b.id}
                onClick={() => setOpenBlockId(b.id)}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 active:scale-[0.99] transition-transform p-3 flex items-center gap-3 text-left"
              >
                <span className="shrink-0 w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Building2 size={22} className="text-[#1e3a5f]" />
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-gray-800 truncate">{b.name}</h3>
                  <div className="text-[11px] text-gray-500">{b.total} daire</div>
                </div>
                <div className="flex items-center gap-1 text-[11px] shrink-0">
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700"><Home size={10} /> {b.available}</span>
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700"><Clock size={10} /> {b.reserved}</span>
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"><CheckCircle2 size={10} /> {b.sold}</span>
                </div>
              </button>
            ) : (
              <button
                key={b.id}
                onClick={() => setOpenBlockId(b.id)}
                className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-[#1e3a5f] hover:shadow-lg transition-all p-6 flex flex-col items-center justify-center gap-3 text-center aspect-square"
              >
                <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <Building2 size={40} className="text-[#1e3a5f]" />
                </div>
                <h3 className="font-bold text-2xl text-gray-800">{b.name}</h3>
                <div className="text-sm text-gray-500">{b.total} daire</div>
                <div className="flex items-center gap-2 text-xs flex-wrap justify-center">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    <Home size={11} /> {b.available}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                    <Clock size={11} /> {b.reserved}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    <CheckCircle2 size={11} /> {b.sold}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-4 mt-4">
            <button
              onClick={() => setOpenBlockId(null)}
              aria-label="Geri"
              className="flex items-center justify-center p-3 min-w-[48px] min-h-[48px] hover:bg-gray-100 active:bg-gray-200 rounded-xl text-gray-700 border border-gray-200 shadow-sm transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h2 className="text-2xl font-bold text-gray-800">{openBlock.name}</h2>
            <div className="flex items-center gap-2 ml-auto text-sm">
              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700">
                <Home size={13} /> {openBlock.available} boş
              </span>
              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
                <Clock size={13} /> {openBlock.reserved} rezerve
              </span>
              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700">
                <CheckCircle2 size={13} /> {openBlock.sold} satıldı
              </span>
            </div>
          </div>

          {/* Bina gorunumu */}
          {(() => {
            const floors: BuildingFloor[] =
              openBlock.floors && openBlock.floors.length > 0
                ? openBlock.floors.map((f) => ({
                    id: f.id,
                    name: f.name,
                    daires: openBlock.daires
                      .filter((d) => d.floorId === f.id)
                      .map((d) => ({
                        id: d.id,
                        name: d.name,
                        status: d.status,
                        price: d.price,
                        floorId: d.floorId,
                        floorName: d.floorName,
                        mediaCount: d.mediaCount,
                        hasMedia: d.hasMedia ?? d.mediaCount > 0,
                        hasDocuments: d.hasDocuments,
                        buyerName: d.buyerName,
                        buyerPhone: d.buyerPhone,
                        totalPaid: d.totalPaid,
                        remainingAmount: d.remainingAmount,
                      })),
                  }))
                : [
                    {
                      id: "_flat",
                      name: "Daireler",
                      daires: openBlock.daires.map((d) => ({
                        id: d.id,
                        name: d.name,
                        status: d.status,
                        price: d.price,
                        floorId: d.floorId,
                        floorName: d.floorName,
                        mediaCount: d.mediaCount,
                        hasMedia: d.hasMedia ?? d.mediaCount > 0,
                        hasDocuments: d.hasDocuments,
                        buyerName: d.buyerName,
                        buyerPhone: d.buyerPhone,
                        totalPaid: d.totalPaid,
                        remainingAmount: d.remainingAmount,
                      })),
                    },
                  ];
            return (
              <BuildingView
                block={{ id: openBlock.id, name: openBlock.name, floors }}
                onDaireClick={(bd) => {
                  const d = openBlock.daires.find((x) => x.id === bd.id);
                  if (d) openDaire(openBlock, d);
                }}
                onShowMedia={salesMediaOnly ? undefined : (bd) => {
                  const d = openBlock.daires.find((x) => x.id === bd.id);
                  if (d) viewDaireMedia(openBlock, d);
                }}
                onShowDocuments={salesMediaOnly ? undefined : (bd) => {
                  const d = openBlock.daires.find((x) => x.id === bd.id);
                  if (d) viewDaireDocuments(openBlock, d);
                }}
              />
            );
          })()}
        </div>
      )}

      {/* Daire düzenleme + medya popup */}
      {editing && (
        <div
          className={`fixed inset-0 bg-black/60 z-50 flex ${isMobile ? "" : "items-center justify-center p-4"}`}
          onClick={() => closeEditing()}
        >
          <div
            className={`bg-white shadow-2xl w-full ${isMobile ? "h-full flex flex-col" : "rounded-2xl max-w-3xl max-h-[90vh] overflow-y-auto"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between p-5 border-b ${isMobile ? "modal-safe-top shrink-0" : ""}`}>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">
                  {editing.block.name} · {editing.daire.name}
                </h3>
                <p className="text-sm text-gray-500">{editing.daire.floorName}</p>
              </div>
              <button
                onClick={() => closeEditing()}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={22} />
              </button>
            </div>

            <div className={`p-5 space-y-5 ${isMobile ? "flex-1 overflow-y-auto" : ""}`}>
              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Durum
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["AVAILABLE", "RESERVED", "SOLD", "LAND_OWNER"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setDraftStatus(s)}
                      className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all active:scale-95 ${
                        draftStatus === s
                          ? STATUS_BG[s] + " ring-2 ring-offset-1 ring-current"
                          : "border-gray-200 text-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fiyat (₺)
                </label>
                <PriceInput
                  id="daire-price-input"
                  defaultValue={editing.daire.price || ""}
                  onBlurValue={() => {}}
                  placeholder="Örn: 2.500.000"
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-[#c0392b] focus:outline-none"
                />
              </div>

              {/* Reserved for & Notes */}
              {draftStatus === "RESERVED" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rezerve Eden
                  </label>
                  <input
                    type="text"
                    value={draftReservedFor}
                    onChange={(e) => setDraftReservedFor(e.target.value)}
                    placeholder="Müşteri adı / iletişim"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-[#c0392b] focus:outline-none"
                  />
                </div>
              )}

              {/* Alici / Odeme / Belge — salesUnit otomatik olusturulur */}
              {editing.daire.salesUnitId ? (
                <>
                  <BuyerSection
                    targetType="unit"
                    targetId={editing.daire.salesUnitId}
                    onChange={(b) => {
                      setCurrentBuyer(b);
                      const block = editing.block;
                      const daire = editing.daire;
                      setBlocks((prev) =>
                        prev.map((bl) =>
                          bl.id !== block.id
                            ? bl
                            : {
                                ...bl,
                                daires: bl.daires.map((d) =>
                                  d.id === daire.id
                                    ? {
                                        ...d,
                                        buyerName: b?.name ?? null,
                                        buyerPhone: b?.phone ?? null,
                                      }
                                    : d
                                ),
                              }
                        )
                      );
                    }}
                  />
                  <PaymentsSection
                    buyerId={currentBuyer?.id ?? null}
                    price={editing.daire.price}
                    targetType="unit"
                    targetId={editing.daire.salesUnitId}
                    onTotalsChange={(totalPaid, remaining) => {
                      const blockId = editing.block.id;
                      const daireId = editing.daire.id;
                      setBlocks((prev) =>
                        prev.map((b) =>
                          b.id !== blockId
                            ? b
                            : {
                                ...b,
                                daires: b.daires.map((d) =>
                                  d.id !== daireId
                                    ? d
                                    : {
                                        ...d,
                                        totalPaid: totalPaid.toFixed(2),
                                        remainingAmount: remaining != null ? remaining.toFixed(2) : d.remainingAmount,
                                      }
                                ),
                              }
                        )
                      );
                    }}
                  />
                  <DocumentsSection
                    targetType="unit"
                    targetId={editing.daire.salesUnitId}
                  />
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 text-center">
                  Hazirlaniyor...
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notlar
                </label>
                <textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-[#c0392b] focus:outline-none"
                />
              </div>

              {/* Medya */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
                  <label className="text-sm font-medium text-gray-700">
                    Medya ({media.length})
                  </label>
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      hidden
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        for (const f of files) await handleFileUpload(f);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    />
                    <input
                      ref={cameraPhotoRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) await handleFileUpload(f);
                        if (cameraPhotoRef.current) cameraPhotoRef.current.value = "";
                      }}
                    />
                    <input
                      ref={cameraVideoRef}
                      type="file"
                      accept="video/*"
                      capture="environment"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) await handleFileUpload(f);
                        if (cameraVideoRef.current) cameraVideoRef.current.value = "";
                      }}
                    />
                    {isMobile ? (
                      /* MOBİL: modern tek-satır medya butonları */
                      <div className="flex gap-1.5">
                        <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-sm active:scale-95 transition-transform">
                          <Upload size={18} /><span className="text-[10px] font-semibold">Yükle</span>
                        </button>
                        <button onClick={() => triggerCamera("photo")} className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm active:scale-95 transition-transform">
                          <Camera size={18} /><span className="text-[10px] font-semibold">Foto</span>
                        </button>
                        <button onClick={() => triggerCamera("video")} className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm active:scale-95 transition-transform">
                          <VideoIcon size={18} /><span className="text-[10px] font-semibold">Video</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg flex items-center gap-1.5 text-sm hover:bg-[#2a4a6f]">
                          <Upload size={16} /> Yükle
                        </button>
                        <button onClick={() => triggerCamera("photo")} className="px-4 py-2.5 bg-[#c0392b] text-white rounded-lg flex items-center gap-1.5 text-sm hover:bg-[#a93226]">
                          <Camera size={16} /> Fotoğraf
                        </button>
                        <button onClick={() => triggerCamera("video")} className="px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg flex items-center gap-1.5 text-sm hover:bg-[#16304f]">
                          <VideoIcon size={16} /> Video
                        </button>
                      </div>
                    )}
                  </>
                </div>

                {mediaLoading ? (
                  <div className="text-center py-6 text-sm text-gray-400">Yükleniyor...</div>
                ) : media.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed">
                    Henüz medya yok
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {media.map((m, i) => {
                      const isVideo = m.mimeType?.startsWith("video/");
                      return (
                        <div
                          key={m.id}
                          className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden group cursor-pointer"
                          onClick={() => {
                            requestPageFullscreen();
                            setViewerIndex(i);
                          }}
                        >
                          {isVideo ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
                              <VideoIcon size={32} />
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.fileUrl}
                              alt={m.title || m.fileName}
                              className="w-full h-full object-cover"
                            />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMedia(m.id);
                            }}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {/* Kaydet footer — yazdıkça kayıt yok, her şey buradan */}
            <div
              className={`px-5 py-3 border-t bg-white flex items-center justify-end gap-2 ${isMobile ? "shrink-0" : "sticky bottom-0"}`}
              style={isMobile ? { paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" } : undefined}
            >
              <button onClick={closeEditing} className="px-5 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 active:scale-95 transition-all">
                İptal
              </button>
              <button onClick={saveDaireFields} disabled={savingDaire} className="px-6 py-2.5 rounded-xl bg-[#c0392b] hover:bg-[#a93226] text-white font-semibold text-sm shadow-sm active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5">
                <Save size={16} /> {savingDaire ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gelişmiş medya viewer */}
      <MediaViewer
        open={viewerIndex !== null && !!media[viewerIndex ?? -1]}
        items={media}
        index={viewerIndex ?? 0}
        onIndexChange={(i) => setViewerIndex(i)}
        onClose={() => {
          setViewerIndex(null);
          if (salesMediaOnly) {
            setMedia([]);
            setViewerTitle(null);
          }
        }}
        onDelete={salesMediaOnly ? undefined : (item) => deleteMedia(item.id)}
        title={editing ? `${editing.block.name} · ${editing.daire.name}` : viewerTitle ?? undefined}
        subtitle={editing?.daire.floorName}
      />

      {/* Medya yok uyarısı (yalnızca medya-görüntüleme modundaki şantiye şefi için) */}
      {noMediaWarn && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
          onClick={() => setNoMediaWarn(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center border-[4px] border-amber-400"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Medya Yok</h3>
            <p className="text-sm text-gray-500 mb-5">Bu daire için medya yüklenmemiştir.</p>
            <button
              onClick={() => setNoMediaWarn(false)}
              className="px-6 py-2.5 bg-[#c0392b] hover:bg-[#a93226] text-white rounded-xl font-semibold"
            >
              Tamam
            </button>
          </div>
        </div>
      )}

      {/* In-app kamera */}
      <CameraDialog
        open={!!cameraOpen}
        type={cameraOpen ?? "photo"}
        onClose={() => setCameraOpen(null)}
        onCapture={async (blob, fileName) => {
          const f = new File([blob], fileName, { type: blob.type });
          await handleFileUpload(f);
        }}
      />

      {/* Belgeler pop-up'ı (editör) — resim→MediaViewer, PDF→PdfViewer */}
      {docsPopup && (
        <div className="fixed inset-0 bg-black/60 z-[45] flex flex-col" onClick={() => setDocsPopup(null)}>
          <div className="bg-white w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[80vh] sm:m-auto sm:rounded-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="modal-safe-top flex items-center justify-between px-4 py-3 border-b bg-[#1e3a5f] text-white shrink-0">
              <h3 className="font-bold text-base truncate">Belgeler · {docsPopup.title}</h3>
              <button onClick={() => setDocsPopup(null)} className="p-1.5 hover:bg-white/20 rounded"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {docsPopup.items.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-10">Belge yok</div>
              ) : docsPopup.items.map((d) => {
                const isImg = d.mimeType?.startsWith("image/");
                const isPdf = d.mimeType === "application/pdf" || d.fileName?.toLowerCase().endsWith(".pdf");
                return (
                  <button key={d.id} type="button"
                    onClick={() => {
                      if (isImg) {
                        const imgs = docsPopup.items.filter((x) => x.mimeType?.startsWith("image/"));
                        setDocImg({ items: imgs, index: Math.max(0, imgs.findIndex((x) => x.id === d.id)) });
                      } else if (isPdf) {
                        setDocPdf({ fileUrl: d.fileUrl, fileName: d.fileName });
                      } else {
                        window.open(d.fileUrl, "_blank");
                      }
                    }}
                    className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-[0.99] transition-all text-left">
                    <FileText size={18} className="text-[#1e3a5f] shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{d.fileName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {docImg && (
        <MediaViewer open items={docImg.items} index={docImg.index} onIndexChange={(i) => setDocImg((v) => (v ? { ...v, index: i } : v))} onClose={() => setDocImg(null)} />
      )}
      {docPdf && <PdfViewer fileUrl={docPdf.fileUrl} fileName={docPdf.fileName} onClose={() => setDocPdf(null)} />}
    </div>
  );
}
