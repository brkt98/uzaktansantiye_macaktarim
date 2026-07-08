"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  Trash2,
  RotateCcw,
  X,
  Image,
  FileText,
  Film,
  Clock,
  AlertTriangle,
  ChevronDown,
  Search,
  Building2,
  MapPin,
  User,
  Eye,
  ZoomIn,
  Play,
  ChevronLeft,
  ChevronRight,
  Download,
  TrendingUp,
} from "lucide-react";

interface TrashItemData {
  id: string;
  siteId: string;
  siteName: string | null;
  blockId: string | null;
  blockName: string | null;
  itemType: string;
  itemName: string | null;
  deletedBy: string;
  deletedByName: string;
  deletedAt: string;
  originalData: Record<string, unknown>;
}

interface DeletedSiteData {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
  _count: { blocks: number; categories: number };
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  annotation: "Pin / Annotation",
  sales_project: "Satış Projesi",
  construction_media: "İnşaat Medyası",
  category_document: "Ruhsat Dosyası",
  construction_site: "Şantiye",
};

const ITEM_TYPE_COLORS: Record<string, string> = {
  annotation: "bg-purple-100 text-purple-700",
  sales_project: "bg-emerald-100 text-emerald-700",
  construction_media: "bg-blue-100 text-blue-700",
  category_document: "bg-amber-100 text-amber-700",
  construction_site: "bg-red-100 text-red-700",
};

function getRemainingDays(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const remaining = thirtyDays - (now - deleted);
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

function getItemIcon(itemType: string) {
  switch (itemType) {
    case "annotation": return <MapPin size={16} />;
    case "sales_project": return <TrendingUp size={16} />;
    case "construction_media": return <Image size={16} />;
    case "category_document": return <FileText size={16} />;
    default: return <FileText size={16} />;
  }
}

function getExtraInfo(item: TrashItemData): string {
  const data = item.originalData;
  const parts: string[] = [];

  if (item.itemType === "construction_media") {
    if (data.constructionType) {
      const typeMap: Record<string, string> = {
        KABA_INSAAT: "Kaba İnşaat",
        INCE_INSAAT: "İnce İşler",
        PEYZAJ: "Peyzaj",
        BINA_GENEL: "Bina Genel",
      };
      parts.push(typeMap[data.constructionType as string] || (data.constructionType as string));
    }
    if (data.floorName) parts.push(data.floorName as string);
    if (data.workName) parts.push(data.workName as string);
  } else if (item.itemType === "category_document") {
    if (data.categoryName) parts.push(data.categoryName as string);
    if (data.docGroup) {
      const groupMap: Record<string, string> = {
        mimari: "Mimari Proje", statik: "Statik Proje", mekanik: "Mekanik Proje",
        zemin: "Zemin Etüdü", uygulama: "Uygulama Projesi", elektrik: "Elektrik Projesi",
        ruhsat: "Ruhsat Belgesi", diger: "Diğer Belgeler",
      };
      parts.push(groupMap[data.docGroup as string] || (data.docGroup as string));
    }
    } else if (item.itemType === "annotation") {
      if (data.label) parts.push(data.label as string);
    } else if (item.itemType === "sales_project") {
      parts.push(data.sourceType === "site_sales_card" ? "Aktif Şantiye Kartı" : "Bağımsız Satış Projesi");
    }

  return parts.join(" → ");
}

function getPreviewFiles(item: TrashItemData): { url: string; mimeType: string; fileName: string }[] {
  const data = item.originalData;
  if (item.itemType === "construction_media") {
    const fileUrl = data.fileUrl as string;
    if (fileUrl) return [{ url: fileUrl, mimeType: (data.mimeType as string) || "", fileName: (data.fileName as string) || "dosya" }];
  } else if (item.itemType === "category_document") {
    const fileUrl = data.fileUrl as string;
    if (fileUrl) return [{ url: fileUrl, mimeType: (data.mimeType as string) || "", fileName: (data.fileName as string) || "dosya" }];
    } else if (item.itemType === "annotation") {
      const media = (data.media || []) as { fileUrl: string; mimeType?: string; fileName?: string }[];
      const checklistMedia = (data.checklistMedia || []) as { fileUrl: string; mimeType?: string; fileName?: string }[];
      return [...media, ...checklistMedia].map(m => ({
        url: m.fileUrl,
        mimeType: m.mimeType || "",
        fileName: m.fileName || m.fileUrl.split("/").pop() || "dosya",
      }));
    } else if (item.itemType === "sales_project" && data.sourceType === "standalone_project") {
      const blocks = (data.blocks || []) as {
        daires?: { media?: { fileUrl?: string; mimeType?: string; fileName?: string }[] }[];
      }[];
      return blocks.flatMap(block =>
        (block.daires || []).flatMap(daire =>
          (daire.media || [])
            .filter(m => m.fileUrl)
            .map(m => ({
              url: m.fileUrl || "",
              mimeType: m.mimeType || "",
              fileName: m.fileName || m.fileUrl?.split("/").pop() || "dosya",
            }))
        )
      );
    }
  return [];
}

function getFileCategory(mimeType: string, fileName: string): "image" | "video" | "pdf" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "heic", "heif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "other";
}

function formatFileSize(bytes: unknown): string {
  const size = Number(bytes);
  if (!size || isNaN(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TrashPage() {
  const router = useRouter();
  const [items, setItems] = useState<TrashItemData[]>([]);
  const [deletedSites, setDeletedSites] = useState<DeletedSiteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TrashItemData | null>(null);
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<DeletedSiteData | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<TrashItemData | null>(null);
  useBodyScrollLock(!!(confirmDelete || confirmDeleteSite || previewItem));
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    fetchTrash();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const fetchTrash = async () => {
    try {
      const res = await fetch("/api/trash");
      if (res.status === 403) {
        router.push("/dashboard");
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
      setDeletedSites(data.deletedSites || []);
    } catch {
      console.error("Trash fetch error");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item: TrashItemData) => {
    setRestoring(item.id);
    try {
      const res = await fetch(`/api/trash/${item.id}`, { method: "POST" });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        setToast("Öğe başarıyla geri yüklendi");
      } else {
        const data = await res.json();
        alert(data.error || "Geri yükleme başarısız");
      }
    } catch {
      alert("Geri yükleme sırasında hata oluştu");
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async (item: TrashItemData) => {
    setDeleting(item.id);
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/trash/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        setToast("Öğe kalıcı olarak silindi");
      } else {
        alert("Silme başarısız");
      }
    } catch {
      alert("Silme sırasında hata oluştu");
    } finally {
      setDeleting(null);
    }
  };

  const handleRestoreSite = async (site: DeletedSiteData) => {
    setRestoring(site.id);
    try {
      const res = await fetch(`/api/trash/site/${site.id}`, { method: "POST" });
      if (res.ok) {
        setDeletedSites(prev => prev.filter(s => s.id !== site.id));
        setToast("Şantiye başarıyla geri yüklendi");
      } else {
        const data = await res.json();
        alert(data.error || "Geri yükleme başarısız");
      }
    } catch {
      alert("Geri yükleme sırasında hata oluştu");
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDeleteSite = async (site: DeletedSiteData) => {
    setDeleting(site.id);
    setConfirmDeleteSite(null);
    try {
      const res = await fetch(`/api/trash/site/${site.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeletedSites(prev => prev.filter(s => s.id !== site.id));
        setToast("Şantiye kalıcı olarak silindi");
      } else {
        alert("Silme başarısız");
      }
    } catch {
      alert("Silme sırasında hata oluştu");
    } finally {
      setDeleting(null);
    }
  };

  const filteredItems = items.filter(item => {
    if (filter === "construction_site") return false;
    if (filter !== "all" && item.itemType !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (item.itemName?.toLowerCase().includes(q)) ||
        (item.siteName?.toLowerCase().includes(q)) ||
        (item.blockName?.toLowerCase().includes(q)) ||
        (item.deletedByName?.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const filteredSites = deletedSites.filter(site => {
    if (filter !== "all" && filter !== "construction_site") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        site.name.toLowerCase().includes(q) ||
        (site.address?.toLowerCase().includes(q)) ||
        (site.deletedByName?.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalCount = items.length + deletedSites.length;
  const typeCounts = {
    all: totalCount,
    construction_site: deletedSites.length,
      annotation: items.filter(i => i.itemType === "annotation").length,
      sales_project: items.filter(i => i.itemType === "sales_project").length,
    construction_media: items.filter(i => i.itemType === "construction_media").length,
    category_document: items.filter(i => i.itemType === "category_document").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#c0392b] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Trash2 size={20} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Çöp Kutusu</h1>
            <p className="text-sm text-gray-500">Silinen öğeler 30 gün sonra otomatik olarak kalıcı silinir</p>
          </div>
        </div>
        <span className="text-sm text-gray-400">{totalCount} öğe</span>
      </div>

      {/* Filters */}
      <div className="trash-filters flex flex-col gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all", label: "Tümü" },
            { key: "construction_site", label: "Şantiye" },
            { key: "construction_media", label: "İnşaat Medyası" },
            { key: "category_document", label: "Ruhsat Dosyası" },
              { key: "annotation", label: "Pin" },
              { key: "sales_project", label: "Satış Projesi" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all trash-filter-btn ${
                filter === f.key
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              } ${f.key === "annotation" ? "trash-filter-pin" : ""}`}
            >
              {f.label} ({typeCounts[f.key as keyof typeof typeCounts] || 0})
            </button>
          ))}
        </div>
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b]"
          />
        </div>
      </div>

      {/* Items */}
      {filteredItems.length === 0 && filteredSites.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Trash2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {totalCount === 0 ? "Çöp kutusu boş" : "Filtreye uygun öğe bulunamadı"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Silinmiş Şantiyeler */}
          {filteredSites.map(site => {
            const remaining = getRemainingDays(site.deletedAt);
            const isUrgent = remaining <= 5;

            return (
              <div
                key={`site-${site.id}`}
                className="bg-white rounded-lg border-2 border-red-200 p-3 sm:p-4 flex items-start sm:items-center gap-3 hover:shadow-sm transition-shadow"
              >
                {/* Site icon */}
                <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-100 text-red-700">
                  <Building2 size={20} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {site.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                      Şantiye
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {site._count.blocks} Blok, {site._count.categories} Kategori
                    {site.address ? ` — ${site.address}` : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400 flex-wrap">
                    {site.deletedByName && (
                      <span className="flex items-center gap-1">
                        <User size={10} />
                        {site.deletedByName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(site.deletedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`flex items-center gap-1 ${isUrgent ? "text-red-500 font-medium" : ""}`}>
                      {isUrgent && <AlertTriangle size={10} />}
                      {remaining} gün kaldı
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleRestoreSite(site)}
                    disabled={restoring === site.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-all disabled:opacity-50"
                    title="Geri Yükle"
                  >
                    <RotateCcw size={13} className={restoring === site.id ? "animate-spin" : ""} />
                    <span className="hidden sm:inline">Geri Yükle</span>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteSite(site)}
                    disabled={deleting === site.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all disabled:opacity-50"
                    title="Kalıcı Sil"
                  >
                    <Trash2 size={13} />
                    <span className="hidden sm:inline">Kalıcı Sil</span>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Normal TrashItem öğeleri */}
          {filteredItems.map(item => {
            const remaining = getRemainingDays(item.deletedAt);
            const isUrgent = remaining <= 5;
            const extraInfo = getExtraInfo(item);

            return (
              <div
                key={item.id}
                className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 flex items-start sm:items-center gap-3 hover:shadow-sm transition-shadow"
              >
                {/* Thumbnail / Preview */}
                {(() => {
                  const files = getPreviewFiles(item);
                  const first = files[0];
                  const cat = first ? getFileCategory(first.mimeType, first.fileName) : null;
                  const canPreview = files.length > 0;
                  return (
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 relative group overflow-hidden ${
                        canPreview ? "cursor-pointer" : ""
                      } ${cat === "image" && first ? "border border-gray-200 bg-gray-50" : ITEM_TYPE_COLORS[item.itemType] || "bg-gray-100 text-gray-600"}`}
                      onClick={() => { if (canPreview) { setPreviewIndex(0); setPreviewItem(item); } }}
                      title={canPreview ? "Önizleme" : undefined}
                    >
                      {cat === "image" && first ? (
                        <>
                          <img src={first.url} alt="" className="w-full h-full object-cover rounded-lg" onError={(e) => { const t = e.target as HTMLImageElement; t.style.display = 'none'; }} />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center rounded-lg">
                            <ZoomIn size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                          </div>
                        </>
                      ) : cat === "video" ? (
                        <>
                          {getItemIcon(item.itemType)}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center rounded-lg">
                            <Play size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </>
                      ) : canPreview ? (
                        <>
                          {getItemIcon(item.itemType)}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center rounded-lg">
                            <Eye size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </>
                      ) : (
                        getItemIcon(item.itemType)
                      )}
                    </div>
                  );
                })()}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {item.itemName || "İsimsiz"}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ITEM_TYPE_COLORS[item.itemType] || "bg-gray-100 text-gray-600"}`}>
                      {ITEM_TYPE_LABELS[item.itemType] || item.itemType}
                    </span>
                  </div>

                  {extraInfo && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{extraInfo}</p>
                  )}

                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400 flex-wrap">
                    {item.siteName && (
                      <span className="flex items-center gap-1">
                        <Building2 size={10} />
                        {item.siteName}
                      </span>
                    )}
                    {item.blockName && (
                      <span>{item.blockName}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {item.deletedByName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(item.deletedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`flex items-center gap-1 ${isUrgent ? "text-red-500 font-medium" : ""}`}>
                      {isUrgent && <AlertTriangle size={10} />}
                      {remaining} gün kaldı
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleRestore(item)}
                    disabled={restoring === item.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-all disabled:opacity-50"
                    title="Geri Yükle"
                  >
                    <RotateCcw size={13} className={restoring === item.id ? "animate-spin" : ""} />
                    <span className="hidden sm:inline">Geri Yükle</span>
                  </button>
                  <button
                    onClick={() => setConfirmDelete(item)}
                    disabled={deleting === item.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all disabled:opacity-50"
                    title="Kalıcı Sil"
                  >
                    <Trash2 size={13} />
                    <span className="hidden sm:inline">Kalıcı Sil</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 trash-delete-popup" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Kalıcı Silme Onayı</h3>
                <p className="text-xs text-gray-500">Bu işlem geri alınamaz</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{confirmDelete.itemName || "İsimsiz"}</strong> öğesi kalıcı olarak silinecek.
              Dosyalar diskten de kaldırılacak ve geri yükleme mümkün olmayacak.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                onClick={() => handlePermanentDelete(confirmDelete)}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all"
              >
                Kalıcı Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Site Modal */}
      {confirmDeleteSite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmDeleteSite(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 trash-delete-popup" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Şantiye Kalıcı Silme</h3>
                <p className="text-xs text-gray-500">Bu işlem geri alınamaz</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              <strong>&ldquo;{confirmDeleteSite.name}&rdquo;</strong> şantiyesi tüm blokları, kategorileri, dosyaları ve medyalarıyla birlikte kalıcı olarak silinecek.
            </p>
            <p className="text-xs text-red-500 mb-4">
              {confirmDeleteSite._count.blocks} blok, {confirmDeleteSite._count.categories} kategori ve tüm ilişkili veriler geri getirilemez şekilde silinecektir.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteSite(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                onClick={() => handlePermanentDeleteSite(confirmDeleteSite)}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all"
              >
                Kalıcı Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (() => {
        const files = getPreviewFiles(previewItem);
        const current = files[previewIndex] || files[0];
        if (!current) return null;
        const cat = getFileCategory(current.mimeType, current.fileName);
        const fileSize = previewItem.originalData.fileSize;

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setPreviewItem(null)}>
            <div className="relative w-full h-full flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Top bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-black/40">
                <div className="flex items-center gap-3 text-white min-w-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${ITEM_TYPE_COLORS[previewItem.itemType]}`}>
                    {ITEM_TYPE_LABELS[previewItem.itemType]}
                  </span>
                  <span className="text-sm font-medium truncate">{current.fileName}</span>
                  {fileSize ? <span className="text-xs text-gray-300">{formatFileSize(fileSize)}</span> : null}
                  {files.length > 1 && <span className="text-xs text-gray-400">{previewIndex + 1} / {files.length}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={current.url}
                    download={current.fileName}
                    className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    title="İndir"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download size={18} />
                  </a>
                  <button
                    onClick={() => setPreviewItem(null)}
                    className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 flex items-center justify-center p-4 relative" onClick={() => setPreviewItem(null)}>
                {/* Navigation arrows */}
                {files.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewIndex(i => Math.max(0, i - 1)); }}
                      disabled={previewIndex === 0}
                      className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all disabled:opacity-30"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewIndex(i => Math.min(files.length - 1, i + 1)); }}
                      disabled={previewIndex === files.length - 1}
                      className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all disabled:opacity-30"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}

                <div onClick={e => e.stopPropagation()} className="max-w-full max-h-full">
                  {cat === "image" ? (
                    <img
                      src={current.url}
                      alt={current.fileName}
                      className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
                    />
                  ) : cat === "video" ? (
                    <video
                      key={current.url}
                      src={current.url}
                      controls
                      autoPlay
                      className="max-w-[90vw] max-h-[80vh] rounded-lg shadow-2xl"
                    />
                  ) : cat === "pdf" ? (
                    <iframe
                      src={current.url}
                      className="w-[90vw] h-[80vh] rounded-lg shadow-2xl bg-white"
                      title={current.fileName}
                    />
                  ) : (
                    <div className="bg-white rounded-xl p-8 shadow-2xl text-center max-w-sm">
                      <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                      <p className="font-medium text-gray-900 mb-1">{current.fileName}</p>
                      <p className="text-sm text-gray-500 mb-4">Bu dosya türü önizlenemez</p>
                      <a
                        href={current.url}
                        download={current.fileName}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm hover:bg-[#15314f] transition-all"
                      >
                        <Download size={16} />
                        Dosyayı İndir
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom info */}
              <div className="px-4 py-2 bg-black/40 text-gray-300 text-xs flex items-center gap-4 flex-wrap">
                {previewItem.siteName && <span className="flex items-center gap-1"><Building2 size={10} /> {previewItem.siteName}</span>}
                {previewItem.blockName && <span>{previewItem.blockName}</span>}
                {getExtraInfo(previewItem) && <span>{getExtraInfo(previewItem)}</span>}
                <span className="flex items-center gap-1"><User size={10} /> {previewItem.deletedByName}</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(previewItem.deletedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-green-600 text-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-2 text-sm">
          <RotateCcw size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
