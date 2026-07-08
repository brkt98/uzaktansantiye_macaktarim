"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "../layout";
import {
  Truck,
  Plus,
  Search,
  Trash2,
  Edit3,
  FileSpreadsheet,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Camera,
  Video,
  FolderOpen,
  Image as ImageIcon,
} from "lucide-react";
import MediaViewer, { type MediaItem as ViewerMediaItem } from "@/app/dashboard/satis/_components/MediaViewer";
import { requestPageFullscreen } from "@/app/dashboard/satis/_components/openFullscreen";
import { useDevice } from "@/hooks/useDevice";
import { downloadFile } from "@/lib/downloadFile";

interface Site {
  id: string;
  name: string;
}

interface TeslimatItemMedia {
  id: string;
  url: string;
  mimeType: string;
  fileName: string | null;
}

interface TeslimatItem {
  id?: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxRate?: number;
  media?: TeslimatItemMedia[];
}

interface Teslimat {
  id: string;
  irsaliyeNo: string;
  supplier: string | null;
  siteId: string | null;
  receivedBy: string;
  date: string;
  notes: string | null;
  site: { id: string; name: string } | null;
  items: TeslimatItem[];
}

const ITEMS_PER_PAGE = 10;

const UNIT_OPTIONS = [
  "metre",
  "metrekare",
  "metreküp",
  "adet",
  "kg",
  "ton",
  "paket",
  "saat",
];

export default function TeslimatPage() {
  const user = useUser();
  const { isMobile } = useDevice();
  const [matFocus, setMatFocus] = useState<number | null>(null); // malzeme önerisi açık olan kalem satırı (mobil)
  const [supFocus, setSupFocus] = useState(false); // tedarikçi önerisi açık mı (mobil)
  const [teslimatlar, setTeslimatlar] = useState<Teslimat[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSiteId, setFilterSiteId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Detail view
  const [viewingTeslimat, setViewingTeslimat] = useState<Teslimat | null>(null);

  // Form states
  const [formIrsaliyeNo, setFormIrsaliyeNo] = useState("");
  const [formSupplier, setFormSupplier] = useState("");
  const [formSiteId, setFormSiteId] = useState("");
  const [formReceivedBy, setFormReceivedBy] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formNotes, setFormNotes] = useState("");
  const [formItems, setFormItems] = useState<TeslimatItem[]>([
    { materialName: "", unit: "adet", quantity: 0, unitPrice: 0, totalPrice: 0, taxRate: 0 },
  ]);

  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Her form kalemi için bekleyen yeni dosyalar (paralel dizi)
  const [formItemFiles, setFormItemFiles] = useState<File[][]>([[]]);
  // Düzenleme modunda silinmek istenen mevcut medya id'leri
  const [removedMediaIds, setRemovedMediaIds] = useState<{ [itemId: string]: string[] }>({});
  // Hangi kaleme dosya seçimi yapılıyor
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const photoCaptureInputRef = useRef<HTMLInputElement>(null);
  const videoCaptureInputRef = useRef<HTMLInputElement>(null);

  // Detay pop-up'ında medya viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState<ViewerMediaItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerTitle, setViewerTitle] = useState("");

  // Otomatik tamamlama (gecmis girilenlerden oneriler)
  const [materialSuggestions, setMaterialSuggestions] = useState<string[]>([]);
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/teslimat/suggestions")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setMaterialSuggestions(d.materials || []);
          setSupplierSuggestions(d.suppliers || []);
        }
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (filterSiteId) params.set("siteId", filterSiteId);

      const [tRes, sRes] = await Promise.all([
        fetch(`/api/teslimat?${params.toString()}`),
        fetch("/api/sites"),
      ]);
      const tData = await tRes.json();
      const sData = await sRes.json();
      setTeslimatlar(tData.teslimatlar || []);
      setSites(sData.sites || []);
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterSiteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterSiteId]);

  // Pagination
  const totalPages = Math.ceil(teslimatlar.length / ITEMS_PER_PAGE);
  const paginatedData = teslimatlar.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const resetForm = () => {
    setFormIrsaliyeNo("");
    setFormSupplier("");
    setFormSiteId("");
    setFormReceivedBy("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormNotes("");
    setFormItems([{ materialName: "", unit: "adet", quantity: 0, unitPrice: 0, totalPrice: 0, taxRate: 0 }]);
    setFormItemFiles([[]]);
    setRemovedMediaIds({});
    setActiveItemIdx(null);
    setEditingId(null);
  };

  const openNewForm = () => {
    resetForm();
    if (user) {
      setFormReceivedBy(`${user.firstName} ${user.lastName}`.trim());
    }
    setShowForm(true);
  };

  const openEditForm = (t: Teslimat) => {
    setEditingId(t.id);
    setFormIrsaliyeNo(t.irsaliyeNo);
    setFormSupplier(t.supplier || "");
    setFormSiteId(t.siteId || "");
    setFormReceivedBy(t.receivedBy);
    setFormDate(t.date.split("T")[0]);
    setFormNotes(t.notes || "");
    setFormItems(
      t.items.map((i) => ({
        id: i.id,
        materialName: i.materialName,
        unit: i.unit,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
        taxRate: i.taxRate ?? 0,
        media: i.media || [],
      }))
    );
    setFormItemFiles(t.items.map(() => []));
    setRemovedMediaIds({});
    setActiveItemIdx(null);
    setShowForm(true);
  };

  const updateItem = (index: number, field: keyof TeslimatItem, value: string | number) => {
    setFormItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        item.totalPrice = Number(item.quantity) * Number(item.unitPrice);
      }
      updated[index] = item;
      return updated;
    });
  };

  const addItemRow = () => {
    setFormItems((prev) => [
      ...prev,
      { materialName: "", unit: "adet", quantity: 0, unitPrice: 0, totalPrice: 0, taxRate: 0, media: [] },
    ]);
    setFormItemFiles((prev) => [...prev, []]);
  };

  const removeItemRow = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems((prev) => prev.filter((_, i) => i !== index));
    setFormItemFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Per-item dosya seçim akışı (kamera/galeri) ──
  const triggerItemCapture = (idx: number, type: "photo" | "video" | "gallery") => {
    setActiveItemIdx(idx);
    setTimeout(() => {
      if (type === "photo") photoCaptureInputRef.current?.click();
      else if (type === "video") videoCaptureInputRef.current?.click();
      else galleryInputRef.current?.click();
    }, 0);
  };
  const handleItemFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeItemIdx === null) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      setActiveItemIdx(null);
      return;
    }
    const idx = activeItemIdx;
    setFormItemFiles((prev) => {
      const n = [...prev];
      while (n.length <= idx) n.push([]);
      n[idx] = [...(n[idx] || []), ...files];
      return n;
    });
    setActiveItemIdx(null);
    if (e.target) e.target.value = "";
  };
  const removePendingFile = (itemIdx: number, fileIdx: number) => {
    setFormItemFiles((prev) => {
      const n = [...prev];
      if (!n[itemIdx]) return n;
      n[itemIdx] = n[itemIdx].filter((_, i) => i !== fileIdx);
      return n;
    });
  };
  const removeExistingMedia = (itemIdx: number, mediaId: string) => {
    const item = formItems[itemIdx];
    if (!item || !item.id) return;
    setFormItems((prev) => {
      const n = [...prev];
      n[itemIdx] = { ...n[itemIdx], media: (n[itemIdx].media || []).filter((m) => m.id !== mediaId) };
      return n;
    });
    setRemovedMediaIds((prev) => ({
      ...prev,
      [item.id!]: [...(prev[item.id!] || []), mediaId],
    }));
  };

  const totalGross = formItems.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0
  );
  const totalNet = formItems.reduce(
    (sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)) / (1 + (Number(item.taxRate) || 0) / 100),
    0
  );
  const totalKdv = totalGross - totalNet;

  const handleSave = async () => {
    if (!formReceivedBy.trim() || !formDate) {
      alert("Teslim alan ve tarih zorunludur.");
      return;
    }
    const validItems = formItems.filter((i) => i.materialName.trim());
    if (validItems.length === 0) {
      alert("En az bir malzeme kalemi ekleyin.");
      return;
    }
    for (const item of validItems) {
      if (!item.unit.trim() || item.quantity <= 0) {
        alert("Tüm kalemlerde birim ve miktar gerekli.");
        return;
      }
    }

    setSaving(true);
    try {
      // Geçerli kalemlerin orijinal indekslerini takip et — medya yüklemesi için
      const validIndexMap: number[] = [];
      formItems.forEach((it, originalIdx) => {
        if (it.materialName.trim()) validIndexMap.push(originalIdx);
      });

      const payload = {
        irsaliyeNo: formIrsaliyeNo.trim() || null,
        supplier: formSupplier.trim() || null,
        siteId: formSiteId || null,
        receivedBy: formReceivedBy.trim(),
        date: formDate,
        notes: formNotes.trim() || null,
        items: validItems.map((i) => ({
          id: i.id, // mevcut kalemleri korumak için
          materialName: i.materialName.trim(),
          unit: i.unit.trim(),
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          taxRate: Number(i.taxRate) || 0,
        })),
      };

      const url = editingId ? `/api/teslimat/${editingId}` : "/api/teslimat";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Kayıt sırasında hata oluştu");
        return;
      }

      // Sunucudan dönen kalemlerle eşleştirip medya yükle / sil
      const data = await res.json().catch(() => null);
      const savedItems = (data?.teslimat?.items || []) as { id: string }[];
      const tasks: Promise<unknown>[] = [];

      // 1) Silinmek istenen mevcut medyaları kaldır
      for (const [itemId, mediaIds] of Object.entries(removedMediaIds)) {
        for (const mid of mediaIds) {
          tasks.push(
            fetch(`/api/teslimat-items/${itemId}/media/${mid}`, { method: "DELETE" })
          );
        }
      }
      // 2) Yeni dosyaları sırasıyla yükle (validIdx → savedItem eşleşmesi)
      for (let vi = 0; vi < validIndexMap.length && vi < savedItems.length; vi++) {
        const originalIdx = validIndexMap[vi];
        const files = formItemFiles[originalIdx] || [];
        if (files.length === 0) continue;
        const fd = new FormData();
        for (const f of files) fd.append("files", f);
        tasks.push(
          fetch(`/api/teslimat-items/${savedItems[vi].id}/media`, {
            method: "POST",
            body: fd,
          })
        );
      }
      if (tasks.length > 0) {
        await Promise.all(tasks).catch(() => {});
      }

      setShowForm(false);
      resetForm();
      setLoading(true);
      fetchData();
    } catch (error) {
      console.error("Save error:", error);
      alert("Kayıt sırasında hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // ── Detay pop-up'ında kalem fotoğraflarını aç ──
  const openItemMediaViewer = (item: TeslimatItem) => {
    if (!item.media || item.media.length === 0) return;
    const items: ViewerMediaItem[] = item.media.map((m) => ({
      id: m.id,
      fileName: m.fileName || "",
      fileUrl: `/api/teslimat-items/file/${m.id}`,
      mimeType: m.mimeType,
    }));
    requestPageFullscreen();
    setViewerItems(items);
    setViewerIndex(0);
    setViewerTitle(item.materialName);
    setViewerOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/teslimat/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Silme sırasında hata oluştu");
        return;
      }
      setDeleteConfirm(null);
      setShowForm(false);
      resetForm();
      setLoading(true);
      fetchData();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Silme sırasında hata oluştu");
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (filterSiteId) params.set("siteId", filterSiteId);
    const url = `/api/teslimat/export?${params.toString()}`;
    // Capacitor WebView'de window.open(_blank) çalışmaz → downloadFile (native: Belgeler'e yazar; web: <a download>)
    try {
      const msg = await downloadFile(url, "teslimatlar.xlsx");
      if (msg) alert(msg);
    } catch {
      alert("İndirme başarısız oldu. Lütfen tekrar deneyin.");
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("tr-TR");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#c0392b] border-t-transparent"></div>
          <p className="text-gray-500">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#c0392b] text-white p-2 rounded-lg">
            <Truck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Teslimat</h1>
            <p className="text-sm text-gray-500">{teslimatlar.length} kayıt</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            onClick={openNewForm}
            className="flex items-center gap-2 px-4 py-2 bg-[#c0392b] text-white rounded-lg hover:bg-[#a93226] transition-colors active:scale-95"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Yeni Teslimat</span>
            <span className="sm:hidden">Teslimat Ekle</span>
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="İrsaliye no, tedarikçi, malzeme veya teslim alan ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
          />
        </div>
        <select
          value={filterSiteId}
          onChange={(e) => setFilterSiteId(e.target.value)}
          className="px-4 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
        >
          <option value="">Tüm Şantiyeler</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Liste */}
      {teslimatlar.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">
          <FileSpreadsheet size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">Henüz teslimat kaydı yok</p>
          <p className="text-sm mt-1">Yeni teslimat eklemek için butona tıklayın</p>
        </div>
      ) : isMobile ? (
        /* Mobil: yatay kaydırma + satır-içi düzenle YOK → kart listesi (düzenleme detay görünümünde) */
        <div className="space-y-2">
          {paginatedData.map((t) => {
            const total = t.items.reduce((s, i) => s + i.totalPrice, 0);
            const totalMedia = t.items.reduce((s, i) => s + (i.media?.length ?? 0), 0);
            return (
              <button
                key={t.id}
                onClick={() => setViewingTeslimat(t)}
                className="w-full text-left rounded-xl border border-gray-100 bg-white p-3 shadow-sm active:scale-[0.99] transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{t.supplier || "Tedarikçi belirtilmedi"}</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{t.site?.name || "Şantiye belirtilmedi"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-[#c0392b] whitespace-nowrap">{formatCurrency(total)}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{formatDate(t.date)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50 text-xs text-gray-500">
                  <span className="truncate">İrsaliye: {t.irsaliyeNo || "—"} · {t.items.length} kalem</span>
                  {totalMedia > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-blue-700 font-bold ml-auto shrink-0"><Camera size={12} />{totalMedia}</span>
                  )}
                </div>
              </button>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1 py-2">
              <span className="text-sm text-gray-500">{(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, teslimatlar.length)} / {teslimatlar.length}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={18} /></button>
                <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Tarih</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">İrsaliye No</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Tedarikçi</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Şantiye</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Malzemeler</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Teslim Alan</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Toplam</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 w-24">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((t) => {
                    const total = t.items.reduce((s, i) => s + i.totalPrice, 0);
                    return (
                      <tr
                        key={t.id}
                        className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setViewingTeslimat(t)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(t.date)}</td>
                        <td className="px-4 py-3 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <span>{t.irsaliyeNo || <span className="text-gray-400">—</span>}</span>
                            {(() => {
                              const totalMedia = t.items.reduce((s, i) => s + (i.media?.length ?? 0), 0);
                              return totalMedia > 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-blue-700 font-bold text-xs">
                                  <Camera size={13} />
                                  {totalMedia}
                                </span>
                              ) : null;
                            })()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{t.supplier || "-"}</td>
                        <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{t.site?.name || "-"}</td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell max-w-[200px] truncate">
                          {t.items.map((i) => i.materialName).join(", ")}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{t.receivedBy}</td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatCurrency(total)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditForm(t); }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit3 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-gray-500">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, teslimatlar.length)} / {teslimatlar.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
        </div>
      )}

      {/* Detail View Modal */}
      {viewingTeslimat && (
        <div className={`fixed inset-0 bg-black/50 z-50 ${isMobile ? "" : "flex items-center justify-center p-4"}`} onClick={() => setViewingTeslimat(null)}>
          <div className={`bg-white flex flex-col ${isMobile ? "w-full h-full" : "rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh]"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center gap-2 border-b shrink-0 ${isMobile ? "modal-safe-top px-2 pb-3" : "justify-between p-5"}`}>
              {isMobile && (
                <button onClick={() => setViewingTeslimat(null)} className="inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-gray-100 active:scale-90 text-gray-700 shrink-0 transition" aria-label="Geri">
                  <ChevronLeft size={26} />
                </button>
              )}
              <h2 className="text-lg font-bold text-gray-800 flex-1 min-w-0 truncate">Teslimat Detayı</h2>
              {!isMobile && (
                <button onClick={() => setViewingTeslimat(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X size={20} />
                </button>
              )}
            </div>
            <div
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
              style={isMobile ? { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" } : undefined}
            >
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">İrsaliye No:</span> <span className="font-medium ml-1">{viewingTeslimat.irsaliyeNo || "—"}</span></div>
                <div><span className="text-gray-500">Tarih:</span> <span className="font-medium ml-1">{formatDate(viewingTeslimat.date)}</span></div>
                <div><span className="text-gray-500">Tedarikçi:</span> <span className="font-medium ml-1">{viewingTeslimat.supplier || "-"}</span></div>
                <div><span className="text-gray-500">Şantiye:</span> <span className="font-medium ml-1">{viewingTeslimat.site?.name || "-"}</span></div>
                <div><span className="text-gray-500">Teslim Alan:</span> <span className="font-medium ml-1">{viewingTeslimat.receivedBy}</span></div>
                {viewingTeslimat.notes && (
                  <div className="col-span-2"><span className="text-gray-500">Notlar:</span> <span className="ml-1">{viewingTeslimat.notes}</span></div>
                )}
              </div>

              {(() => {
                const showPrice = viewingTeslimat.items.some((i) => (i.unitPrice ?? 0) > 0);
                return (
                <div className="overflow-x-auto">
                  {/* style display:table → globals [data-device=mobile] main table{display:block} kuralını ezer;
                      w-full + Malzeme w-full → satırı tam kaplar; fiyat yoksa 2 sütun → yatay kaydırma gerekmez */}
                  <table style={{ display: "table", width: "100%" }} className="w-full text-[11px] sm:text-sm border-collapse border border-gray-400">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left px-2 sm:px-3 py-2 border border-gray-400 w-full">Malzeme</th>
                        <th className="text-right px-2 sm:px-3 py-2 border border-gray-400 whitespace-nowrap">Miktar</th>
                        {showPrice && (
                          <>
                            <th className="text-right px-2 sm:px-3 py-2 border border-gray-400 whitespace-nowrap">Birim Fiyat</th>
                            <th className="text-right px-2 sm:px-3 py-2 border border-gray-400">KDV</th>
                            <th className="text-right px-2 sm:px-3 py-2 border border-gray-400">Toplam</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {viewingTeslimat.items.map((item, i) => {
                        const lineGross = item.quantity * item.unitPrice;
                        const lineNet = lineGross / (1 + (item.taxRate ?? 0) / 100);
                        const lineKdv = lineGross - lineNet;
                        const hasMedia = (item.media?.length ?? 0) > 0;
                        return (
                        <tr key={i}
                          onClick={hasMedia ? () => openItemMediaViewer(item) : undefined}
                          className={hasMedia ? "cursor-pointer hover:bg-blue-50" : ""}
                          title={hasMedia ? "Fotoğrafları görüntülemek için tıklayın" : undefined}
                        >
                          <td className="px-2 sm:px-3 py-2 border border-gray-400">
                            <div className="flex items-center gap-1.5">
                              <span>{item.materialName}</span>
                              {hasMedia && (
                                <span className="inline-flex items-center gap-0.5 text-blue-600" title={`${item.media!.length} medya`}>
                                  <span>📷</span>
                                  <span className="text-[10px] font-bold">{item.media!.length}</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-right border border-gray-400 whitespace-nowrap">{item.quantity} {item.unit}</td>
                          {showPrice && (
                            <>
                              <td className="px-2 sm:px-3 py-2 text-right border border-gray-400 whitespace-nowrap">{formatCurrency(item.unitPrice)}</td>
                              <td className="px-2 sm:px-3 py-2 text-right border border-gray-400 whitespace-nowrap">
                                <div>%{item.taxRate ?? 0}</div>
                                {!isMobile && <div className="text-[10px] text-gray-500">{formatCurrency(lineKdv)}</div>}
                              </td>
                              <td className="px-2 sm:px-3 py-2 text-right font-medium border border-gray-400 whitespace-nowrap">
                                <div className="text-[#c0392b]">{formatCurrency(lineGross)}</div>
                                {!isMobile && <div className="text-[10px] text-gray-500 font-normal">KDV-siz: {formatCurrency(lineNet)}</div>}
                              </td>
                            </>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                    {showPrice && (
                      <tfoot>
                        {(() => {
                          const grossSum = viewingTeslimat.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
                          const netSum = viewingTeslimat.items.reduce((s, i) => s + (i.quantity * i.unitPrice) / (1 + (i.taxRate ?? 0) / 100), 0);
                          const kdvSum = grossSum - netSum;
                          return (
                            <>
                              <tr className="bg-gray-50">
                                <td colSpan={4} className="px-2 sm:px-3 py-1.5 text-right text-gray-600 border border-gray-400">KDV-siz Toplam:</td>
                                <td className="px-2 sm:px-3 py-1.5 text-right font-medium border border-gray-400">{formatCurrency(netSum)}</td>
                              </tr>
                              <tr className="bg-gray-50">
                                <td colSpan={4} className="px-2 sm:px-3 py-1.5 text-right text-gray-600 border border-gray-400">Toplam KDV:</td>
                                <td className="px-2 sm:px-3 py-1.5 text-right font-medium border border-gray-400">{formatCurrency(kdvSum)}</td>
                              </tr>
                              <tr className="bg-gray-50 font-bold">
                                <td colSpan={4} className="px-2 sm:px-3 py-2 text-right border border-gray-400">Toplam Tutar (KDV Dahil):</td>
                                <td className="px-2 sm:px-3 py-2 text-right text-[#c0392b] border border-gray-400">{formatCurrency(grossSum)}</td>
                              </tr>
                            </>
                          );
                        })()}
                      </tfoot>
                    )}
                  </table>
                </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setViewingTeslimat(null); openEditForm(viewingTeslimat); }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Edit3 size={16} /> Düzenle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className={`fixed inset-0 bg-black/50 z-50 ${isMobile ? "" : "flex items-center justify-center p-4"}`} onClick={() => { setShowForm(false); resetForm(); }}>
          <div className={`bg-white flex flex-col ${isMobile ? "w-full h-full" : "rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh]"}`} onClick={(e) => e.stopPropagation()}>
            {/* Header — mobilde şantiye şefi formu gibi lacivert + safe-top */}
            <div className={`flex items-center justify-between border-b shrink-0 ${isMobile ? "bg-[#1e3a5f] text-white modal-safe-top px-4 pb-4" : "p-5"}`}>
              <h2 className={`text-lg font-bold ${isMobile ? "text-white" : "text-gray-800"}`}>
                {editingId ? "Teslimat Düzenle" : "Teslimat Ekle"}
              </h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className={isMobile ? "text-white/80 hover:text-white p-1" : "p-1 hover:bg-gray-100 rounded-lg"}>
                <X size={22} />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-5 space-y-4"
              style={isMobile ? { paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" } : undefined}
            >
              {/* Top fields - row 1: irsaliye + supplier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">İrsaliye No <span className="text-gray-400 font-normal">(opsiyonel)</span></label>
                  <input
                    type="text"
                    value={formIrsaliyeNo}
                    onChange={(e) => setFormIrsaliyeNo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                    placeholder="İrsaliye numarası (opsiyonel)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tedarikçi / Firma</label>
                  <div className="relative">
                    <input
                      type="text"
                      {...(isMobile ? {} : { list: "teslimat-supplier-list" })}
                      value={formSupplier}
                      onChange={(e) => setFormSupplier(e.target.value)}
                      onFocus={(e) => { if (isMobile) { setSupFocus(true); const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 280); } }}
                      onBlur={() => { if (isMobile) setTimeout(() => setSupFocus(false), 150); }}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                      placeholder="Firma adı"
                    />
                    {/* Mobil: kontrollü, scroll'lu öneri listesi (native datalist klavyeyi kapatıyordu) */}
                    {isMobile && supFocus && (() => {
                      const q = (formSupplier || "").toLocaleLowerCase("tr-TR");
                      const opts = supplierSuggestions.filter((s) => s.toLocaleLowerCase("tr-TR").includes(q));
                      if (opts.length === 0) return null;
                      return (
                        <div className="absolute left-0 right-0 top-full mt-1 max-h-44 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-30 divide-y divide-gray-200">
                          {opts.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setFormSupplier(s); setSupFocus(false); }}
                              className="block w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <datalist id="teslimat-supplier-list">
                    {supplierSuggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Row 2: Tarih (full width) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarih *</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                />
              </div>

              {/* Row 3: Şantiye (full width) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şantiye</label>
                <select
                  value={formSiteId}
                  onChange={(e) => setFormSiteId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                >
                  <option value="">Seçilmedi</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Row 3: Teslim Alan + Notlar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teslim Alan *</label>
                  <input
                    type="text"
                    value={formReceivedBy}
                    onChange={(e) => setFormReceivedBy(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                    placeholder="Teslim alan kişi"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                    placeholder="Açıklama (opsiyonel)"
                  />
                </div>
              </div>

              {/* Items list - 2 row layout */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Malzeme Kalemleri</label>
                  <button
                    onClick={addItemRow}
                    className="flex items-center gap-1 text-sm text-[#c0392b] hover:bg-[#c0392b]/5 font-medium border border-dashed border-[#c0392b]/40 rounded-full px-4 py-1.5"
                  >
                    <Plus size={16} /> Kalem Ekle
                  </button>
                </div>
                {/* Hidden file inputs — paylaşılır, aktif kalem state'le belirlenir */}
                <input ref={galleryInputRef} type="file" multiple accept="image/*,video/*"
                  onChange={handleItemFiles} className="hidden" />
                <input ref={photoCaptureInputRef} type="file" accept="image/*" capture="environment"
                  onChange={handleItemFiles} className="hidden" />
                <input ref={videoCaptureInputRef} type="file" accept="video/*" capture="environment"
                  onChange={handleItemFiles} className="hidden" />

                <div className="space-y-3">
                  {formItems.map((item, index) => (
                    <div key={index} className="border-2 border-[#1e3a5f] rounded-lg p-3 bg-white">
                      {/* Row 1: full width material name */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            {...(isMobile ? {} : { list: "teslimat-material-list" })}
                            value={item.materialName}
                            onChange={(e) => updateItem(index, "materialName", e.target.value)}
                            onFocus={(e) => { if (isMobile) { setMatFocus(index); const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 280); } }}
                            onBlur={() => { if (isMobile) setTimeout(() => setMatFocus((c) => (c === index ? null : c)), 150); }}
                            className="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-[#c0392b] outline-none text-sm bg-white"
                            placeholder="Malzeme adı"
                          />
                          {/* Mobil: kontrollü, scroll'lu öneri listesi (native datalist klavyeyi kapatıyordu) */}
                          {isMobile && matFocus === index && (() => {
                            const q = (item.materialName || "").toLocaleLowerCase("tr-TR");
                            const opts = materialSuggestions.filter((m) => m.toLocaleLowerCase("tr-TR").includes(q));
                            if (opts.length === 0) return null;
                            return (
                              <div className="absolute left-0 right-0 top-full mt-1 max-h-44 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-30 divide-y divide-gray-200">
                                {opts.map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => { updateItem(index, "materialName", m); setMatFocus(null); }}
                                    className="block w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                                  >
                                    {m}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        {formItems.length > 1 && (
                          <button
                            onClick={() => removeItemRow(index)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0"
                            title="Kalemi sil"
                          >
                            <X size={18} />
                          </button>
                        )}
                      </div>
                      {/* Row 2: unit / qty / price / kdv */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                        <div className="flex flex-col">
                          <label className="block text-[11px] text-gray-500 mb-0.5 min-h-[2.4em] leading-tight">Birim</label>
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(index, "unit", e.target.value)}
                            className="w-full px-2 py-1.5 border rounded bg-white focus:ring-1 focus:ring-[#c0392b] outline-none text-sm"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col">
                          <label className="block text-[11px] text-gray-500 mb-0.5 min-h-[2.4em] leading-tight">Miktar *</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity || ""}
                            onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border rounded text-right focus:ring-1 focus:ring-[#c0392b] outline-none text-sm bg-white"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="block text-[11px] text-gray-500 mb-0.5 min-h-[2.4em] leading-tight">Birim Fiyat (KDV Dahil ₺)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice || ""}
                            onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border rounded text-right focus:ring-1 focus:ring-[#c0392b] outline-none text-sm bg-white"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="block text-[11px] text-gray-500 mb-0.5 min-h-[2.4em] leading-tight">KDV (%)</label>
                          <select
                            value={item.taxRate ?? 0}
                            onChange={(e) => updateItem(index, "taxRate", parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border rounded bg-white focus:ring-1 focus:ring-[#c0392b] outline-none text-sm"
                          >
                            <option value={0}>%0</option>
                            <option value={1}>%1</option>
                            <option value={10}>%10</option>
                            <option value={20}>%20</option>
                          </select>
                        </div>
                      </div>
                      {/* KDV-siz / KDV ayrintisi (kalem icin) */}
                      {(Number(item.quantity) > 0 && Number(item.unitPrice) > 0) && (() => {
                        const lineGross = Number(item.quantity) * Number(item.unitPrice);
                        const lineNet = lineGross / (1 + (Number(item.taxRate) || 0) / 100);
                        const lineKdv = lineGross - lineNet;
                        return (
                          <div className="mt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-gray-600">
                            <span>KDV-siz: <strong className="text-gray-800">{formatCurrency(lineNet)}</strong></span>
                            <span>KDV: <strong className="text-gray-800">{formatCurrency(lineKdv)}</strong></span>
                            <span>Toplam: <strong className="text-[#c0392b]">{formatCurrency(lineGross)}</strong></span>
                          </div>
                        );
                      })()}

                      {/* Fotoğraf / Video / Galeri butonları (kalem bazında) */}
                      <div className="mt-3 pt-3 border-t border-[#1e3a5f]/20">
                        {isMobile ? (
                          /* Mobil: şantiye şefi formundaki gibi modern gradient butonlar (tek satır) */
                          <div className="flex gap-2">
                            <button type="button" onClick={() => triggerItemCapture(index, "photo")}
                              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                              <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Camera size={18} /></span>
                              <span className="text-xs">Fotoğraf</span>
                            </button>
                            <button type="button" onClick={() => triggerItemCapture(index, "video")}
                              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                              <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Video size={18} /></span>
                              <span className="text-xs">Video</span>
                            </button>
                            <button type="button" onClick={() => triggerItemCapture(index, "gallery")}
                              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-[#c0392b] text-white font-semibold shadow-md active:scale-95 transition-all">
                              <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><FolderOpen size={18} /></span>
                              <span className="text-xs">Galeri</span>
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            <button type="button" onClick={() => triggerItemCapture(index, "photo")}
                              className="flex items-center justify-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-2 text-sm shadow-sm">
                              <Camera size={16} />
                              <span>Fotoğraf Çek</span>
                            </button>
                            <button type="button" onClick={() => triggerItemCapture(index, "video")}
                              className="flex items-center justify-center gap-1.5 rounded-full bg-purple-600 hover:bg-purple-700 text-white font-medium px-3 py-2 text-sm shadow-sm">
                              <Video size={16} />
                              <span>Video Çek</span>
                            </button>
                            <button type="button" onClick={() => triggerItemCapture(index, "gallery")}
                              className="flex items-center justify-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-medium px-3 py-2 text-sm shadow-sm">
                              <FolderOpen size={16} />
                              <span>Galeriden Seç</span>
                            </button>
                          </div>
                        )}

                        {/* Mevcut medyalar (düzenleme modunda) */}
                        {(item.media && item.media.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.media.map((m) => (
                              <div key={m.id} className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs">
                                {m.mimeType.startsWith("video/") ? <Video size={12} className="text-purple-600" /> : <ImageIcon size={12} className="text-blue-600" />}
                                <span className="max-w-[140px] truncate">{m.fileName || "medya"}</span>
                                <button type="button" onClick={() => removeExistingMedia(index, m.id)}
                                  className="text-gray-400 hover:text-red-600 ml-0.5" title="Kaldır">
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Bekleyen yeni dosyalar */}
                        {(formItemFiles[index] || []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(formItemFiles[index] || []).map((f, fi) => (
                              <div key={fi} className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs">
                                {f.type.startsWith("video/") ? <Video size={12} className="text-purple-600" /> : <ImageIcon size={12} className="text-blue-600" />}
                                <span className="max-w-[140px] truncate">{f.name}</span>
                                <button type="button" onClick={() => removePendingFile(index, fi)}
                                  className="text-gray-400 hover:text-red-600 ml-0.5" title="Kaldır">
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Malzeme adi onerileri (gecmis girilenler) */}
                  <datalist id="teslimat-material-list">
                    {materialSuggestions.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div className="mt-3 px-3 py-3 bg-gray-100 rounded-lg space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">KDV-siz Toplam:</span>
                    <span className="font-semibold text-gray-800">{formatCurrency(totalNet)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Toplam KDV:</span>
                    <span className="font-semibold text-gray-800">{formatCurrency(totalKdv)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-gray-300">
                    <span className="text-sm font-bold text-gray-700">Toplam Tutar (KDV Dahil):</span>
                    <span className="text-base font-bold text-[#c0392b]">{formatCurrency(totalGross)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between gap-3 pt-2">
                {editingId && (
                  <button
                    onClick={() => setDeleteConfirm(editingId)}
                    className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 size={16} /> Sil
                  </button>
                )}
                <div className={`flex gap-3 ${editingId ? "" : "ml-auto"}`}>
                  <button
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="px-5 py-2.5 border rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2.5 bg-[#c0392b] text-white rounded-lg hover:bg-[#a93226] disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Kaydediliyor..." : editingId ? "Güncelle" : "Kaydet"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Silme Onayı</h3>
            <p className="text-gray-600 mb-4">Bu teslimat kaydını silmek istediğinize emin misiniz?</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tam özellikli medya viewer (kalem fotoğrafları için) */}
      <MediaViewer
        open={viewerOpen}
        items={viewerItems}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerOpen(false)}
        title={viewerTitle}
      />
    </div>
  );
}
