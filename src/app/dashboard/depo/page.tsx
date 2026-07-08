"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Warehouse,
  Package,
  Plus,
  Search,
  Trash2,
  Edit3,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  Camera,
  Video,
  FolderOpen,
  Image as ImageIcon,
} from "lucide-react";
import { useDevice } from "@/hooks/useDevice";
import { downloadFile } from "@/lib/downloadFile";
import MediaViewer from "../satis/_components/MediaViewer";

interface Material {
  id: string;
  name: string;
  unit: string;
}

interface WarehouseMaterialMedia {
  id: string;
  url: string;
  mimeType: string;
  fileName: string | null;
}

interface WarehouseMaterial {
  id: string;
  warehouseId: string;
  materialId: string;
  quantity: number;
  minStock: number | null;
  notes: string | null;
  material: Material;
  media: WarehouseMaterialMedia[];
}

interface WarehouseData {
  id: string;
  name: string;
  sortOrder: number;
  materials: WarehouseMaterial[];

}

const ITEMS_PER_PAGE = 10;

const UNIT_OPTIONS = [
  "adet",
  "torba",
  "kg",
  "ton",
  "metre",
  "metrekare",
  "metreküp",
  "litre",
  "paket",
  "kutu",
  "palet",
  "rulo",
  "takım",
  "çuval",
];

export default function DepoPage() {
  const { isTablet, isMobile } = useDevice();

  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showEditStock, setShowEditStock] = useState<WarehouseMaterial | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialUnit, setNewMaterialUnit] = useState("adet");
  const [newMaterialQty, setNewMaterialQty] = useState("");
  const [existingMaterialId, setExistingMaterialId] = useState("");

  const [editQty, setEditQty] = useState("");

  const [withdrawMaterialId, setWithdrawMaterialId] = useState("");
  const [withdrawQty, setWithdrawQty] = useState("");

  const [saving, setSaving] = useState(false);
  const [addPendingFiles, setAddPendingFiles] = useState<File[]>([]);
  const [stockPendingFiles, setStockPendingFiles] = useState<File[]>([]);
  const [selectedStock, setSelectedStock] = useState<WarehouseMaterial | null>(null);
  const [viewerMedia, setViewerMedia] = useState<{ list: WarehouseMaterialMedia[]; index: number } | null>(null);

  const addFileInputRef = useRef<HTMLInputElement>(null);
  const addPhotoCaptureRef = useRef<HTMLInputElement>(null);
  const addVideoCaptureRef = useRef<HTMLInputElement>(null);
  const stockFileInputRef = useRef<HTMLInputElement>(null);
  const stockPhotoCaptureRef = useRef<HTMLInputElement>(null);
  const stockVideoCaptureRef = useRef<HTMLInputElement>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraType, setCameraType] = useState<"photo" | "video">("photo");
  const [cameraTarget, setCameraTarget] = useState<"add" | "stock">("add");
  const [isRecording, setIsRecording] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Modern uyari modal'i (alert yerine)
  const [notice, setNotice] = useState<{ title: string; message: string; type: "warning" | "error" | "info" } | null>(null);
  const showNotice = (message: string, type: "warning" | "error" | "info" = "warning", title?: string) => {
    setNotice({
      title: title ?? (type === "error" ? "Hata" : type === "info" ? "Bilgi" : "Uyarı"),
      message,
      type,
    });
  };

  // Modern onay modal'i (confirm yerine)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [wRes, mRes] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }),
        fetch("/api/warehouses/materials", { cache: "no-store" }),
      ]);
      const wData = await wRes.json();
      const mData = await mRes.json();
      const updatedWarehouses: WarehouseData[] = wData.warehouses || [];
      setWarehouses(updatedWarehouses);
      setAllMaterials(mData.materials || []);
      setSelectedStock((prev) => {
        if (!prev) return prev;
        for (const wh of updatedWarehouses) {
          const found = wh.materials.find((m) => m.id === prev.id);
          if (found) return found;
        }
        return prev;
      });
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeWarehouse = warehouses[activeTab];
  const selectedWarehouseName = activeWarehouse?.name || "Depo";

  const filteredMaterials = activeWarehouse?.materials.filter((wm) =>
    wm.material.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const appendFiles = useCallback((target: "add" | "stock", files: File[]) => {
    if (target === "add") setAddPendingFiles((prev) => [...prev, ...files]);
    else setStockPendingFiles((prev) => [...prev, ...files]);
  }, []);

  const handleMediaFiles = useCallback((target: "add" | "stock", e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    appendFiles(target, files);
    if (e.target) e.target.value = "";
  }, [appendFiles]);

  const closeCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setIsRecording(false);
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async (target: "add" | "stock", type: "photo" | "video") => {
    setCameraTarget(target);
    setCameraType(type);
    // On touch devices (mobile/tablet) use native OS camera — truly fullscreen on iOS
    if (navigator.maxTouchPoints > 0) {
      if (target === "add") {
        if (type === "photo") addPhotoCaptureRef.current?.click();
        else addVideoCaptureRef.current?.click();
      } else {
        if (type === "photo") stockPhotoCaptureRef.current?.click();
        else stockVideoCaptureRef.current?.click();
      }
      return;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: type === "video",
      });
      cameraStreamRef.current = stream;
      setCameraActive(true);
      const tryAttach = () => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(() => {});
        } else {
          requestAnimationFrame(tryAttach);
        }
      };
      requestAnimationFrame(tryAttach);
    } catch {
      if (target === "add") {
        if (type === "photo") addPhotoCaptureRef.current?.click();
        else addVideoCaptureRef.current?.click();
      } else {
        if (type === "photo") stockPhotoCaptureRef.current?.click();
        else stockVideoCaptureRef.current?.click();
      }
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      appendFiles(cameraTarget, [new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" })]);
      closeCamera();
    }, "image/jpeg", 0.9);
  }, [appendFiles, cameraTarget, closeCamera]);

  const startVideoRecording = useCallback(() => {
    if (!cameraStreamRef.current) return;
    recordedChunksRef.current = [];
    const supportedTypes = [
      "video/mp4;codecs=h264,aac", "video/mp4",
      "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm",
    ];
    let selectedMime = "";
    for (const type of supportedTypes) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
        selectedMime = type;
        break;
      }
    }
    const recorder = new MediaRecorder(cameraStreamRef.current, selectedMime ? { mimeType: selectedMime } : {});
    const actualMime = recorder.mimeType;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: actualMime });
      const ext = actualMime.includes("mp4") ? "mp4" : "webm";
      appendFiles(cameraTarget, [new File([blob], `video_${Date.now()}.${ext}`, { type: actualMime })]);
      closeCamera();
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);
    setIsRecording(true);
  }, [appendFiles, cameraTarget, closeCamera]);

  const stopVideoRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const uploadStockMedia = async (stockId: string, files: File[]) => {
    if (files.length === 0) return [] as WarehouseMaterialMedia[];
    const fd = new FormData();
    for (const file of files) fd.append("files", file);
    const res = await fetch(`/api/warehouses/stock/${stockId}/media`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Medya yükleme hatası");
    return (data.media || []) as WarehouseMaterialMedia[];
  };

  const mediaUrl = (mediaId: string) => `/api/warehouses/stock/media/${mediaId}`;

  const totalPages = Math.ceil(filteredMaterials.length / ITEMS_PER_PAGE);
  const paginatedMaterials = filteredMaterials.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab]);

  const handleAddMaterial = async () => {
    if (!activeWarehouse) return;
    setSaving(true);
    try {
      let materialId = existingMaterialId;

      if (!existingMaterialId && newMaterialName.trim()) {
        const res = await fetch("/api/warehouses/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newMaterialName.trim(), unit: newMaterialUnit }),
        });
        const data = await res.json();
        if (!res.ok) {
          showNotice(data.error || "Hata oluştu", "error");
          return;
        }
        materialId = data.material.id;
      }

      if (!materialId) {
        showNotice("Malzeme seçin veya yeni malzeme adı girin", "warning");
        return;
      }

      const res = await fetch("/api/warehouses/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: activeWarehouse.id,
          materialId,
          quantity: parseFloat(newMaterialQty) || 0,
          minStock: null,
          notes: null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        showNotice(data.error || "Hata oluştu", "error");
        return;
      }

      const stockData = await res.json();
      if (!existingMaterialId && addPendingFiles.length > 0 && stockData.warehouseMaterial?.id) {
        try {
          await uploadStockMedia(stockData.warehouseMaterial.id, addPendingFiles);
        } catch (mediaError) {
          showNotice(mediaError instanceof Error ? mediaError.message : "Medya yükleme hatası", "warning");
        }
      }

      setShowAddMaterial(false);
      resetAddForm();
      fetchData();
    } catch (error) {
      console.error("Add material error:", error);
      showNotice("Bir hata oluştu", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEditStock = async () => {
    if (!showEditStock) return;
    setSaving(true);
    try {
      const res = await fetch("/api/warehouses/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: showEditStock.warehouseId,
          materialId: showEditStock.materialId,
          quantity: parseFloat(editQty) || 0,
          minStock: showEditStock.minStock,
          notes: showEditStock.notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showNotice(data.error || "Hata oluştu", "error");
        return;
      }
      setShowEditStock(null);
      fetchData();
    } catch (error) {
      console.error("Edit stock error:", error);
      showNotice("Bir hata oluştu", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStock = async (id: string) => {
    setConfirmDialog({
      title: "Malzemeyi Kaldır",
      message: "Bu malzemeyi depodan kaldırmak istediğinize emin misiniz?",
      confirmText: "Kaldır",
      onConfirm: async () => {
        try {
          await fetch(`/api/warehouses/stock?id=${id}`, { method: "DELETE" });
          fetchData();
        } catch (error) {
          console.error("Delete error:", error);
        }
      },
    });
  };

  const handleWithdraw = async () => {
    if (!activeWarehouse) return;
    if (!withdrawMaterialId) {
      showNotice("Lütfen çıkartılacak malzemeyi seçin.", "warning");
      return;
    }
    const qty = parseFloat(withdrawQty);
    if (!qty || qty <= 0) {
      showNotice("Lütfen geçerli bir miktar girin.", "warning");
      return;
    }

    const wm = activeWarehouse.materials.find((m) => m.id === withdrawMaterialId);
    if (!wm) return;

    if (qty > wm.quantity) {
      showNotice(
        `Stokta yeterli miktar yok.\n\nMevcut: ${wm.quantity} ${wm.material.unit}\n\u00c7ıkartılmak istenen: ${qty} ${wm.material.unit}`,
        "warning",
        "Yetersiz Stok"
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/warehouses/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: activeWarehouse.id,
          materialId: wm.materialId,
          quantity: wm.quantity - qty,
          minStock: wm.minStock,
          notes: wm.notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showNotice(data.error || "Hata oluştu", "error");
        return;
      }
      setShowWithdraw(false);
      setWithdrawMaterialId("");
      setWithdrawQty("");
      fetchData();
    } catch (error) {
      console.error("Withdraw error:", error);
      showNotice("Bir hata oluştu", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetAddForm = () => {
    setNewMaterialName("");
    setNewMaterialUnit("adet");
    setNewMaterialQty("");
    setExistingMaterialId("");
    setAddPendingFiles([]);
  };

  const openEditStock = (wm: WarehouseMaterial) => {
    setEditQty(wm.quantity.toString());
    setShowEditStock(wm);
  };

  const openStockMedia = (wm: WarehouseMaterial) => {
    setSelectedStock(wm);
    setStockPendingFiles([]);
  };

  const handleUploadSelectedStockMedia = async () => {
    if (!selectedStock || stockPendingFiles.length === 0) return;
    setSaving(true);
    try {
      const created = await uploadStockMedia(selectedStock.id, stockPendingFiles);
      setSelectedStock({ ...selectedStock, media: [...(selectedStock.media || []), ...created] });
      setStockPendingFiles([]);
      fetchData();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Medya yükleme hatası", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStockMedia = async (mediaId: string) => {
    if (!selectedStock) return;
    try {
      const res = await fetch(`/api/warehouses/stock/${selectedStock.id}/media/${mediaId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showNotice(data.error || "Medya silinemedi", "error");
        return;
      }
      const nextMedia = (selectedStock.media || []).filter((media) => media.id !== mediaId);
      setSelectedStock({ ...selectedStock, media: nextMedia });
      setViewerMedia((viewer) => {
        if (!viewer) return viewer;
        const nextList = viewer.list.filter((media) => media.id !== mediaId);
        if (nextList.length === 0) return null;
        return { list: nextList, index: Math.min(viewer.index, nextList.length - 1) };
      });
      fetchData();
    } catch (error) {
      console.error("Delete media error:", error);
      showNotice("Medya silinemedi", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={`font-bold text-gray-800 flex items-center gap-2 ${isTablet ? "text-3xl" : "text-2xl"}`}>
            <Warehouse size={isTablet ? 32 : 28} />
            Depo Yönetimi
          </h1>
          <p className={`text-gray-500 mt-1 ${isTablet ? "text-base" : ""}`}>Malzeme stok takibi ve yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadFile("/api/warehouses/export", "depo_stok.xlsx").then((m) => { if (m) alert(m); }).catch(() => alert("İndirme başarısız oldu. Lütfen tekrar deneyin."))}
            className={`inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all font-medium ${isTablet ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm"}`}
          >
            <Download size={isTablet ? 22 : 18} />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            onClick={() => { setWithdrawMaterialId(""); setWithdrawQty(""); setShowWithdraw(true); }}
            className={`inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all font-medium ${isTablet ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm"}`}
          >
            <Minus size={isTablet ? 22 : 18} />
            Malzeme Çıkart
          </button>
          <button
            onClick={() => { resetAddForm(); setShowAddMaterial(true); }}
            className={`inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all font-medium ${isTablet ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm"}`}
          >
            <Plus size={isTablet ? 22 : 18} />
            Malzeme Ekle
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isMobile ? (
          /* Mobil: depo seçimi açılır liste (sayılı) */
          <div className="p-3 border-b border-gray-100">
            <select
              value={activeTab}
              onChange={(e) => { setActiveTab(Number(e.target.value)); setCurrentPage(1); }}
              className="w-full min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800"
              aria-label="Depo seç"
            >
              {warehouses.map((wh, idx) => (
                <option key={wh.id} value={idx}>{wh.name} ({wh.materials.length})</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex border-b border-gray-200">
            {warehouses.map((wh, idx) => (
              <button
                key={wh.id}
                onClick={() => setActiveTab(idx)}
                className={`flex-1 px-4 py-5 text-sm font-medium transition-all border-b-2 ${
                  activeTab === idx
                    ? "border-[#c0392b] text-[#c0392b] bg-red-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {wh.name}
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {wh.materials.length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-b border-gray-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Malzeme ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] ${isTablet ? "py-3 text-base" : "py-2 text-sm"}`}
            />
          </div>
        </div>

        {/* Table */}
        {activeWarehouse && (
          <div className={isMobile ? "p-3 space-y-2" : "overflow-x-auto"}>
            {isMobile ? (
              paginatedMaterials.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <Package className="mx-auto mb-3 text-gray-300" size={40} />
                  {searchQuery ? "Arama sonucu bulunamadı" : "Bu depoda henüz malzeme yok"}
                </div>
              ) : (
                paginatedMaterials.map((wm) => (
                  <div
                    key={wm.id}
                    onClick={() => openStockMedia(wm)}
                    className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm cursor-pointer active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-gray-800 text-sm leading-snug flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{wm.material.name}</span>
                        {wm.media?.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-amber-700 shrink-0">📷<span className="text-[10px] font-bold">{wm.media.length}</span></span>
                        )}
                      </span>
                      <span className="font-bold text-indigo-700 whitespace-nowrap shrink-0">{wm.quantity} {wm.material.unit}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-50">
                      <button onClick={(e) => { e.stopPropagation(); openEditStock(wm); }} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 active:scale-95 px-3 py-1.5 rounded-lg transition">
                        <Edit3 size={14} /> Düzenle
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteStock(wm.id); }} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 active:scale-95 px-3 py-1.5 rounded-lg transition">
                        <Trash2 size={14} /> Sil
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : (
            <table className="w-full">
              <thead>
                <tr className={`bg-gray-50 text-left text-gray-500 uppercase tracking-wider ${isTablet ? "text-sm" : "text-xs"}`}>
                  <th className={`font-medium ${isTablet ? "px-5 py-4" : "px-4 py-3"}`}>Malzeme Adı</th>
                  <th className={`font-medium ${isTablet ? "px-5 py-4" : "px-4 py-3"}`}>Birim</th>
                  <th className={`font-medium ${isTablet ? "px-5 py-4" : "px-4 py-3"}`}>Mevcut Stok</th>
                  <th className={`font-medium text-right ${isTablet ? "px-5 py-4" : "px-4 py-3"}`}>İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedMaterials.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                      <Package className="mx-auto mb-3 text-gray-300" size={40} />
                      {searchQuery ? "Arama sonucu bulunamadı" : "Bu depoda henüz malzeme yok"}
                    </td>
                  </tr>
                ) : (
                  paginatedMaterials.map((wm) => (
                    <tr key={wm.id} onClick={() => openStockMedia(wm)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className={isTablet ? "px-5 py-4" : "px-4 py-3"}>
                        <div className="flex items-center gap-2">
                          <Package size={isTablet ? 20 : 16} className="text-gray-400 flex-shrink-0" />
                          <span className={`font-medium text-gray-800 ${isTablet ? "text-base" : ""}`}>{wm.material.name}</span>
                          {wm.media?.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              <ImageIcon size={12} />
                              {wm.media.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`text-gray-600 ${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"}`}>{wm.material.unit}</td>
                      <td className={isTablet ? "px-5 py-4" : "px-4 py-3"}>
                        <span className={`font-semibold text-gray-800 ${isTablet ? "text-base" : "text-sm"}`}>
                          {wm.quantity} {wm.material.unit}
                        </span>
                      </td>
                      <td className={isTablet ? "px-5 py-4" : "px-4 py-3"}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditStock(wm); }}
                            className={`text-blue-500 hover:bg-blue-50 rounded-lg transition-all ${isTablet ? "p-3" : "p-1.5"}`}
                            title="Düzenle"
                          >
                            <Edit3 size={isTablet ? 22 : 16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteStock(wm.id); }}
                            className={`text-red-500 hover:bg-red-50 rounded-lg transition-all ${isTablet ? "p-3" : "p-1.5"}`}
                            title="Kaldır"
                          >
                            <Trash2 size={isTablet ? 22 : 16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 border-t border-gray-100">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={18} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                      currentPage === i + 1
                        ? "bg-[#c0392b] text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MALZEME EKLE MODAL */}
      {showAddMaterial && (
        <div className={`fixed inset-0 bg-black/50 z-50 ${isMobile ? "" : "flex items-center justify-center p-4"}`} onClick={() => setShowAddMaterial(false)}>
          <div className={`bg-white flex flex-col ${isMobile ? "w-full h-full" : `rounded-xl shadow-xl w-full ${isTablet ? "max-w-2xl" : "max-w-lg"}`}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b border-gray-100 shrink-0 ${isMobile ? "bg-[#1e3a5f] text-white modal-safe-top px-4 pb-4" : (isTablet ? "p-6" : "p-5")}`}>
              <h3 className={`font-semibold ${isMobile ? "text-white text-lg" : `text-gray-800 ${isTablet ? "text-xl" : "text-lg"}`}`}>Malzeme Ekle{isMobile ? "" : ` - ${selectedWarehouseName}`}</h3>
              <button onClick={() => setShowAddMaterial(false)} className={isMobile ? "text-white/80 hover:text-white p-1" : `hover:bg-gray-100 rounded-lg ${isTablet ? "p-2" : "p-1"}`}>
                <X size={isTablet ? 26 : 22} />
              </button>
            </div>
            <div className={`space-y-4 ${isMobile ? "flex-1 overflow-y-auto p-5" : (isTablet ? "p-6" : "p-5")}`}>
              <div>
                <label className={`block font-medium text-gray-700 mb-1 ${isTablet ? "text-base" : "text-sm"}`}>Mevcut Malzeme Seç</label>
                <select
                  value={existingMaterialId}
                  onChange={(e) => {
                    setExistingMaterialId(e.target.value);
                    if (e.target.value) {
                      setNewMaterialName("");
                      setNewMaterialUnit("adet");
                    }
                  }}
                  className={`w-full border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] focus:outline-none ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"}`}
                >
                  <option value="">-- Yeni malzeme oluştur --</option>
                  {allMaterials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
              </div>
              {!existingMaterialId && (
                <>
                  <div>
                    <label className={`block font-medium text-gray-700 mb-1 ${isTablet ? "text-base" : "text-sm"}`}>Malzeme Adı</label>
                    <input
                      type="text"
                      value={newMaterialName}
                      onChange={(e) => setNewMaterialName(e.target.value)}
                      placeholder="Ör: Çimento, Tuğla, Boya..."
                      className={`w-full border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] focus:outline-none ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"}`}
                    />
                  </div>
                  <div>
                    <label className={`block font-medium text-gray-700 mb-1 ${isTablet ? "text-base" : "text-sm"}`}>Birim</label>
                    <select
                      value={newMaterialUnit}
                      onChange={(e) => setNewMaterialUnit(e.target.value)}
                      className={`w-full border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] focus:outline-none ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"}`}
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className={`block font-medium text-gray-700 mb-1 ${isTablet ? "text-base" : "text-sm"}`}>Miktar</label>
                <input
                  type="number"
                  value={newMaterialQty}
                  onChange={(e) => setNewMaterialQty(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.1"
                  className={`w-full border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] focus:outline-none ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"}`}
                />
              </div>
              {!existingMaterialId && (
                <div>
                  <label className={`block font-medium text-gray-700 mb-2 ${isTablet ? "text-base" : "text-sm"}`}>Fotoğraf / Video</label>
                  <input ref={addFileInputRef} type="file" multiple accept="image/*,video/*" onChange={(e) => handleMediaFiles("add", e)} className="hidden" />
                  <input ref={addPhotoCaptureRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleMediaFiles("add", e)} className="hidden" />
                  <input ref={addVideoCaptureRef} type="file" accept="video/*" capture="environment" onChange={(e) => handleMediaFiles("add", e)} className="hidden" />
                  {isMobile ? (
                    /* Mobil: şantiye şefi formundaki gibi modern gradient butonlar */
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startCamera("add", "photo")} className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                        <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Camera size={18} /></span>
                        <span className="text-xs">Fotoğraf</span>
                      </button>
                      <button type="button" onClick={() => startCamera("add", "video")} className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                        <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Video size={18} /></span>
                        <span className="text-xs">Video</span>
                      </button>
                      <button type="button" onClick={() => addFileInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-[#c0392b] text-white font-semibold shadow-md active:scale-95 transition-all">
                        <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><FolderOpen size={18} /></span>
                        <span className="text-xs">Galeri</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      <button type="button" onClick={() => startCamera("add", "photo")} className={`flex items-center justify-center gap-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow ${isTablet ? "px-4 py-4 text-base" : "px-3 py-3 text-sm"}`}>
                        <Camera size={isTablet ? 22 : 18} />
                        <span>Fotoğraf Çek</span>
                      </button>
                      <button type="button" onClick={() => startCamera("add", "video")} className={`flex items-center justify-center gap-2 rounded-full bg-purple-600 text-white font-semibold hover:bg-purple-700 active:scale-95 transition-all shadow ${isTablet ? "px-4 py-4 text-base" : "px-3 py-3 text-sm"}`}>
                        <Video size={isTablet ? 22 : 18} />
                        <span>Video Çek</span>
                      </button>
                      <button type="button" onClick={() => addFileInputRef.current?.click()} className={`flex items-center justify-center gap-2 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 active:scale-95 transition-all shadow ${isTablet ? "px-4 py-4 text-base" : "px-3 py-3 text-sm"}`}>
                        <FolderOpen size={isTablet ? 22 : 18} />
                        <span>Galeriden Seç</span>
                      </button>
                    </div>
                  )}
                  {addPendingFiles.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {addPendingFiles.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                          <ImageIcon size={14} className="text-gray-500" />
                          <span className="max-w-[180px] truncate">{file.name}</span>
                          <button onClick={() => setAddPendingFiles((prev) => prev.filter((_, i) => i !== idx))} className="text-gray-500 hover:text-red-600">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div
              className={`flex justify-end gap-2 border-t border-gray-100 shrink-0 ${isTablet ? "p-6" : "p-5"}`}
              style={isMobile ? { paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" } : undefined}
            >
              <button onClick={() => setShowAddMaterial(false)} className={`text-gray-600 hover:bg-gray-100 rounded-lg ${isTablet ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}>İptal</button>
              <button
                onClick={handleAddMaterial}
                disabled={saving}
                className={`bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg disabled:opacity-50 ${isTablet ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}
              >
                {saving ? "Kaydediliyor..." : "Ekle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MALZEME MEDYA MODAL */}
      {selectedStock && (
        <div className={`fixed inset-0 bg-black/50 z-50 ${isMobile ? "" : "flex items-center justify-center p-4"}`} onClick={() => { setSelectedStock(null); setViewerMedia(null); }}>
          <div className={`bg-white flex flex-col ${isMobile ? "w-full h-full" : `rounded-xl shadow-xl w-full ${isTablet ? "max-w-4xl" : "max-w-3xl"} max-h-[90vh]`}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b border-gray-100 shrink-0 ${isMobile ? "bg-[#1e3a5f] text-white modal-safe-top px-4 pb-4" : (isTablet ? "p-6" : "p-5")}`}>
              <div className="min-w-0">
                <h3 className={`font-semibold truncate ${isMobile ? "text-white text-lg" : `text-gray-800 ${isTablet ? "text-xl" : "text-lg"}`}`}>{isMobile ? selectedStock.material.name : `${selectedWarehouseName} - ${selectedStock.material.name}`}</h3>
                <p className={`text-sm mt-1 ${isMobile ? "text-white/70" : "text-gray-500"}`}>Fotoğraf ve video arşivi</p>
              </div>
              <button onClick={() => { setSelectedStock(null); setViewerMedia(null); }} className={isMobile ? "text-white/80 hover:text-white p-1 shrink-0" : `hover:bg-gray-100 rounded-lg shrink-0 ${isTablet ? "p-2" : "p-1"}`}>
                <X size={isTablet ? 26 : 22} />
              </button>
            </div>
            <div className={`space-y-5 overflow-y-auto flex-1 min-h-0 ${isTablet ? "p-6" : "p-5"}`}>
              <div>
                <label className={`block font-medium text-gray-700 mb-2 ${isTablet ? "text-base" : "text-sm"}`}>Yeni Fotoğraf / Video Ekle</label>
                <input ref={stockFileInputRef} type="file" multiple accept="image/*,video/*" onChange={(e) => handleMediaFiles("stock", e)} className="hidden" />
                <input ref={stockPhotoCaptureRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleMediaFiles("stock", e)} className="hidden" />
                <input ref={stockVideoCaptureRef} type="file" accept="video/*" capture="environment" onChange={(e) => handleMediaFiles("stock", e)} className="hidden" />
                {isMobile ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startCamera("stock", "photo")} className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                      <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Camera size={18} /></span>
                      <span className="text-xs">Fotoğraf</span>
                    </button>
                    <button type="button" onClick={() => startCamera("stock", "video")} className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                      <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Video size={18} /></span>
                      <span className="text-xs">Video</span>
                    </button>
                    <button type="button" onClick={() => stockFileInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-[#c0392b] text-white font-semibold shadow-md active:scale-95 transition-all">
                      <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><FolderOpen size={18} /></span>
                      <span className="text-xs">Galeri</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <button type="button" onClick={() => startCamera("stock", "photo")} className={`flex items-center justify-center gap-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow ${isTablet ? "px-4 py-4 text-base" : "px-3 py-3 text-sm"}`}>
                      <Camera size={isTablet ? 22 : 18} />
                      <span>Fotoğraf Çek</span>
                    </button>
                    <button type="button" onClick={() => startCamera("stock", "video")} className={`flex items-center justify-center gap-2 rounded-full bg-purple-600 text-white font-semibold hover:bg-purple-700 active:scale-95 transition-all shadow ${isTablet ? "px-4 py-4 text-base" : "px-3 py-3 text-sm"}`}>
                      <Video size={isTablet ? 22 : 18} />
                      <span>Video Çek</span>
                    </button>
                    <button type="button" onClick={() => stockFileInputRef.current?.click()} className={`flex items-center justify-center gap-2 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 active:scale-95 transition-all shadow ${isTablet ? "px-4 py-4 text-base" : "px-3 py-3 text-sm"}`}>
                      <FolderOpen size={isTablet ? 22 : 18} />
                      <span>Galeriden Seç</span>
                    </button>
                  </div>
                )}
                {stockPendingFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stockPendingFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                        <ImageIcon size={14} className="text-gray-500" />
                        <span className="max-w-[180px] truncate">{file.name}</span>
                        <button onClick={() => setStockPendingFiles((prev) => prev.filter((_, i) => i !== idx))} className="text-gray-500 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-800">Yüklü Medyalar</h4>
                  <span className="text-sm text-gray-500">{selectedStock.media?.length || 0} medya</span>
                </div>
                {!selectedStock.media || selectedStock.media.length === 0 ? (
                  <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400">
                    <ImageIcon className="mx-auto mb-2 text-gray-300" size={36} />
                    Henüz fotoğraf veya video yok
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {selectedStock.media.map((media, idx) => (
                      <button
                        key={media.id}
                        type="button"
                        onClick={() => setViewerMedia({ list: selectedStock.media, index: idx })}
                        className="aspect-video bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center w-full"
                      >
                        {media.mimeType.startsWith("image/") ? (
                          <img src={mediaUrl(media.id)} alt={media.fileName || "Depo medyası"} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-purple-600">
                            <Video size={28} />
                            <span className="text-xs font-medium">Video</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div
              className={`flex justify-end gap-2 border-t border-gray-100 shrink-0 ${isTablet ? "p-6" : "p-5"}`}
              style={isMobile ? { paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" } : undefined}
            >
              <button onClick={() => { setSelectedStock(null); setViewerMedia(null); }} className={`text-gray-600 hover:bg-gray-100 rounded-lg ${isTablet ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}>Kapat</button>
              <button
                onClick={handleUploadSelectedStockMedia}
                disabled={saving || stockPendingFiles.length === 0}
                className={`bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg disabled:opacity-50 ${isTablet ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}
              >
                {saving ? "Yükleniyor..." : "Medya Yükle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STOK DÜZENLE MODAL */}
      {showEditStock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditStock(null)}>
          <div className={`bg-white rounded-xl shadow-xl w-full ${isTablet ? "max-w-xl" : "max-w-md"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b border-gray-100 ${isTablet ? "p-6" : "p-5"}`}>
              <h3 className={`font-semibold text-gray-800 ${isTablet ? "text-xl" : "text-lg"}`}>
                {showEditStock.material.name} - Stok Düzenle
              </h3>
              <button onClick={() => setShowEditStock(null)} className={`hover:bg-gray-100 rounded-lg ${isTablet ? "p-2" : "p-1"}`}>
                <X size={isTablet ? 26 : 20} />
              </button>
            </div>
            <div className={`space-y-4 ${isTablet ? "p-6" : "p-5"}`}>
              <div>
                <label className={`block font-medium text-gray-700 mb-1 ${isTablet ? "text-base" : "text-sm"}`}>
                  Miktar ({showEditStock.material.unit})
                </label>
                <input
                  type="number"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  min="0"
                  step="0.1"
                  className={`w-full border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] focus:outline-none ${isTablet ? "px-4 py-3 text-lg" : "px-3 py-2 text-sm"}`}
                />
              </div>
              <div className={`bg-gray-50 rounded-lg ${isTablet ? "p-4" : "p-3"}`}>
                <p className={`text-gray-500 ${isTablet ? "text-base" : "text-sm"}`}>Mevcut stok: <span className="font-semibold text-gray-800">{showEditStock.quantity} {showEditStock.material.unit}</span></p>
              </div>
            </div>
            <div className={`flex justify-end gap-2 border-t border-gray-100 ${isTablet ? "p-6" : "p-5"}`}>
              <button onClick={() => setShowEditStock(null)} className={`text-gray-600 hover:bg-gray-100 rounded-lg ${isTablet ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}>İptal</button>
              <button
                onClick={handleEditStock}
                disabled={saving}
                className={`bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg disabled:opacity-50 ${isTablet ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MALZEME ÇIKART MODAL */}
      {showWithdraw && activeWarehouse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowWithdraw(false)}>
          <div className={`bg-white rounded-xl shadow-xl w-full ${isTablet ? "max-w-2xl" : "max-w-md"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b border-gray-100 ${isTablet ? "p-6" : "p-5"}`}>
              <h3 className={`font-semibold text-gray-800 flex items-center gap-2 ${isTablet ? "text-xl" : "text-lg"}`}>
                <Minus size={isTablet ? 24 : 20} className="text-orange-600" />
                Malzeme Çıkart
              </h3>
              <button onClick={() => setShowWithdraw(false)} className={`hover:bg-gray-100 rounded-lg ${isTablet ? "p-2" : "p-1"}`}>
                <X size={isTablet ? 26 : 20} />
              </button>
            </div>
            <div className={`space-y-4 ${isTablet ? "p-6" : "p-5"}`}>
              <div>
                <label className={`block font-medium text-gray-700 mb-1 ${isTablet ? "text-base" : "text-sm"}`}>Malzeme Seç</label>
                <select
                  value={withdrawMaterialId}
                  onChange={(e) => setWithdrawMaterialId(e.target.value)}
                  className={`w-full border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-400 focus:outline-none ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"}`}
                >
                  <option value="">-- Malzeme seçin --</option>
                  {activeWarehouse.materials.filter(wm => wm.quantity > 0).map((wm) => (
                    <option key={wm.id} value={wm.id}>
                      {wm.material.name} - Stok: {wm.quantity} {wm.material.unit}
                    </option>
                  ))}
                </select>
              </div>
              {withdrawMaterialId && (() => {
                const selectedWm = activeWarehouse.materials.find(m => m.id === withdrawMaterialId);
                if (!selectedWm) return null;
                return (
                  <div className={`bg-orange-50 border border-orange-200 rounded-lg ${isTablet ? "p-4" : "p-3"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-orange-800 font-medium ${isTablet ? "text-base" : "text-sm"}`}>{selectedWm.material.name}</span>
                      <span className={`font-bold text-orange-700 ${isTablet ? "text-lg" : "text-sm"}`}>
                        Mevcut: {selectedWm.quantity} {selectedWm.material.unit}
                      </span>
                    </div>
                  </div>
                );
              })()}
              <div>
                <label className={`block font-medium text-gray-700 mb-1 ${isTablet ? "text-base" : "text-sm"}`}>Çıkartılacak Miktar</label>
                <input
                  type="number"
                  value={withdrawQty}
                  onChange={(e) => setWithdrawQty(e.target.value)}
                  placeholder="0"
                  min="0.1"
                  step="0.1"
                  className={`w-full border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-400 focus:outline-none ${isTablet ? "px-4 py-3 text-lg" : "px-3 py-2 text-sm"}`}
                />
              </div>
            </div>
            <div className={`flex justify-end gap-2 border-t border-gray-100 ${isTablet ? "p-6" : "p-5"}`}>
              <button onClick={() => setShowWithdraw(false)} className={`text-gray-600 hover:bg-gray-100 rounded-lg ${isTablet ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}>İptal</button>
              <button
                onClick={handleWithdraw}
                disabled={saving || !withdrawMaterialId || !withdrawQty}
                className={`bg-orange-600 hover:bg-orange-700 text-white rounded-lg disabled:opacity-50 ${isTablet ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}
              >
                {saving ? "İşleniyor..." : "Cikart"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KAMERA MODAL */}
      {cameraActive && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col select-none">
          <div className="flex items-center justify-between px-4 py-2 bg-black/80 flex-shrink-0">
            <span className="text-white text-sm font-medium">
              {cameraType === "photo" ? "Fotoğraf Çek" : isRecording ? "Kayıt yapılıyor..." : "Video Çek"}
            </span>
            <button onClick={closeCamera} className="text-white p-1.5 hover:bg-white/10 rounded-lg">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <video
              ref={cameraVideoRef}
              autoPlay
              playsInline
              muted={cameraType === "photo"}
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div className="flex items-center justify-center py-6 bg-black/80">
            {cameraType === "photo" ? (
              <button
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-all active:scale-90"
              />
            ) : !isRecording ? (
              <button
                onClick={startVideoRecording}
                className="w-16 h-16 rounded-full border-4 border-white bg-red-500 hover:bg-red-600 transition-all active:scale-90"
              />
            ) : (
              <button
                onClick={stopVideoRecording}
                className="w-16 h-16 rounded-full border-4 border-white bg-red-500 flex items-center justify-center active:scale-90"
              >
                <div className="w-6 h-6 bg-white rounded-sm" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* MEDYA VIEWER */}
      <MediaViewer
        open={viewerMedia !== null && viewerMedia.list.length > 0}
        items={(viewerMedia?.list ?? []).map((m) => ({
          id: m.id,
          fileName: m.fileName || "Depo Medyası",
          fileUrl: mediaUrl(m.id),
          mimeType: m.mimeType,
        }))}
        index={viewerMedia?.index ?? 0}
        onIndexChange={(i) => setViewerMedia((v) => v ? { ...v, index: i } : v)}
        onClose={() => setViewerMedia(null)}
        onDelete={(item) => handleDeleteStockMedia(item.id)}
      />

      {/* Modern uyari modal */}
      {notice && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setNotice(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className={`px-5 py-4 flex items-center gap-3 ${
              notice.type === "error" ? "bg-red-50 border-b border-red-200" :
              notice.type === "info" ? "bg-blue-50 border-b border-blue-200" :
              "bg-amber-50 border-b border-amber-200"
            }`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                notice.type === "error" ? "bg-red-100 text-red-600" :
                notice.type === "info" ? "bg-blue-100 text-blue-600" :
                "bg-amber-100 text-amber-600"
              }`}>
                {notice.type === "error" ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                ) : notice.type === "info" ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                )}
              </div>
              <h3 className={`font-semibold text-lg ${
                notice.type === "error" ? "text-red-800" :
                notice.type === "info" ? "text-blue-800" :
                "text-amber-800"
              }`}>{notice.title}</h3>
            </div>
            <div className="px-5 py-5">
              <p className="text-gray-700 whitespace-pre-line">{notice.message}</p>
            </div>
            <div className="px-5 pb-5 flex justify-end">
              <button
                onClick={() => setNotice(null)}
                className={`px-5 py-2.5 rounded-lg text-white font-medium transition-colors ${
                  notice.type === "error" ? "bg-red-600 hover:bg-red-700" :
                  notice.type === "info" ? "bg-blue-600 hover:bg-blue-700" :
                  "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modern onay modal */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center gap-3 bg-red-50 border-b border-red-200">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-red-100 text-red-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </div>
              <h3 className="font-semibold text-lg text-red-800">{confirmDialog.title}</h3>
            </div>
            <div className="px-5 py-5">
              <p className="text-gray-700 whitespace-pre-line">{confirmDialog.message}</p>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-5 py-2.5 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                className="px-5 py-2.5 rounded-lg text-white font-medium bg-red-600 hover:bg-red-700 transition-colors"
              >
                {confirmDialog.confirmText ?? "Onayla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
