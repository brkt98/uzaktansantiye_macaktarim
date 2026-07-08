"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Home,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { useUser } from "@/app/dashboard/layout";
import { isSalesMediaOnly } from "@/lib/roles";
import { DialogProvider, useDialog } from "../../_components/DialogProvider";
import CameraDialog from "../../_components/CameraDialog";
import MediaViewer, { type MediaItem as ViewerItem } from "../../_components/MediaViewer";
import PdfViewer from "@/components/PdfViewer";
import BuildingView from "../../_components/BuildingView";
import BuyerSection, { type Buyer } from "../../_components/BuyerSection";
import PaymentsSection from "../../_components/PaymentsSection";
import DocumentsSection from "../../_components/DocumentsSection";
import PriceInput from "../../_components/PriceInput";
import PromoVideoCard from "../../_components/PromoVideoCard";
import { requestPageFullscreen } from "../../_components/openFullscreen";
import { useDevice } from "@/hooks/useDevice";

type DaireStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "LAND_OWNER";

type Daire = {
  id: string;
  name: string;
  order: number;
  status: DaireStatus;
  price: string | null;
  reservedFor: string | null;
  notes: string | null;
  floorId?: string | null;
  _count: { media: number };
  hasMedia?: boolean;
  hasDocuments?: boolean;
  buyerName?: string | null;
  buyerPhone?: string | null;
  totalPaid?: string | null;
  remainingAmount?: string | null;
};

type Floor = {
  id: string;
  name: string;
  order: number;
};

type Block = {
  id: string;
  name: string;
  order: number;
  floors?: Floor[];
  daires: Daire[];
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  blocks: Block[];
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

const STATUS_LABELS: Record<DaireStatus, string> = {
  AVAILABLE: "Boş",
  RESERVED: "Rezerve",
  SOLD: "Satıldı",
  LAND_OWNER: "Arsa Sahibi",
};
const STATUS_BG: Record<DaireStatus, string> = {
  AVAILABLE: "bg-green-100 hover:bg-green-200 border-green-300 text-green-800",
  RESERVED: "bg-yellow-100 hover:bg-yellow-200 border-yellow-300 text-yellow-800",
  SOLD: "bg-red-100 hover:bg-red-200 border-red-300 text-red-800",
  LAND_OWNER: "bg-purple-100 hover:bg-purple-200 border-purple-300 text-purple-800",
};

export default function SalesProjectDetailPage() {
  return (
    <DialogProvider>
      <SalesProjectDetailInner />
    </DialogProvider>
  );
}

function SalesProjectDetailInner() {
  const { alert, confirm } = useDialog();
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const { isMobile } = useDevice();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ block: Block; daire: Daire } | null>(null);
  const [editMode, setEditMode] = useState(false);
  // Daire alanları taslağı — yazdıkça kayıt YOK; yalnız "Kaydet" ile kaydedilir
  const [draftStatus, setDraftStatus] = useState<DaireStatus>("AVAILABLE");
  const [draftReservedFor, setDraftReservedFor] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [savingDaire, setSavingDaire] = useState(false);
  // "Belgeler" pop-up'ı + belge görüntüleyiciler (editör)
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

  // Bir daireyi açar: medya-only kullanıcı için viewer/uyarı, diğerleri için yönetim pop-up'ı.
  // Dairenin fotoğraf/videolarını doğrudan MediaViewer'da aç (düzenleme yok)
  const viewDaireMedia = async (block: Block, daire: Daire) => {
    setViewerTitle(`${block.name} · ${daire.name}`);
    try {
      const res = await fetch(`/api/sales/projects/${projectId}/daires/${daire.id}/media`);
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

  // Dairenin belgelerini pop-up'ta listele
  const viewDaireDocuments = async (block: Block, daire: Daire) => {
    try {
      const res = await fetch(`/api/sales/documents?targetType=daire&targetId=${daire.id}`);
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
      const res = await fetch(`/api/sales/projects/${projectId}`);
      const data = await res.json();
      if (res.ok) setProject(data.project);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) load();
  }, [projectId, load]);

  // medya yükle
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
          `/api/sales/projects/${projectId}/daires/${editing.daire.id}/media`
        );
        const data = await res.json();
        if (res.ok) setMedia(data.media || []);
      } finally {
        setMediaLoading(false);
      }
    })();
  }, [editing, projectId]);

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
    daire: Daire,
    patch: Partial<Pick<Daire, "name" | "status" | "price" | "reservedFor" | "notes">>
  ) => {
    const res = await fetch(
      `/api/sales/projects/${projectId}/daires/${daire.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const computeRemaining = (d: Daire): string | null => {
        const priceNum = d.price ? Number(d.price) : null;
        const paidNum = d.totalPaid ? Number(d.totalPaid) : 0;
        return priceNum != null ? Math.max(0, priceNum - paidNum).toFixed(2) : null;
      };
      setProject((prev) =>
        !prev
          ? prev
          : {
              ...prev,
              blocks: prev.blocks.map((b) => ({
                ...b,
                daires: b.daires.map((d) => {
                  if (d.id !== daire.id) return d;
                  const merged = {
                    ...d,
                    ...patch,
                    price:
                      patch.price !== undefined
                        ? (data.daire.price as string | null)
                        : d.price,
                  } as Daire;
                  if (patch.price !== undefined) {
                    merged.remainingAmount = computeRemaining(merged);
                  }
                  return merged;
                }),
              })),
            }
      );
      if (editing?.daire.id === daire.id) {
        setEditing((cur) => {
          if (!cur || cur.daire.id !== daire.id) return cur;
          const merged = { ...daire, ...patch } as Daire;
          if (patch.price !== undefined) {
            merged.price = data.daire.price as string | null;
            merged.remainingAmount = computeRemaining(merged);
          }
          return { block: cur.block, daire: merged };
        });
      }
    }
  };

  // Listeyi sunucudan sessizce tazele (tam sayfa spinner'ı tetiklemeden).
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/sales/projects/${projectId}`);
      const data = await res.json();
      if (res.ok) setProject(data.project);
    } catch {
      // sessiz
    }
  }, [projectId]);

  // Pop-up kapanırken: bekleyen fiyat değişikliğini kaydet, sonra listeyi tazeleyerek
  // tüm değişikliklerin (medya, alıcı, ödeme, belge, durum, fiyat) yansıdığını garanti et.
  const closeEditing = async () => {
    setEditing(null);
    await refresh();
  };

  // Tüm daire alanlarını TEK "Kaydet" butonuyla kaydet (status/fiyat/rezerve/not)
  const saveDaireFields = async () => {
    if (!editing || savingDaire) return;
    setSavingDaire(true);
    const el = document.getElementById("daire-price-input") as HTMLInputElement | null;
    const rawPrice = el ? el.value.replace(/\D/g, "") : "";
    try {
      await updateDaire(editing.daire, {
        status: draftStatus,
        price: (rawPrice || null) as string | null,
        reservedFor: draftReservedFor.trim() || null,
        notes: draftNotes.trim() || null,
      });
      setEditing(null);
      await refresh();
    } finally {
      setSavingDaire(false);
    }
  };

  const runSlideshow = async () => {
    if (!editing?.daire) return;
    const imgCount = media.filter((m) => m.mimeType?.startsWith("image/")).length;
    if (imgCount < 2) { alert("Slideshow icin en az 2 fotograf gerekli."); return; }
    if (!(await confirm({ message: `${imgCount} fotoğraftan slideshow oluşturulsun mu? (~30 sn)`, confirmText: "Oluştur" }))) return;
    try {
      const r = await fetch(
        `/api/sales/projects/${projectId}/daires/${editing.daire.id}/slideshow`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perImageSec: 3 }) }
      );
      const d = await r.json();
      if (!r.ok) { alert(d.error || "Olusturulamadi"); return; }
      setMedia((prev) => [d.media, ...prev]);
    } catch { alert("Hata olustu"); }
  };

  const handleFileUpload = async (file: File) => {
    if (!editing) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(
      `/api/sales/projects/${projectId}/daires/${editing.daire.id}/media`,
      { method: "POST", body: fd }
    );
    if (res.ok) {
      const data = await res.json();
      setMedia((prev) => [data.media, ...prev]);
      setProject((prev) =>
        !prev
          ? prev
          : {
              ...prev,
              blocks: prev.blocks.map((b) => ({
                ...b,
                daires: b.daires.map((d) =>
                  d.id === editing.daire.id
                    ? { ...d, _count: { media: d._count.media + 1 } }
                    : d
                ),
              })),
            }
      );
    } else {
      alert("Yükleme başarısız");
    }
  };

  const deleteMedia = async (id: string) => {
    if (!(await confirm({ message: "Bu medyayı silmek istediğinize emin misiniz?", variant: "danger", confirmText: "Sil" }))) return;
    const res = await fetch(
      `/api/sales/projects/${projectId}/daires/${editing?.daire.id}/media?mediaId=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setMedia((prev) => prev.filter((m) => m.id !== id));
      if (editing) {
        setProject((prev) =>
          !prev
            ? prev
            : {
                ...prev,
                blocks: prev.blocks.map((b) => ({
                  ...b,
                  daires: b.daires.map((d) =>
                    d.id === editing.daire.id
                      ? { ...d, _count: { media: Math.max(0, d._count.media - 1) } }
                      : d
                  ),
                })),
              }
        );
      }
    }
  };

  // EDIT MODE actions ──────────────────────────────────────
  const renameProject = async () => {
    if (!project) return;
    const name = prompt("Proje adı:", project.name)?.trim();
    if (!name || name === project.name) return;
    const res = await fetch(`/api/sales/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) load();
  };

  const deleteProject = async () => {
    if (!project) return;
    if (
      !(await confirm({
        title: "Projeyi Sil",
        message: `"${project.name}" projesini silmek istediğinize emin misiniz? Tüm bloklar, daireler ve medyalar silinir.`,
        variant: "danger",
        confirmText: "Sil",
      }))
    )
      return;
    const res = await fetch(`/api/sales/projects/${projectId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/satis");
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error || "Proje silinemedi");
    }
  };

  const addBlock = async () => {
    const name = prompt("Yeni blok adı:", "")?.trim();
    if (!name) return;
    const res = await fetch(`/api/sales/projects/${projectId}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) load();
  };

  const renameBlock = async (b: Block) => {
    const name = prompt("Blok adı:", b.name)?.trim();
    if (!name || name === b.name) return;
    const res = await fetch(
      `/api/sales/projects/${projectId}/blocks/${b.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }
    );
    if (res.ok) load();
  };

  const deleteBlock = async (b: Block) => {
    if (!(await confirm({ message: `"${b.name}" bloğunu silmek istediğinize emin misiniz?`, variant: "danger", confirmText: "Sil" }))) return;
    const res = await fetch(
      `/api/sales/projects/${projectId}/blocks/${b.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      if (openBlockId === b.id) setOpenBlockId(null);
      load();
    }
  };

  const addDaire = async (b: Block) => {
    const name = prompt("Yeni daire adı:", `Daire ${b.daires.length + 1}`)?.trim();
    if (!name) return;
    const res = await fetch(`/api/sales/projects/${projectId}/daires`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId: b.id, name }),
    });
    if (res.ok) load();
  };

  const bulkAddDaires = async (b: Block) => {
    const n = parseInt(prompt("Kaç daire eklensin?", "10") || "0", 10);
    if (!n || n < 1) return;
    for (let i = 0; i < n; i++) {
      await fetch(`/api/sales/projects/${projectId}/daires`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: b.id,
          name: `Daire ${b.daires.length + i + 1}`,
        }),
      });
    }
    load();
  };

  const renameDaire = async (d: Daire) => {
    const name = prompt("Daire adı:", d.name)?.trim();
    if (!name || name === d.name) return;
    await updateDaire(d, { name });
  };

  const deleteDaire = async (d: Daire) => {
    if (!(await confirm({ message: `"${d.name}" dairesini silmek istediğinize emin misiniz?`, variant: "danger", confirmText: "Sil" }))) return;
    const res = await fetch(
      `/api/sales/projects/${projectId}/daires/${d.id}`,
      { method: "DELETE" }
    );
    if (res.ok) load();
  };

  if (loading)
    return <div className="p-10 text-center text-gray-500">Yükleniyor...</div>;
  if (!project)
    return <div className="p-10 text-center text-gray-500">Proje bulunamadı.</div>;

  const openBlock = project.blocks.find((b) => b.id === openBlockId);

  // toplam istatistik
  const allDaires = project.blocks.flatMap((b) => b.daires);
  const sold = allDaires.filter((d) => d.status === "SOLD").length;
  const reserved = allDaires.filter((d) => d.status === "RESERVED").length;
  const available = allDaires.filter((d) => d.status === "AVAILABLE").length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <Link
          href="/dashboard/satis"
          aria-label="Geri"
          className="flex items-center justify-center p-3 min-w-[48px] min-h-[48px] hover:bg-gray-100 active:bg-gray-200 rounded-xl text-gray-700 border border-gray-200 shadow-sm transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-800 flex items-center gap-2">
          {project.name}
          {editMode && (
            <button
              onClick={renameProject}
              className="p-1.5 text-gray-400 hover:text-[#c0392b] hover:bg-red-50 rounded"
              title="Proje adını düzenle"
            >
              <Pencil size={16} />
            </button>
          )}
        </h1>
        <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#c0392b]/10 text-[#c0392b] px-2 py-0.5 rounded-full">
          Satış Projesi
        </span>
        {!salesMediaOnly && (
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 border-2 transition-colors ${
              editMode
                ? "bg-[#c0392b] text-white border-[#c0392b]"
                : "bg-white text-gray-700 border-gray-200 hover:border-[#c0392b]"
            }`}
          >
            <Edit3 size={14} />
            {editMode ? "Düzenleme: Açık" : "Düzenle"}
          </button>
          {editMode && (
            <button
              onClick={deleteProject}
              className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 border-2 border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Projeyi Sil
            </button>
          )}
        </div>
        )}
      </div>
      {project.description && (
        <p className="text-gray-500 ml-12 mb-4">{project.description}</p>
      )}

      <div className="flex items-center gap-2 ml-12 text-sm flex-wrap">
        <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700">
          <Home size={13} /> {available} boş
        </span>
        <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
          <Clock size={13} /> {reserved} rezerve
        </span>
        <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700">
          <CheckCircle2 size={13} /> {sold} satıldı
        </span>
      </div>

      {/* Bloklar */}
      {!openBlock ? (
        <>
          {project.blocks.length === 0 && !editMode ? (
            <div className="text-center py-16 text-gray-500 bg-white rounded-xl border-2 border-dashed mt-6">
              Henüz blok yok. &quot;Düzenle&quot; modunu açıp blok ekleyebilirsiniz.
            </div>
          ) : (
            <div className={isMobile ? "flex flex-col gap-3 mt-6" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6"}>
              <PromoVideoCard targetType="salesProject" targetId={projectId} canEdit={editMode || true} />
              {project.blocks.map((b) => {
                const t = b.daires.length;
                const sB = b.daires.filter((d) => d.status === "SOLD").length;
                const rB = b.daires.filter((d) => d.status === "RESERVED").length;
                const aB = b.daires.filter((d) => d.status === "AVAILABLE").length;
                return isMobile ? (
                  /* MOBİL: kompakt yatay satır */
                  <div
                    key={b.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 flex items-center gap-3 relative cursor-pointer active:scale-[0.99] transition-transform"
                    onClick={() => setOpenBlockId(b.id)}
                  >
                    <span className="shrink-0 w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center">
                      <Building2 size={22} className="text-[#1e3a5f]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base text-gray-800 truncate">{b.name}</h3>
                      <div className="text-[11px] text-gray-500">{t} daire</div>
                    </div>
                    {editMode ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); renameBlock(b); }} className="p-2 text-gray-500 hover:text-[#1e3a5f] hover:bg-blue-50 rounded-lg"><Pencil size={15} /></button>
                        <button onClick={(e) => { e.stopPropagation(); deleteBlock(b); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[11px] shrink-0">
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700"><Home size={10} /> {aB}</span>
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700"><Clock size={10} /> {rB}</span>
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"><CheckCircle2 size={10} /> {sB}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={b.id}
                    className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-[#1e3a5f] hover:shadow-lg transition-all p-6 flex flex-col items-center justify-center gap-3 text-center aspect-square relative cursor-pointer"
                    onClick={() => setOpenBlockId(b.id)}
                  >
                    {editMode && (
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            renameBlock(b);
                          }}
                          className="p-1.5 bg-white text-gray-500 hover:text-[#1e3a5f] hover:bg-blue-50 rounded shadow-sm"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBlock(b);
                          }}
                          className="p-1.5 bg-white text-red-500 hover:bg-red-50 rounded shadow-sm"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center">
                      <Building2 size={40} className="text-[#1e3a5f]" />
                    </div>
                    <h3 className="font-bold text-2xl text-gray-800">{b.name}</h3>
                    <div className="text-sm text-gray-500">{t} daire</div>
                    <div className="flex items-center gap-2 text-xs flex-wrap justify-center">
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        <Home size={11} /> {aB}
                      </span>
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        <Clock size={11} /> {rB}
                      </span>
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        <CheckCircle2 size={11} /> {sB}
                      </span>
                    </div>
                  </div>
                );
              })}

              {editMode && (
                <button
                  onClick={addBlock}
                  className="bg-white rounded-2xl border-2 border-dashed border-gray-300 hover:border-[#c0392b] hover:bg-red-50 transition-all p-6 flex flex-col items-center justify-center gap-3 text-center aspect-square text-gray-400 hover:text-[#c0392b]"
                >
                  <Plus size={36} />
                  <span className="font-semibold">Blok Ekle</span>
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-4 mt-4 flex-wrap">
            <button
              onClick={() => setOpenBlockId(null)}
              aria-label="Geri"
              className="flex items-center justify-center p-3 min-w-[48px] min-h-[48px] hover:bg-gray-100 active:bg-gray-200 rounded-xl text-gray-700 border border-gray-200 shadow-sm transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h2 className="text-2xl font-bold text-gray-800">{openBlock.name}</h2>
            {editMode && (
              <>
                <button
                  onClick={() => renameBlock(openBlock)}
                  className="p-1.5 text-gray-400 hover:text-[#1e3a5f] hover:bg-blue-50 rounded"
                  title="Blok adını düzenle"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => deleteBlock(openBlock)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Bloğu sil"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <div className="flex items-center gap-2 ml-auto text-sm">
              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700">
                <Home size={13} />{" "}
                {openBlock.daires.filter((d) => d.status === "AVAILABLE").length}
              </span>
              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
                <Clock size={13} />{" "}
                {openBlock.daires.filter((d) => d.status === "RESERVED").length}
              </span>
              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700">
                <CheckCircle2 size={13} />{" "}
                {openBlock.daires.filter((d) => d.status === "SOLD").length}
              </span>
            </div>
          </div>

          {editMode ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {openBlock.daires.map((d) => (
                <div
                  key={d.id}
                  className={`p-4 rounded-xl border-2 transition-all relative cursor-pointer ${STATUS_BG[d.status]}`}
                  onClick={() => openDaire(openBlock, d)}
                >
                  <div className="absolute top-1 right-1 flex gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        renameDaire(d);
                      }}
                      className="p-1 bg-white/80 text-gray-600 hover:bg-white rounded"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDaire(d);
                      }}
                      className="p-1 bg-white/80 text-red-500 hover:bg-white rounded"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div className="font-bold text-base">{d.name}</div>
                  <div className="text-xs font-medium mt-2">{STATUS_LABELS[d.status]}</div>
                  {d.price && (
                    <div className="text-xs mt-1">
                      {Number(d.price).toLocaleString("tr-TR")} ₺
                    </div>
                  )}
                  {d._count.media > 0 && (
                    <div className="text-[10px] mt-1 opacity-70">📷 {d._count.media}</div>
                  )}
                </div>
              ))}

              <button
                onClick={() => addDaire(openBlock)}
                className="p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#c0392b] hover:bg-red-50 text-gray-400 hover:text-[#c0392b] flex flex-col items-center justify-center gap-1"
              >
                <Plus size={20} />
                <span className="text-xs font-semibold">Daire Ekle</span>
              </button>
              <button
                onClick={() => bulkAddDaires(openBlock)}
                className="p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#1e3a5f] hover:bg-blue-50 text-gray-400 hover:text-[#1e3a5f] flex flex-col items-center justify-center gap-1"
              >
                <Plus size={20} />
                <span className="text-xs font-semibold">+ N Daire</span>
              </button>
            </div>
          ) : (
            <BuildingView
              block={{
                id: openBlock.id,
                name: openBlock.name,
                floors: openBlock.floors && openBlock.floors.length > 0
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
                          mediaCount: d._count.media,
                          hasMedia: d.hasMedia ?? d._count.media > 0,
                          hasDocuments: d.hasDocuments,
                          buyerName: d.buyerName,
                          buyerPhone: d.buyerPhone,
                          totalPaid: d.totalPaid,
                          remainingAmount: d.remainingAmount,
                        })),
                    }))
                  : undefined,
                daires: openBlock.daires.map((d) => ({
                  id: d.id,
                  name: d.name,
                  status: d.status,
                  price: d.price,
                  mediaCount: d._count.media,
                  hasMedia: d.hasMedia ?? d._count.media > 0,
                  hasDocuments: d.hasDocuments,
                  buyerName: d.buyerName,
                  buyerPhone: d.buyerPhone,
                  totalPaid: d.totalPaid,
                  remainingAmount: d.remainingAmount,
                })),
              }}
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
          )}
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
              </div>
              <button
                onClick={() => closeEditing()}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={22} />
              </button>
            </div>

            <div className={`p-5 space-y-5 ${isMobile ? "flex-1 overflow-y-auto" : ""}`}>
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

              <BuyerSection
                targetType="daire"
                targetId={editing.daire.id}
                onChange={(b) => {
                  setCurrentBuyer(b);
                  const block = editing.block;
                  const daire = editing.daire;
                  setProject((prev) =>
                    prev
                      ? {
                          ...prev,
                          blocks: prev.blocks.map((bl) =>
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
                          ),
                        }
                      : prev
                  );
                }}
              />
              <PaymentsSection
                buyerId={currentBuyer?.id ?? null}
                price={editing.daire.price}
                targetType="daire"
                targetId={editing.daire.id}
                onTotalsChange={(totalPaid, remaining) => {
                  const blockId = editing.block.id;
                  const daireId = editing.daire.id;
                  setProject((prev) =>
                    !prev
                      ? prev
                      : {
                          ...prev,
                          blocks: prev.blocks.map((b) =>
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
                                          remainingAmount:
                                            remaining != null ? remaining.toFixed(2) : d.remainingAmount,
                                        }
                                  ),
                                }
                          ),
                        }
                  );
                }}
              />
              <DocumentsSection
                targetType="daire"
                targetId={editing.daire.id}
              />

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
                      /* MOBİL: modern tek-satır medya butonları (şef foto/video-ekle ile aynı stil) */
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
                        <button onClick={runSlideshow} className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white shadow-sm active:scale-95 transition-transform">
                          <VideoIcon size={18} /><span className="text-[10px] font-semibold">Slayt</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg flex items-center gap-1.5 text-sm hover:bg-[#16304f]">
                          <Upload size={16} /> Yükle
                        </button>
                        <button onClick={() => triggerCamera("photo")} className="px-4 py-2.5 bg-[#c0392b] text-white rounded-lg flex items-center gap-1.5 text-sm hover:bg-[#a93226]">
                          <Camera size={16} /> Fotoğraf
                        </button>
                        <button onClick={() => triggerCamera("video")} className="px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg flex items-center gap-1.5 text-sm hover:bg-[#16304f]">
                          <VideoIcon size={16} /> Video
                        </button>
                        <button onClick={runSlideshow} className="px-4 py-2.5 bg-fuchsia-600 text-white rounded-lg flex items-center gap-1.5 text-sm hover:bg-fuchsia-700" title="Daire fotograflarindan otomatik slideshow video">
                          <VideoIcon size={16} /> Slideshow
                        </button>
                      </div>
                    )}
                  </>
                </div>

                {mediaLoading ? (
                  <div className="text-center py-6 text-sm text-gray-400">
                    Yükleniyor...
                  </div>
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
            {/* Kaydet footer — yazdıkça kayıt yok, her şey buradan kaydedilir */}
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
