"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Loader2,
  Camera,
  Video,
  FolderOpen,
  Check,
  Eye,
  Download,
  Share2,
  Maximize2,
  Minimize2,
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useDevice } from "@/hooks/useDevice";

interface Media {
  id: string;
  url: string;
  mimeType: string;
  fileName: string | null;
}

interface Ariza {
  id: string;
  siteId: string | null;
  customSiteName: string | null;
  blockId: string | null;
  floorId: string | null;
  unitId: string | null;
  isPeyzaj: boolean;
  description: string;
  startDate: string;
  endDate: string | null;
  assignedPersonnel: string | null;
  status: "OPEN" | "RESOLVED";
  createdByName: string | null;
  createdAt: string;
  site: { id: string; name: string } | null;
  block: { id: string; name: string } | null;
  floor: { id: string; name: string } | null;
  unit: { id: string; name: string } | null;
  media: Media[];
}

interface Props {
  mode: "page" | "modal";
  onClose?: () => void;
  defaultSiteName?: string;
  initialFilter?: "ALL" | "OPEN" | "RESOLVED";
  initialAction?: "new";
  /** When set, the tracker is scoped to a specific construction site:
   *  - List filtered to this siteId server-side
   *  - Create/Edit form forces this siteId (no free-text site name)
   *  - Header shows the site name */
  scopedSiteId?: string;
  scopedSiteName?: string;
  /** Data partition. GENERIC = Arıza Takip; SANTIYE = Şantiye Arıza. Fully separate datasets. */
  kind?: "GENERIC" | "SANTIYE";
  /** Hide internal header (used when wrapper popup already provides one). */
  hideHeader?: boolean;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function AriszaTracker({ mode, onClose, defaultSiteName, initialFilter = "ALL", initialAction, scopedSiteId, scopedSiteName, kind = "GENERIC", hideHeader = false }: Props) {
  const { isMobile, isTablet } = useDevice();
  const [arizalar, setArizalar] = useState<Ariza[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">(initialFilter);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mediaRequiredNotice, setMediaRequiredNotice] = useState(false);
  const initialActionHandledRef = useRef(false);

  // Form state
  const [fSiteName, setFSiteName] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fDescription, setFDescription] = useState("");
  const [fStartDate, setFStartDate] = useState(todayStr());
  const [fEndDate, setFEndDate] = useState("");
  const [fAssigned, setFAssigned] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Media viewer
  const [viewerMedia, setViewerMedia] = useState<{ ariszaId: string; list: Media[]; index: number } | null>(null);
  const [detail, setDetail] = useState<Ariza | null>(null); // tek arıza tam-ekran detay
  const [imgZoom, setImgZoom] = useState(1);
  const [imgPan, setImgPan] = useState({ x: 0, y: 0 });
  const [imgFullscreen, setImgFullscreen] = useState(false);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgTouchRef = useRef<{ dist: number; cx: number; cy: number; scale: number; px: number; py: number; moved: boolean; t: number; swipeDx?: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoCaptureRef = useRef<HTMLInputElement>(null);
  const videoCaptureRef = useRef<HTMLInputElement>(null);

  // PC camera (getUserMedia) state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraType, setCameraType] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Lock body scroll when any modal/popup is open
  useBodyScrollLock(!!(showForm || confirmDeleteId || mediaRequiredNotice || viewerMedia || cameraActive || detail));

  // Load arizalar — always fetch ALL (so badge counts always reflect true totals);
  // status filter is applied client-side. When scopedSiteId is provided, server
  // filters to that site only.
  const fetchArizalar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: "ALL", kind });
      if (scopedSiteId) qs.set("siteId", scopedSiteId);
      const res = await fetch(`/api/ariza?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setArizalar(data.arizalar || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [scopedSiteId, kind]);

  useEffect(() => { fetchArizalar(); }, [fetchArizalar]);

  // Keyboard nav for media viewer
  useEffect(() => {
    if (!viewerMedia) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerMedia(null);
      else if (e.key === "ArrowLeft" && viewerMedia.index > 0) {
        setViewerMedia({ ...viewerMedia, index: viewerMedia.index - 1 });
        setImgZoom(1); setImgPan({ x: 0, y: 0 });
      } else if (e.key === "ArrowRight" && viewerMedia.index < viewerMedia.list.length - 1) {
        setViewerMedia({ ...viewerMedia, index: viewerMedia.index + 1 });
        setImgZoom(1); setImgPan({ x: 0, y: 0 });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [viewerMedia]);

  const resetForm = useCallback(() => {
    setFSiteName(scopedSiteName || defaultSiteName || "");
    setShowSuggestions(false);
    setFDescription("");
    setFStartDate(todayStr());
    setFEndDate("");
    setFAssigned("");
    setPendingFiles([]);
    setError("");
    setEditingId(null);
  }, [defaultSiteName, scopedSiteName]);

  const openNewForm = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  useEffect(() => {
    if (initialActionHandledRef.current) return;
    if (initialAction === "new") {
      initialActionHandledRef.current = true;
      openNewForm();
    }
  }, [initialAction, openNewForm]);

  const openEdit = (a: Ariza) => {
    setEditingId(a.id);
    setFSiteName(a.customSiteName || a.site?.name || "");
    setShowSuggestions(false);
    setFDescription(a.description);
    setFStartDate(a.startDate.slice(0, 10));
    setFEndDate(a.endDate ? a.endDate.slice(0, 10) : "");
    setFAssigned(a.assignedPersonnel || "");
    setPendingFiles([]);
    setError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles((prev) => [...prev, ...files]);
    if (e.target) e.target.value = "";
  };

  // ── PC Camera (getUserMedia) ──
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

  const startCamera = useCallback(async (type: "photo" | "video") => {
    // Mobil/tablet cihazlarda doğrudan native kameraya yönlendir
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) {
      if (type === "photo") photoCaptureRef.current?.click();
      else videoCaptureRef.current?.click();
      return;
    }
    setCameraType(type);
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
      // Fallback to native file picker with capture attribute (works on iPad/mobile)
      if (type === "photo") photoCaptureRef.current?.click();
      else videoCaptureRef.current?.click();
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
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
      setPendingFiles((prev) => [...prev, file]);
      closeCamera();
    }, "image/jpeg", 0.9);
  }, [closeCamera]);

  const startVideoRecording = useCallback(() => {
    if (!cameraStreamRef.current) return;
    recordedChunksRef.current = [];
    const supportedTypes = [
      "video/mp4;codecs=h264,aac", "video/mp4",
      "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm",
    ];
    let selectedMime = "";
    for (const t of supportedTypes) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) { selectedMime = t; break; }
    }
    const options: MediaRecorderOptions = selectedMime ? { mimeType: selectedMime } : {};
    const recorder = new MediaRecorder(cameraStreamRef.current, options);
    const actualMime = recorder.mimeType;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: actualMime });
      const ext = actualMime.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `video_${Date.now()}.${ext}`, { type: actualMime });
      setPendingFiles((prev) => [...prev, file]);
      closeCamera();
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);
    setIsRecording(true);
  }, [closeCamera]);

  const stopVideoRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const uploadPendingFiles = async (ariszaId: string) => {
    if (pendingFiles.length === 0) return;
    const fd = new FormData();
    for (const f of pendingFiles) fd.append("files", f);
    try {
      await fetch(`/api/ariza/${ariszaId}/media`, { method: "POST", body: fd });
    } catch (e) { console.error(e); }
  };

  const handleSubmit = async () => {
    setError("");
    if (!fSiteName.trim()) { setError("Şantiye adı zorunludur"); return; }
    if (!fDescription.trim()) { setError("Açıklama zorunludur"); return; }
    if (!fStartDate) { setError("Başlangıç tarihi zorunludur"); return; }
    if (!editingId && pendingFiles.length === 0) {
      setMediaRequiredNotice(true);
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        siteName: fSiteName.trim(),
        description: fDescription.trim(),
        startDate: fStartDate,
        endDate: fEndDate || null,
        assignedPersonnel: fAssigned.trim() || null,
        kind,
      };
      if (scopedSiteId) {
        payload.siteId = scopedSiteId;
      }

      let ariszaId = editingId;
      if (editingId) {
        const res = await fetch(`/api/ariza/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Güncelleme hatası");
        }
      } else {
        const res = await fetch(`/api/ariza`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Oluşturma hatası");
        }
        const d = await res.json();
        ariszaId = d.ariza.id;
      }

      if (ariszaId) await uploadPendingFiles(ariszaId);

      await fetchArizalar();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/ariza/${id}`, { method: "DELETE" });
      if (res.ok) {
        setArizalar((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (e) { console.error(e); }
    setConfirmDeleteId(null);
    if (editingId === id) closeForm();
  };

  const toggleResolved = async (a: Ariza) => {
    const newStatus = a.status === "OPEN" ? "RESOLVED" : "OPEN";
    const newEnd = newStatus === "RESOLVED" ? (a.endDate || todayStr()) : null;
    try {
      const res = await fetch(`/api/ariza/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, endDate: newEnd }),
      });
      if (res.ok) await fetchArizalar();
    } catch (e) { console.error(e); }
  };

  const deleteMedia = async (ariszaId: string, mediaId: string) => {
    try {
      const res = await fetch(`/api/ariza/${ariszaId}/media/${mediaId}`, { method: "DELETE" });
      if (res.ok) {
        setArizalar((prev) => prev.map((a) => a.id === ariszaId ? { ...a, media: a.media.filter((m) => m.id !== mediaId) } : a));
      }
    } catch (e) { console.error(e); }
  };

  // Site name suggestions: distinct names across all arızalar (customSiteName + linked site.name)
  const siteNameSuggestions = (() => {
    const set = new Set<string>();
    for (const a of arizalar) {
      if (a.customSiteName) set.add(a.customSiteName);
      else if (a.site?.name) set.add(a.site.name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  })();
  const filteredSuggestions = fSiteName.trim()
    ? siteNameSuggestions.filter((n) => n.toLocaleLowerCase("tr").includes(fSiteName.trim().toLocaleLowerCase("tr")))
    : siteNameSuggestions;

  const formatDate = (s: string) => {
    if (!s) return "-";
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  };

  const wrapperClass = mode === "modal"
    ? "flex-1 flex flex-col overflow-hidden"
    : isTablet
      ? "w-full px-4 py-4"
      : "max-w-7xl mx-auto p-4 sm:p-6";

  const counts = {
    open: arizalar.filter((a) => a.status === "OPEN").length,
    resolved: arizalar.filter((a) => a.status === "RESOLVED").length,
  };

  // Client-side status filter so badge counts always reflect true totals
  const displayedArizalar = filter === "ALL"
    ? arizalar
    : arizalar.filter((a) => a.status === filter);

  return (
    <div className={wrapperClass}>
      {/* Header */}
      {!hideHeader && (
      <div className={mode === "modal" ? "flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0" : "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6"}>
        <div className="flex items-center gap-3">
          <AlertTriangle className={mode === "modal" ? "text-amber-300" : "text-amber-500"} size={mode === "modal" ? 22 : 28} />
          <div>
            <h1 className={mode === "modal" ? "text-lg font-bold" : "text-2xl font-bold text-gray-900"}>
              {scopedSiteName ? `Şantiye Arıza — ${scopedSiteName}` : "Arıza Takip"}
            </h1>
            {mode === "page" && !scopedSiteName && <p className="text-gray-500 text-sm mt-0.5">Tüm arıza kayıtları</p>}
            {mode === "page" && scopedSiteName && <p className="text-gray-500 text-sm mt-0.5">{scopedSiteName} şantiyesi arıza kayıtları</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTablet && (
            <button
              onClick={openNewForm}
              className={`flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold whitespace-nowrap shadow ${mode === "modal" ? "px-3 py-1.5 text-sm" : "px-6 py-3.5 text-base"}`}
            >
              <Plus size={mode === "modal" ? 16 : 22} />
              Yeni Arıza
            </button>
          )}
          {mode === "modal" && (
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded">
              <X size={22} />
            </button>
          )}
        </div>
      </div>
      )}

      <div className={mode === "modal" ? "flex-1 overflow-y-auto p-4" : ""}>
        {/* Filter + new — mobilde durum üstte, "Yeni Arıza" hemen altında tam genişlik (çakışmayı önler) */}
        <div className={`bg-white rounded-xl border border-gray-200 mb-4 ${
          isMobile
            ? "p-3 flex flex-col gap-3"
            : isTablet
              ? "p-4 flex items-end gap-3 flex-nowrap"
              : "p-4 flex items-end gap-3 flex-wrap"
        }`}>
          <div className="flex-1 min-w-[120px]">
            <label className={`block font-medium text-gray-500 mb-1 ${isTablet ? "text-sm" : "text-xs"}`}>Durum</label>
            <div className={`flex bg-gray-100 rounded-lg gap-1 ${isTablet ? "p-1.5" : "p-1"}`}>
              {([
                { key: "ALL", label: `Tümü` },
                { key: "OPEN", label: `Açık (${counts.open})` },
                { key: "RESOLVED", label: `Çözülen (${counts.resolved})` },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`tap rounded-md font-medium transition-colors whitespace-nowrap ${
                    isTablet ? "px-5 py-4 text-lg" : isMobile ? "flex-1 px-2 py-2 text-sm" : "px-3 py-1.5 text-sm"
                  } ${
                    filter === f.key ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {isMobile ? (
            <button
              onClick={openNewForm}
              className="pressable w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold py-3 shadow-md active:scale-95 transition-all"
            >
              <Plus size={18} />
              Yeni Arıza
            </button>
          ) : !isTablet ? (
            <button
              onClick={openNewForm}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium whitespace-nowrap px-3 py-1.5 text-sm"
            >
              <Plus size={16} />
              Yeni Arıza
            </button>
          ) : null}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-amber-500" size={32} />
          </div>
        ) : displayedArizalar.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <AlertTriangle className="mx-auto text-gray-300 mb-3" size={42} />
            <p className="text-gray-500">Bu filtreye uygun arıza kaydı bulunamadı</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedArizalar.map((a, idx) => {
              const rowBg = a.status === "RESOLVED"
                ? "bg-green-50 border-green-200"
                : "bg-yellow-50 border-yellow-300";
              const badge = a.status === "RESOLVED"
                ? "bg-green-600 text-white"
                : "bg-yellow-500 text-white";
              const siteLabel = a.customSiteName || a.site?.name || "—";
              const subLocation = a.isPeyzaj
                ? "Peyzaj"
                : [a.block?.name, a.floor?.name, a.unit?.name].filter(Boolean).join(" / ");
              return (
                <div
                  key={a.id}
                  className={`pressable pressable-dark mob-fade-up rounded-xl border-2 ${rowBg} p-4 cursor-pointer hover:shadow-md transition-shadow`}
                  style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                  onClick={() => {
                    if (a.media.length > 0) setViewerMedia({ ariszaId: a.id, list: a.media, index: 0 });
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${badge}`}>
                          {a.status === "RESOLVED" ? <><CheckCircle2 size={12} /> Çözüldü</> : <><Clock size={12} /> Açık</>}
                        </span>
                        <span className="text-sm font-semibold text-gray-700">{siteLabel}</span>
                        {subLocation && (
                          <span className="text-xs text-gray-500">· {subLocation}</span>
                        )}
                      </div>
                      <p className="text-gray-900 font-medium mb-2 whitespace-pre-wrap">{a.description}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600">
                        <div><span className="text-gray-400">Başlangıç:</span> {formatDate(a.startDate)}</div>
                        <div><span className="text-gray-400">Bitiş:</span> {a.endDate ? formatDate(a.endDate) : "—"}</div>
                        <div><span className="text-gray-400">Personel:</span> {a.assignedPersonnel || "—"}</div>
                        <div><span className="text-gray-400">Kayıt:</span> {a.createdByName || "—"}</div>
                      </div>

                      {a.media.length > 0 ? (
                        <div className="mt-3 flex items-center gap-2 text-xs text-amber-700">
                          <Eye size={14} />
                          <span className="italic">Medyayı görmek için tıklayınız ({a.media.length} dosya)</span>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-gray-400 italic">Medya yok</div>
                      )}
                    </div>

                    <div className="flex sm:flex-col gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setDetail(a)}
                        className="pressable px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#1e3a5f] hover:bg-[#16293f] text-white inline-flex items-center justify-center gap-1"
                      >
                        Detay <ChevronRight size={14} />
                      </button>
                      <button
                        onClick={() => toggleResolved(a)}
                        className={`pressable px-3 py-1.5 rounded-lg text-sm font-medium ${
                          a.status === "OPEN"
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "bg-yellow-500 hover:bg-yellow-600 text-white"
                        }`}
                      >
                        {a.status === "OPEN" ? "Çözüldü işaretle" : "Tekrar aç"}
                      </button>
                      <button
                        onClick={() => openEdit(a)}
                        className="pressable pressable-dark px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-300 hover:bg-gray-50"
                      >
                        Düzenle
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className={`fixed inset-0 z-[60] flex ${isMobile ? "flex-col" : "bg-black/50 items-center justify-center p-4"}`}>
          <div className={`bg-white flex flex-col ${isMobile ? "w-full h-full" : "rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh]"}`}>
            <div className={isMobile ? "flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0 modal-safe-top" : "flex items-center justify-between px-5 py-3 border-b"}>
              <h3 className="font-bold text-lg">{editingId ? "Arıza Düzenle" : "Yeni Arıza"}</h3>
              <button onClick={closeForm} className={isMobile ? "p-1.5 hover:bg-white/20 rounded" : "p-1.5 hover:bg-gray-100 rounded"}>
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Site Name (free text + autocomplete) — locked when scoped to a site */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Şantiye Adı *</label>
                {scopedSiteId ? (
                  <div className="w-full px-3 py-3 text-base bg-gray-100 border border-gray-200 rounded-lg text-gray-700 font-medium">
                    {scopedSiteName || fSiteName || "—"}
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={fSiteName}
                      onChange={(e) => { setFSiteName(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      placeholder="Şantiye adını girin veya seçin"
                      className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                      autoComplete="off"
                    />
                    {showSuggestions && filteredSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredSuggestions.map((name) => (
                          <button
                            type="button"
                            key={name}
                            onMouseDown={(e) => { e.preventDefault(); setFSiteName(name); setShowSuggestions(false); }}
                            className="w-full text-left px-3 py-2 text-base hover:bg-amber-50"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Açıklama *</label>
                <textarea
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Arıza ile ilgili detaylı açıklama..."
                />
              </div>

              {/* Dates: stacked on mobile/tablet to avoid iOS native picker overflow */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Başlangıç Tarihi *</label>
                  <input type="date" value={fStartDate} onChange={(e) => setFStartDate(e.target.value)}
                    className="w-full min-w-0 px-3 py-3 text-base border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Giderildiği Tarih</label>
                  <input type="date" value={fEndDate} onChange={(e) => setFEndDate(e.target.value)}
                    className="w-full min-w-0 px-3 py-3 text-base border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500" />
                  <p className="text-xs text-gray-400 mt-1">Boş = devam ediyor</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">İlgilenen Personel</label>
                <input type="text" value={fAssigned} onChange={(e) => setFAssigned(e.target.value)}
                  placeholder="opsiyonel"
                  className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500" />
              </div>

              {/* Media */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fotoğraf / Video</label>
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleFiles} className="hidden" />
                <input ref={photoCaptureRef} type="file" accept="image/*" capture="environment" onChange={handleFiles} className="hidden" />
                <input ref={videoCaptureRef} type="file" accept="video/*" capture="environment" onChange={handleFiles} className="hidden" />

                {isMobile ? (
                  /* MOBİL: depo / teslimat / medya pop-up ile aynı modern butonlar (flex, tek satır) */
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startCamera("photo")}
                      className="pressable flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                      <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Camera size={18} /></span>
                      <span className="text-xs">Fotoğraf</span>
                    </button>
                    <button type="button" onClick={() => startCamera("video")}
                      className="pressable flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                      <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Video size={18} /></span>
                      <span className="text-xs">Video</span>
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="pressable flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-[#c0392b] text-white font-semibold shadow-md active:scale-95 transition-all">
                      <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><FolderOpen size={18} /></span>
                      <span className="text-xs">Galeri</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => startCamera("photo")}
                      className={`flex items-center justify-center gap-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow hover:shadow-md ${isTablet ? "px-4 py-5 text-base" : "px-3 py-3 text-sm"}`}
                    >
                      <Camera size={isTablet ? 22 : 18} />
                      <span className="hidden sm:inline">Fotoğraf Çek</span>
                      <span className="sm:hidden">Fotoğraf</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startCamera("video")}
                      className={`flex items-center justify-center gap-2 rounded-full bg-purple-600 text-white font-semibold hover:bg-purple-700 active:scale-95 transition-all shadow hover:shadow-md ${isTablet ? "px-4 py-5 text-base" : "px-3 py-3 text-sm"}`}
                    >
                      <Video size={isTablet ? 22 : 18} />
                      <span className="hidden sm:inline">Video Çek</span>
                      <span className="sm:hidden">Video</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex items-center justify-center gap-2 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 active:scale-95 transition-all shadow hover:shadow-md ${isTablet ? "px-4 py-5 text-base" : "px-3 py-3 text-sm"}`}
                    >
                      <FolderOpen size={isTablet ? 22 : 18} />
                      <span className="hidden sm:inline">Galeriden Seç</span>
                      <span className="sm:hidden">Galeri</span>
                    </button>
                  </div>
                )}

                {pendingFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pendingFiles.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                        <ImageIcon size={14} className="text-gray-500" />
                        <span className="max-w-[180px] truncate">{f.name}</span>
                        <button onClick={() => setPendingFiles((p) => p.filter((_, i) => i !== idx))} className="tap text-gray-500 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className={`px-5 py-3 border-t flex items-center gap-2 shrink-0 ${editingId ? "justify-between" : "justify-end"}`} style={isMobile ? { paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" } : undefined}>
              {editingId && (
                <button
                  onClick={() => setConfirmDeleteId(editingId)}
                  className={`flex items-center gap-2 rounded-full bg-white border-2 border-red-300 text-red-600 hover:bg-red-50 font-medium ${isTablet ? "px-6 py-3.5 text-base" : "px-4 py-2 text-sm"}`}
                >
                  <Trash2 size={isTablet ? 18 : 14} />
                  Arızayı Sil
                </button>
              )}
              <div className="flex gap-2">
                <button
                  onClick={closeForm}
                  className={`rounded-full border-2 border-gray-300 hover:bg-gray-50 font-medium ${isTablet ? "px-6 py-3.5 text-base" : "px-4 py-2 text-sm"}`}
                >
                  İptal
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={`rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold disabled:opacity-50 shadow ${isTablet ? "px-7 py-3.5 text-base" : "px-5 py-2 text-sm"}`}
                >
                  {submitting ? "Kaydediliyor..." : (editingId ? "Güncelle" : "Kaydet")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={20} />
              Arıza Kaydını Sil
            </h3>
            <p className="text-gray-600 text-sm mb-4">Bu arıza kaydı ve tüm medyası kalıcı olarak silinecek. Onaylıyor musunuz?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
                İptal
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white">
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media required notice */}
      {mediaRequiredNotice && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <AlertTriangle className="text-amber-600" size={24} />
            </div>
            <h3 className="font-bold text-lg text-gray-900 mb-2">Fotoğraf veya Video Gerekli</h3>
            <p className="text-gray-600 text-sm mb-5">
              Yeni arıza eklemelerinde Fotoğraf veya Video eklemeden kayıt oluşturamazsınız.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setMediaRequiredNotice(false)}
                className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tek arıza — tam-ekran detay (Detay butonu) */}
      {detail && (
        <div
          className={`fixed inset-0 bg-black/50 z-[75] ${isMobile ? "" : "flex items-center justify-center p-4"}`}
          onClick={() => setDetail(null)}
        >
          <div
            className={`bg-white overflow-y-auto ${isMobile ? "w-full h-full" : "rounded-xl shadow-xl w-full max-w-lg max-h-[90vh]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center gap-2 border-b sticky top-0 bg-white z-10 ${isMobile ? "modal-safe-top px-2 pb-3" : "justify-between p-5"}`}>
              {isMobile && (
                <button onClick={() => setDetail(null)} className="inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-gray-100 active:scale-90 text-gray-700 shrink-0 transition" aria-label="Geri">
                  <ChevronLeft size={26} />
                </button>
              )}
              <h2 className="text-lg font-bold text-gray-800 flex-1 min-w-0 truncate">Arıza Detayı</h2>
              {!isMobile && (
                <button onClick={() => setDetail(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
              )}
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-gray-900 text-lg leading-snug">{detail.customSiteName || detail.site?.name || "—"}</span>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap shrink-0 ${detail.status === "OPEN" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {detail.status === "OPEN" ? "AÇIK" : "ÇÖZÜLDÜ"}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {detail.isPeyzaj ? "Peyzaj" : ([detail.block?.name, detail.floor?.name, detail.unit?.name].filter(Boolean).join(" · ") || "Genel")}
              </div>
              {detail.description && (
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800 whitespace-pre-wrap">{detail.description}</div>
              )}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><span className="text-gray-500">Başlangıç</span><span className="font-medium text-gray-800">{formatDate(detail.startDate)}</span></div>
                {detail.endDate && <div className="flex justify-between gap-3"><span className="text-gray-500">Bitiş</span><span className="font-medium text-gray-800">{formatDate(detail.endDate)}</span></div>}
                {detail.assignedPersonnel && <div className="flex justify-between gap-3"><span className="text-gray-500">Personel</span><span className="font-medium text-gray-800">{detail.assignedPersonnel}</span></div>}
                {detail.createdByName && <div className="flex justify-between gap-3"><span className="text-gray-500">Açan</span><span className="font-medium text-gray-800">{detail.createdByName}</span></div>}
              </div>
              {detail.media.length > 0 ? (
                <button
                  onClick={() => setViewerMedia({ ariszaId: detail.id, list: detail.media, index: 0 })}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1e3a5f] hover:bg-[#16293f] text-white font-semibold active:scale-[0.99] transition"
                >
                  <Camera size={18} /> Fotoğrafları gör ({detail.media.length})
                </button>
              ) : (
                <div className="text-center text-sm text-gray-400 italic py-2">Medya yok</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media Viewer (full-featured: swipe, pinch-zoom, fullscreen, download/share/delete) */}
      {viewerMedia && (() => {
        const list = viewerMedia.list;
        const idx = viewerMedia.index;
        const current = list[idx];
        if (!current) return null;
        const fileUrl = `/api/ariza/file/${current.id}`;
        const isVideo = current.mimeType.startsWith("video/");
        const owner = arizalar.find((a) => a.id === viewerMedia.ariszaId);
        const ownerLocation = owner
          ? (owner.isPeyzaj ? "Peyzaj" : [owner.block?.name, owner.floor?.name, owner.unit?.name].filter(Boolean).join(" / ") || "—")
          : "—";

        const goPrev = () => {
          if (idx > 0) { setViewerMedia({ ...viewerMedia, index: idx - 1 }); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }
        };
        const goNext = () => {
          if (idx < list.length - 1) { setViewerMedia({ ...viewerMedia, index: idx + 1 }); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }
        };
        const closeViewer = () => {
          setViewerMedia(null); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false);
        };
        const handleDeleteCurrent = async () => {
          if (!owner) return;
          if (!confirm("Bu medyayı silmek istediğinize emin misiniz?")) return;
          await deleteMedia(owner.id, current.id);
          const newList = list.filter((m) => m.id !== current.id);
          if (newList.length === 0) closeViewer();
          else setViewerMedia({ ariszaId: viewerMedia.ariszaId, list: newList, index: Math.min(idx, newList.length - 1) });
        };

        return (
          <div className="fixed inset-0 bg-black/90 flex flex-col z-[80] select-none" onMouseDown={(e) => e.preventDefault()}>
            {/* Header (telefon status bar'ı ile çakışmasın; mobilde tam ekranda gizli — immersive) */}
            <div className={`modal-safe-top flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/50 ${isMobile && imgFullscreen ? "hidden" : ""}`}>
              <div className="text-white min-w-0">
                <h3 className="text-sm font-semibold truncate">Arıza Medyası</h3>
                <p className="text-xs text-white/60 truncate">{ownerLocation} — {idx + 1} / {list.length}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    window.open(`/api/download?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(current.fileName || "medya")}`, "_self");
                  }}
                  className="p-3 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="İndir">
                  <Download size={22} />
                </button>
                <button
                  onClick={() => {
                    const url = window.location.origin + fileUrl;
                    navigator.clipboard.writeText(url).then(() => alert("Link kopyalandı!"));
                  }}
                  className="p-3 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="Link Kopyala">
                  <Share2 size={22} />
                </button>
                {owner && (
                  <button
                    onClick={handleDeleteCurrent}
                    className="p-3 hover:bg-white/20 rounded-xl text-red-400 min-w-[48px] min-h-[48px] flex items-center justify-center" title="Sil">
                    <Trash2 size={22} />
                  </button>
                )}
                <button onClick={closeViewer} className="p-3 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="Kapat">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative" onClick={(e) => { if (e.target === e.currentTarget) closeViewer(); }}>
              <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className={`hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all ${idx <= 0 ? "invisible" : ""}`}>
                <ArrowLeftIcon size={24} />
              </button>

              <div className="w-full flex-1 flex items-center justify-center p-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {isVideo ? (
                  <video
                    key={current.id}
                    src={fileUrl}
                    controls
                    playsInline
                    preload="auto"
                    className="w-full max-h-[85vh] rounded-lg cursor-pointer"
                    onPlay={(e) => {
                      const video = e.currentTarget;
                      const doc = document as Document & { webkitFullscreenElement?: Element };
                      const vid = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitRequestFullscreen?: () => void };
                      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
                        if (vid.requestFullscreen) vid.requestFullscreen();
                        else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
                        else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
                      }
                    }}
                  />
                ) : (
                  <div
                    ref={imgContainerRef}
                    className={`relative w-full h-full flex items-center justify-center ${imgFullscreen ? "bg-black" : ""}`}
                    style={{ touchAction: "none" }}
                    onTouchStart={(e) => {
                      if (e.touches.length === 2 && imgFullscreen) {
                        const dx = e.touches[1].clientX - e.touches[0].clientX;
                        const dy = e.touches[1].clientY - e.touches[0].clientY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        imgTouchRef.current = { dist, cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2, scale: imgZoom, px: imgPan.x, py: imgPan.y, moved: false, t: Date.now() };
                      } else if (e.touches.length === 1) {
                        imgTouchRef.current = { dist: 0, cx: e.touches[0].clientX, cy: e.touches[0].clientY, scale: imgZoom, px: imgPan.x, py: imgPan.y, moved: false, t: Date.now() };
                      }
                    }}
                    onTouchMove={(e) => {
                      if (!imgTouchRef.current) return;
                      if (e.touches.length === 2 && imgFullscreen) {
                        e.preventDefault();
                        const dx = e.touches[1].clientX - e.touches[0].clientX;
                        const dy = e.touches[1].clientY - e.touches[0].clientY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const newScale = Math.min(5, Math.max(1, imgTouchRef.current.scale * (dist / imgTouchRef.current.dist)));
                        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                        const panX = imgTouchRef.current.px + (cx - imgTouchRef.current.cx);
                        const panY = imgTouchRef.current.py + (cy - imgTouchRef.current.cy);
                        setImgZoom(newScale);
                        setImgPan(newScale > 1 ? { x: panX, y: panY } : { x: 0, y: 0 });
                        imgTouchRef.current.moved = true;
                      } else if (e.touches.length === 1 && imgFullscreen && imgZoom > 1) {
                        e.preventDefault();
                        const panX = imgTouchRef.current.px + (e.touches[0].clientX - imgTouchRef.current.cx);
                        const panY = imgTouchRef.current.py + (e.touches[0].clientY - imgTouchRef.current.cy);
                        setImgPan({ x: panX, y: panY });
                        imgTouchRef.current.moved = true;
                      } else if (e.touches.length === 1 && imgZoom <= 1) {
                        const dx = e.touches[0].clientX - imgTouchRef.current.cx;
                        if (Math.abs(dx) > 20) {
                          imgTouchRef.current.moved = true;
                          imgTouchRef.current.swipeDx = dx;
                          setImgPan({ x: dx, y: 0 });
                        }
                      }
                    }}
                    onTouchEnd={(e) => {
                      if (!imgTouchRef.current || e.touches.length !== 0) return;
                      if (imgTouchRef.current.moved && imgTouchRef.current.swipeDx !== undefined && imgZoom <= 1) {
                        const dx = imgTouchRef.current.swipeDx;
                        if (Math.abs(dx) >= 50) {
                          if (dx < -50 && idx < list.length - 1) { goNext(); }
                          else if (dx > 50 && idx > 0) { goPrev(); }
                          else { setImgPan({ x: 0, y: 0 }); }
                        } else { setImgPan({ x: 0, y: 0 }); }
                        imgTouchRef.current = null;
                        return;
                      }
                      if (imgTouchRef.current.moved && imgTouchRef.current.dist > 0) {
                        if (imgZoom <= 1.05) { setImgZoom(1); setImgPan({ x: 0, y: 0 }); }
                        imgTouchRef.current = null;
                        return;
                      }
                      const elapsed = Date.now() - imgTouchRef.current.t;
                      if (!imgTouchRef.current.moved && elapsed < 400) {
                        const now = Date.now();
                        if (imgFullscreen && lastTapRef.current && now - lastTapRef.current < 500) {
                          if (imgZoom > 1) { setImgZoom(1); setImgPan({ x: 0, y: 0 }); }
                          else { setImgZoom(2.5); }
                          lastTapRef.current = 0;
                        } else if (imgFullscreen) {
                          lastTapRef.current = now;
                        } else {
                          lastTapRef.current = 0;
                          const el = imgContainerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
                          if (el) {
                            // Mobilde tarayıcı fullscreen API'si KULLANILMAZ (geçişte alttaki ekran sızabilir / ikon takılabilir) — saf CSS tam ekran (depo MediaViewer ile aynı)
                            if (!isMobile) {
                              if (el.requestFullscreen) el.requestFullscreen();
                              else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                            }
                            setImgFullscreen(true);
                          }
                        }
                      }
                      imgTouchRef.current = null;
                    }}
                    onClick={(e) => {
                      if ("ontouchstart" in window) return;
                      // If user was dragging, ignore click
                      if (imgTouchRef.current?.moved) { imgTouchRef.current = null; return; }
                      // Don't toggle fullscreen if click was a double-click handler target
                      if (e.detail >= 2) return;
                      if (!imgFullscreen) {
                        const el = imgContainerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
                        if (el) {
                          if (el.requestFullscreen) el.requestFullscreen();
                          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                          setImgFullscreen(true);
                        }
                      } else if (imgZoom <= 1) {
                        const doc = document as Document & { webkitExitFullscreen?: () => void };
                        if (document.exitFullscreen) document.exitFullscreen();
                        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
                        setImgFullscreen(false);
                        setImgZoom(1); setImgPan({ x: 0, y: 0 });
                      }
                    }}
                    onDoubleClick={(e) => {
                      if ("ontouchstart" in window) return;
                      e.stopPropagation();
                      if (!imgFullscreen) return;
                      if (imgZoom > 1) { setImgZoom(1); setImgPan({ x: 0, y: 0 }); }
                      else { setImgZoom(2.5); }
                    }}
                    onWheel={(e) => {
                      if ("ontouchstart" in window) return;
                      if (!imgFullscreen) return;
                      e.preventDefault();
                      const delta = e.deltaY > 0 ? -0.2 : 0.2;
                      const newZoom = Math.min(5, Math.max(1, imgZoom + delta));
                      setImgZoom(newZoom);
                      if (newZoom <= 1) setImgPan({ x: 0, y: 0 });
                    }}
                    onMouseDown={(e) => {
                      if ("ontouchstart" in window) return;
                      if (!imgFullscreen || imgZoom <= 1) return;
                      e.preventDefault();
                      imgTouchRef.current = { dist: 0, cx: e.clientX, cy: e.clientY, scale: imgZoom, px: imgPan.x, py: imgPan.y, moved: false, t: Date.now() };
                    }}
                    onMouseMove={(e) => {
                      if ("ontouchstart" in window) return;
                      if (!imgTouchRef.current || !imgFullscreen || imgZoom <= 1) return;
                      const panX = imgTouchRef.current.px + (e.clientX - imgTouchRef.current.cx);
                      const panY = imgTouchRef.current.py + (e.clientY - imgTouchRef.current.cy);
                      setImgPan({ x: panX, y: panY });
                      imgTouchRef.current.moved = true;
                    }}
                    onMouseUp={() => {
                      if ("ontouchstart" in window) return;
                      // Keep moved flag briefly so click doesn't fire fullscreen toggle
                      if (imgTouchRef.current?.moved) {
                        const ref = imgTouchRef.current;
                        setTimeout(() => { if (imgTouchRef.current === ref) imgTouchRef.current = null; }, 50);
                      } else {
                        imgTouchRef.current = null;
                      }
                    }}
                    onMouseLeave={() => {
                      if ("ontouchstart" in window) return;
                      if (imgTouchRef.current && imgTouchRef.current.dist === 0) imgTouchRef.current = null;
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={current.id}
                      src={fileUrl}
                      alt={current.fileName || ""}
                      className={`object-contain rounded-lg select-none cursor-pointer ${imgFullscreen ? "w-full h-full" : "w-full max-h-[85vh]"}`}
                      draggable={false}
                      style={{ transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px)`, transition: imgTouchRef.current ? "none" : "transform 0.2s ease-out" }}
                    />
                    {!imgFullscreen && (
                      <div className="absolute bottom-4 right-4 z-20 p-2 bg-black/50 rounded-full text-white/70 pointer-events-none">
                        <Maximize2 size={18} />
                      </div>
                    )}
                    {imgFullscreen && imgZoom > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }}
                        className="absolute top-4 right-4 z-20 px-3 py-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white text-xs font-medium flex items-center gap-1.5 transition-all">
                        <X size={14} /> {Math.round(imgZoom * 100)}%
                      </button>
                    )}
                    {imgFullscreen && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const doc = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element };
                          if (document.fullscreenElement || doc.webkitFullscreenElement) {
                            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                            else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
                          }
                          setImgFullscreen(false);
                          setImgZoom(1); setImgPan({ x: 0, y: 0 });
                        }}
                        className="absolute bottom-4 right-4 z-30 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-all">
                        <Minimize2 size={18} />
                      </button>
                    )}
                    {imgFullscreen && imgZoom <= 1 && idx > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 rounded-full text-white">
                        <ArrowLeftIcon size={24} />
                      </button>
                    )}
                    {imgFullscreen && imgZoom <= 1 && idx < list.length - 1 && (
                      <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 rounded-full text-white">
                        <ArrowRightIcon size={24} />
                      </button>
                    )}
                    {imgFullscreen && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-black/50 rounded-full text-white text-xs">
                        {idx + 1} / {list.length}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button onClick={(e) => { e.stopPropagation(); goNext(); }} className={`hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all ${idx >= list.length - 1 ? "invisible" : ""}`}>
                <ArrowRightIcon size={24} />
              </button>
            </div>

            {/* Footer (filename, hint) — mobilde tam ekranda gizli */}
            <div className={`flex-shrink-0 w-full max-w-2xl mx-auto px-6 pb-3 text-center ${isMobile && imgFullscreen ? "hidden" : ""}`}>
              {current.fileName && (
                <p className="text-white/70 text-xs truncate">{current.fileName}</p>
              )}
              <p className="text-white/40 text-[10px] mt-1">Tam ekran için tıklayın · Kaydırarak sonraki/önceki</p>
            </div>
          </div>
        );
      })()}

      {/* Camera overlay (PC getUserMedia) */}
      {cameraActive && (
        <div className="fixed inset-0 bg-black z-[90]" style={{ touchAction: "none" }}>
          <video ref={cameraVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
            style={{ paddingTop: "env(safe-area-inset-top, 12px)", background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}>
            <div className="text-white">
              <h3 className="text-sm font-semibold drop-shadow-lg">{cameraType === "photo" ? "Fotoğraf Çek" : "Video Çek"}</h3>
              {isRecording && <p className="text-xs text-red-400 animate-pulse font-bold">● Kayıt yapılıyor...</p>}
            </div>
            <button onClick={closeCamera} className="p-2.5 bg-black/40 backdrop-blur-sm rounded-full text-white active:scale-90">
              <X size={22} />
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-6 px-4 py-8"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)", background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }}>
            {cameraType === "photo" ? (
              <button onClick={capturePhoto}
                className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 hover:border-gray-100 transition-all flex items-center justify-center active:scale-90 shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-200"></div>
              </button>
            ) : !isRecording ? (
              <button onClick={startVideoRecording}
                className="w-20 h-20 rounded-full bg-red-600 border-4 border-red-300 hover:bg-red-500 transition-all flex items-center justify-center active:scale-90 shadow-2xl">
                <div className="w-8 h-8 rounded-full bg-red-700"></div>
              </button>
            ) : (
              <button onClick={stopVideoRecording}
                className="w-20 h-20 rounded-full bg-red-600 border-4 border-red-300 hover:bg-red-500 transition-all flex items-center justify-center animate-pulse active:scale-90 shadow-2xl">
                <div className="w-8 h-8 rounded-sm bg-white"></div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
