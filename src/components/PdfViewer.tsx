"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { downloadFile } from "@/lib/downloadFile";
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, RotateCcw, MapPin, Trash2, Upload, Play, Image as ImageIcon, Camera, Video, Eye, Edit3, Palette, Home, Layers, ChevronRight as ChevronRightIcon, ArrowLeft, ClipboardList, Move, GripVertical } from "lucide-react";

/* ======================== TYPES ======================== */

interface PdfViewerProps {
  fileUrl: string;
  fileName: string;
  documentId?: string;
  onClose: () => void;
  floorLabels?: Record<number, string>;
  isUygulama?: boolean;
  pageFloorUnits?: Record<number, { id: string; name: string }[]>;
  allBlockUnits?: { id: string; name: string }[];
  siteId?: string;
  checklistTemplates?: ChecklistTemplate[];
  activeCategoryId?: string;
  originalDownloadUrl?: string;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

interface ChecklistMediaItem {
  id: string;
  checklistItemId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

interface Annotation {
  id: string;
  documentId: string;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  label: string | null;
  color: string | null;
  pinSize: string | null;
  unitId: string | null;
  createdAt: string;
  createdBy: string;
  creator: { firstName: string; lastName: string };
  media: MediaItem[];
  inherited?: boolean;
}

const PIN_COLORS = [
  { value: "#ef4444", name: "Kırmızı" },
  { value: "#f97316", name: "Turuncu" },
  { value: "#eab308", name: "Sarı" },
  { value: "#22c55e", name: "Yeşil" },
  { value: "#3b82f6", name: "Mavi" },
  { value: "#8b5cf6", name: "Mor" },
  { value: "#ec4899", name: "Pembe" },
  { value: "#1e3a5f", name: "Lacivert" },
];

interface MediaItem {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  title: string | null;
  description: string | null;
  createdAt: string;
}

declare global {
  interface Window {
    pdfjsLib: {
      getDocument: (src: string | { url: string; cMapUrl: string; cMapPacked: boolean }) => { promise: Promise<PDFDocument> };
      GlobalWorkerOptions: { workerSrc: string };
    };
  }
}

interface PDFDocument {
  numPages: number;
  getPage: (num: number) => Promise<PDFPage>;
}

interface PDFPage {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
}

const PDFJS_VERSION = "3.11.174";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const MAX_ZOOM_DWG = 70;
const LONG_PRESS_MS = 500;
const LONG_PRESS_THRESHOLD = 10;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function clampZoom(z: number, maxZoom: number = MAX_ZOOM) {
  return Math.min(maxZoom, Math.max(MIN_ZOOM, z));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/* ======================== COMPONENT ======================== */

export default function PdfViewer({ fileUrl, fileName, documentId, onClose, floorLabels, isUygulama, pageFloorUnits, allBlockUnits, siteId, checklistTemplates, activeCategoryId, originalDownloadUrl }: PdfViewerProps) {
  const isDwg = !!originalDownloadUrl && /\.(dwg|dxf)$/i.test(originalDownloadUrl);
  const maxZoom = isDwg ? MAX_ZOOM_DWG : MAX_ZOOM;
  const zoomStep = isDwg ? 1.0 : 0.25;
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedPin, setSelectedPin] = useState<Annotation | null>(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinActionMenu, setPinActionMenu] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ pinId: string } | null>(null);
  const [unitPickerPos, setUnitPickerPos] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [noFloorWarning, setNoFloorWarning] = useState(false);
  const creatingPin = useRef(false);

  // Checklist popup state
  const [activeChecklistTemplates, setActiveChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistActiveParent, setChecklistActiveParent] = useState<ChecklistTemplate | null>(null);
  const [checklistActiveChild, setChecklistActiveChild] = useState<{ id: string; name: string } | null>(null);
  const [checklistMedia, setChecklistMedia] = useState<Record<string, ChecklistMediaItem[]>>({});
  const [checklistMediaLoading, setChecklistMediaLoading] = useState(false);
  const [checklistUploading, setChecklistUploading] = useState(false);
  const [viewingChecklistMedia, setViewingChecklistMedia] = useState<ChecklistMediaItem | null>(null);
  const checklistFileRef = useRef<HTMLInputElement>(null);
  const checklistCameraRef = useRef<HTMLInputElement>(null);
  const checklistVideoRef = useRef<HTMLInputElement>(null);

  // Normal pin boyut popup
  const [pinSizePopup, setPinSizePopup] = useState(false);

  // Daire pin taşıma/silme state
  const [movingPin, setMovingPin] = useState<Annotation | null>(null);
  const [moveNotification, setMoveNotification] = useState<string | null>(null);
  const [checklistDeleteConfirm, setChecklistDeleteConfirm] = useState(false);
  const moveNotifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingPin = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Medya görüntüleyici klavye navigasyonu
  useEffect(() => {
    if (!viewingMedia || !selectedPin) return;
    const mediaList = selectedPin.media;
    const handler = (e: KeyboardEvent) => {
      const idx = mediaList.findIndex((m) => m.id === viewingMedia.id);
      if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        setViewingMedia(mediaList[idx - 1]);
      } else if (e.key === "ArrowRight" && idx < mediaList.length - 1) {
        e.preventDefault();
        setViewingMedia(mediaList[idx + 1]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setViewingMedia(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [viewingMedia, selectedPin]);

  const [longPressIndicator, setLongPressIndicator] = useState<{ x: number; y: number } | null>(null);
  const [cameraOpen, setCameraOpen] = useState<"photo" | "video" | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Lock body scroll (PDF viewer is always a full-screen overlay, plus sub-popups)
  useBodyScrollLock(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const liveCameraRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Pinch-to-zoom tracking
  const pinchStartDist = useRef(0);
  const pinchStartZoom = useRef(1);
  const isPinching = useRef(false);
  const visualScale = useRef(1);
  const wheelZoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingZoom = useRef(1.0);

  // Focal point for zoom-to-point
  const focalPoint = useRef<{ contentX: number; contentY: number; screenX: number; screenY: number } | null>(null);

  // Long-press tracking
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressFired = useRef(false);

  // DWG HD tile overlay refs
  const hdCanvasRef = useRef<HTMLCanvasElement>(null);
  const hdRenderingRef = useRef(false);
  const hdScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwgPageDataRef = useRef<{ page: PDFPage; scale: number; displayWidth: number; displayHeight: number } | null>(null);
  const hdPendingRef = useRef(false);

  /* =================== PDF LOADING =================== */

  useEffect(() => {
    async function init() {
      try {
        await loadScript(`${PDFJS_CDN}/pdf.min.js`);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
        const doc = await window.pdfjsLib.getDocument(fileUrl).promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        console.error("PDF load error:", err);
        setError("PDF yüklenemedi");
        setLoading(false);
      }
    }
    init();
  }, [fileUrl]);

  // DWG: render HD tile for visible viewport area (sharp overlay on low-res base)
  const doRenderHdTile = useCallback(async () => {
    const data = dwgPageDataRef.current;
    if (!data || !hdCanvasRef.current || !containerRef.current) return;
    if (hdRenderingRef.current) { hdPendingRef.current = true; return; }
    hdRenderingRef.current = true;
    hdPendingRef.current = false;

    const { page, scale, displayWidth, displayHeight } = data;
    const container = containerRef.current;
    const hdCanvas = hdCanvasRef.current;

    try {
      const padOffset = 16;
      const visLeft = Math.max(0, container.scrollLeft - padOffset);
      const visTop = Math.max(0, container.scrollTop - padOffset);
      const visW = Math.min(container.clientWidth, Math.max(1, displayWidth - visLeft));
      const visH = Math.min(container.clientHeight, Math.max(1, displayHeight - visTop));
      if (visW <= 0 || visH <= 0) return;

      // Add margin around visible area for smoother scrolling
      const marg = 300;
      const extLeft = Math.max(0, visLeft - marg);
      const extTop = Math.max(0, visTop - marg);
      const extW = Math.min(displayWidth - extLeft, visW + 2 * marg);
      const extH = Math.min(displayHeight - extTop, visH + 2 * marg);

      // Render only the visible portion at full zoom resolution
      const off = document.createElement('canvas');
      off.width = Math.ceil(extW);
      off.height = Math.ceil(extH);
      const offCtx = off.getContext('2d');
      if (!offCtx) return;

      offCtx.translate(-extLeft, -extTop);
      const viewport = page.getViewport({ scale });
      await page.render({ canvasContext: offCtx, viewport }).promise;

      // Swap to visible HD canvas
      hdCanvas.width = off.width;
      hdCanvas.height = off.height;
      hdCanvas.style.width = Math.ceil(extW) + 'px';
      hdCanvas.style.height = Math.ceil(extH) + 'px';
      hdCanvas.style.left = Math.round(extLeft) + 'px';
      hdCanvas.style.top = Math.round(extTop) + 'px';

      const ctx = hdCanvas.getContext('2d');
      if (ctx) ctx.drawImage(off, 0, 0);
      hdCanvas.style.display = 'block';
    } finally {
      hdRenderingRef.current = false;
      if (hdPendingRef.current) {
        hdPendingRef.current = false;
        requestAnimationFrame(() => doRenderHdTile());
      }
    }
  }, []);

  /* =================== FETCH ANNOTATIONS =================== */

  const fetchAnnotations = useCallback(async () => {
    if (!documentId) return;
    try {
      const res = await fetch(`/api/annotations/by-document/${documentId}`);
      if (res.ok) {
        const data = await res.json();
        setAnnotations(data.annotations || []);
      }
    } catch (err) {
      console.error("Annotations fetch error:", err);
    }
  }, [documentId]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  /* =================== PAGE RENDER =================== */

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || renderingRef.current) return;
    renderingRef.current = true;

    const focal = focalPoint.current;
    focalPoint.current = null;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const container = containerRef.current;
      const containerWidth = container ? container.clientWidth - 32 : window.innerWidth - 32;
      const baseViewport = page.getViewport({ scale: 1 });
      const baseScale = containerWidth / baseViewport.width;
      const scale = baseScale * zoom;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;

      // DWG performance: tiered canvas resolution cap based on zoom level
      const displayWidth = viewport.width;
      const displayHeight = viewport.height;
      const totalPixels = displayWidth * displayHeight;
      let renderVp = viewport;
      let dwgCapped = false;

      if (isDwg) {
        // Low-res base canvas: HD overlay provides detail for visible area
        const maxBasePixels = 4_000_000;
        if (totalPixels > maxBasePixels) {
          dwgCapped = true;
          const ratio = Math.sqrt(maxBasePixels / totalPixels);
          renderVp = page.getViewport({ scale: scale * ratio });
        }
        // Hide stale HD tile during re-render
        if (hdCanvasRef.current) hdCanvasRef.current.style.display = 'none';
      }

      // Render to offscreen canvas first to avoid flash
      const offscreen = document.createElement("canvas");
      offscreen.width = renderVp.width;
      offscreen.height = renderVp.height;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) { renderingRef.current = false; return; }

      await page.render({ canvasContext: offCtx, viewport: renderVp }).promise;

      // Now swap: update visible canvas dimensions and draw the offscreen result
      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(offscreen, 0, 0);
      }

      // Set CSS display size for visual scaling
      if (dwgCapped) {
        canvas.style.width = `${Math.round(displayWidth)}px`;
        canvas.style.height = `${Math.round(displayHeight)}px`;
      } else {
        canvas.style.width = '';
        canvas.style.height = '';
      }

      // Reset CSS transform AFTER new content is drawn
      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.style.transform = "";
        wrapper.style.transformOrigin = "";
      }
      visualScale.current = 1;

      // Restore scroll for focal point
      if (focal && container) {
        const scrollW = dwgCapped ? displayWidth : canvas.width;
        const scrollH = dwgCapped ? displayHeight : canvas.height;
        const canvasPixelX = focal.contentX * scrollW;
        const canvasPixelY = focal.contentY * scrollH;
        container.scrollLeft = canvasPixelX + 16 - focal.screenX;
        container.scrollTop = canvasPixelY + 16 - focal.screenY;
      }

      // DWG: store page data and schedule HD tile render
      if (isDwg) {
        dwgPageDataRef.current = { page, scale, displayWidth, displayHeight };
        requestAnimationFrame(() => doRenderHdTile());
      }
    } finally {
      renderingRef.current = false;
    }
  }, [pdfDoc, currentPage, zoom, isDwg, doRenderHdTile]);

  useEffect(() => {
    renderPage();
    pendingZoom.current = zoom;
  }, [renderPage]);

  useEffect(() => {
    const handleResize = () => renderPage();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderPage]);

  // iOS metin seçme menüsünü engelle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const prevent = (e: Event) => e.preventDefault();
    container.addEventListener("selectstart", prevent);
    return () => container.removeEventListener("selectstart", prevent);
  }, []);

  // DWG: re-render HD tile on scroll for sharp visible area
  useEffect(() => {
    if (!isDwg) return;
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (hdScrollTimerRef.current) clearTimeout(hdScrollTimerRef.current);
      hdScrollTimerRef.current = setTimeout(() => doRenderHdTile(), 120);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isDwg, doRenderHdTile]);

  /* =================== WHEEL ZOOM =================== */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const oldZoom = pendingZoom.current;
      const wheelStep = isDwg ? (oldZoom >= 5 ? 0.5 : 0.1) : 0.1;
      const delta = e.deltaY > 0 ? -wheelStep : wheelStep;
      const newZoom = clampZoom(oldZoom + delta, maxZoom);
      pendingZoom.current = newZoom;

      const rect = container.getBoundingClientRect();
      const canvas = canvasRef.current;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      if (canvas) {
        const contentPixelX = container.scrollLeft + screenX - 16;
        const contentPixelY = container.scrollTop + screenY - 16;
        // Use CSS display dimensions (clientWidth/Height account for CSS scaling)
        const cw = canvas.clientWidth || canvas.width;
        const ch = canvas.clientHeight || canvas.height;
        const fracX = cw > 0 ? contentPixelX / cw : 0;
        const fracY = ch > 0 ? contentPixelY / ch : 0;
        focalPoint.current = { contentX: fracX, contentY: fracY, screenX, screenY };

        const cssScale = newZoom / zoom;
        const wrapper = wrapperRef.current;
        if (wrapper) {
          wrapper.style.transform = `scale(${cssScale})`;
          wrapper.style.transformOrigin = `${contentPixelX}px ${contentPixelY}px`;
        }
        // Hide HD tile during zoom transition
        if (hdCanvasRef.current) hdCanvasRef.current.style.display = 'none';
      }

      if (wheelZoomTimer.current) clearTimeout(wheelZoomTimer.current);
      // DWG renders slower, use longer debounce to keep CSS transform smooth
      const debounce = isDwg ? 400 : 150;
      wheelZoomTimer.current = setTimeout(() => {
        setZoom(pendingZoom.current);
      }, debounce);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoom, isDwg]);

  /* =================== TOUCH PINCH =================== */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function getTouchDist(t1: Touch, t2: Touch) {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getTouchMid(t1: Touch, t2: Touch) {
      return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    }

    let focalFracX = 0, focalFracY = 0, originX = 0, originY = 0, lastScreenX = 0, lastScreenY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isPinching.current = true;
        cancelLongPress();
        // Hide HD tile during pinch zoom
        if (hdCanvasRef.current) hdCanvasRef.current.style.display = 'none';
        pinchStartDist.current = getTouchDist(e.touches[0], e.touches[1]);
        pinchStartZoom.current = zoom;

        const mid = getTouchMid(e.touches[0], e.touches[1]);
        const rect = container.getBoundingClientRect();
        const canvas = canvasRef.current;
        lastScreenX = mid.x - rect.left;
        lastScreenY = mid.y - rect.top;

        const contentPixelX = container.scrollLeft + lastScreenX - 16;
        const contentPixelY = container.scrollTop + lastScreenY - 16;

        if (canvas) {
          const cw = canvas.clientWidth || canvas.width;
          const ch = canvas.clientHeight || canvas.height;
          if (cw > 0 && ch > 0) {
            focalFracX = contentPixelX / cw;
            focalFracY = contentPixelY / ch;
          }
        }
        originX = contentPixelX;
        originY = contentPixelY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinching.current) {
        e.preventDefault();
        const currentDist = getTouchDist(e.touches[0], e.touches[1]);
        const ratio = currentDist / pinchStartDist.current;
        const newZoom = clampZoom(pinchStartZoom.current * ratio, maxZoom);
        const cssScale = newZoom / zoom;

        const wrapper = wrapperRef.current;
        if (wrapper) {
          wrapper.style.transform = `scale(${cssScale})`;
          wrapper.style.transformOrigin = `${originX}px ${originY}px`;
          visualScale.current = cssScale;
        }

        const mid = getTouchMid(e.touches[0], e.touches[1]);
        const rect = container.getBoundingClientRect();
        lastScreenX = mid.x - rect.left;
        lastScreenY = mid.y - rect.top;
        pendingZoom.current = newZoom;
      }
    };

    const handleTouchEnd = () => {
      if (isPinching.current) {
        isPinching.current = false;
        const finalZoom = pendingZoom.current;
        if (finalZoom !== zoom) {
          focalPoint.current = { contentX: focalFracX, contentY: focalFracY, screenX: lastScreenX, screenY: lastScreenY };
          setZoom(finalZoom);
        } else {
          const wrapper = wrapperRef.current;
          if (wrapper) {
            wrapper.style.transform = "";
            wrapper.style.transformOrigin = "";
          }
        }
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [zoom]);

  /* =================== LONG PRESS =================== */

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStart.current = null;
    setLongPressIndicator(null);
  }, []);

  const handleLongPressComplete = useCallback(async (clientX: number, clientY: number) => {
    if (!documentId || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const canvasRect = canvas.getBoundingClientRect();

    const xPercent = canvasRect.width > 0 ? (clientX - canvasRect.left) / canvasRect.width : 0;
    const yPercent = canvasRect.height > 0 ? (clientY - canvasRect.top) / canvasRect.height : 0;

    if (xPercent < 0 || xPercent > 1 || yPercent < 0 || yPercent > 1) return;

    if (navigator.vibrate) navigator.vibrate(50);

    // Uygulama projesi modunda
    if (isUygulama) {
      if (!floorLabels?.[currentPage]) {
        setNoFloorWarning(true);
        return;
      }
      const units = pageFloorUnits?.[currentPage];
      if (units?.length) {
        setUnitPickerPos({ xPercent, yPercent });
      } else {
        const floorName = floorLabels[currentPage];
        try {
          const res = await fetch("/api/annotations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId, pageNumber: currentPage, xPercent, yPercent, label: floorName }),
          });
          if (res.ok) {
            const data = await res.json();
            await fetch(`/api/annotations/${data.annotation.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ color: "#3b82f6" }),
            });
            data.annotation.color = "#3b82f6";
            data.annotation.label = floorName;
            setAnnotations((prev) => [...prev, data.annotation]);
          }
        } catch (err) {
          console.error("Kat pini oluşturma hatası:", err);
        }
      }
      return;
    }

    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, pageNumber: currentPage, xPercent, yPercent }),
      });

      if (res.ok) {
        const data = await res.json();
        setAnnotations((prev) => [...prev, data.annotation]);
        setSelectedPin(data.annotation);
        setPinDialogOpen(true);
      }
    } catch (err) {
      console.error("Pin oluşturma hatası:", err);
    }
  }, [documentId, currentPage, isUygulama, floorLabels, pageFloorUnits]);

  // Uygulama projesi: daire seçildikten sonra pin oluştur
  const createUnitPin = useCallback(async (unitName: string, unitId?: string) => {
    if (!unitPickerPos || !documentId || creatingPin.current) return;
    creatingPin.current = true;
    setUnitPickerPos(null);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          pageNumber: currentPage,
          xPercent: unitPickerPos.xPercent,
          yPercent: unitPickerPos.yPercent,
          label: unitName,
          unitId: unitId || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetch(`/api/annotations/${data.annotation.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: "#3b82f6" }),
        });
        data.annotation.color = "#3b82f6";
        data.annotation.label = unitName;
        setAnnotations((prev) => [...prev, data.annotation]);
      }
    } catch (err) {
      console.error("Daire pini oluşturma hatası:", err);
    } finally {
      creatingPin.current = false;
    }
  }, [unitPickerPos, documentId, currentPage]);

  // Mouse long-press
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !documentId) return;
    longPressFired.current = false;
    longPressStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };

    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      handleLongPressComplete(e.clientX, e.clientY);
      longPressStart.current = null;
    }, LONG_PRESS_MS);
  }, [documentId, handleLongPressComplete]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!longPressStart.current) return;
    const dx = e.clientX - longPressStart.current.x;
    const dy = e.clientY - longPressStart.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_THRESHOLD) {
      cancelLongPress();
    }
  }, [cancelLongPress]);

  const handleMouseUp = useCallback(() => {
    cancelLongPress();
  }, [cancelLongPress]);

  // Touch long-press
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !documentId) return;

    const handleTouchStartLP = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isPinching.current) return;
      const t = e.touches[0];
      longPressFired.current = false;
      longPressStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
      setLongPressIndicator({ x: t.clientX, y: t.clientY });

      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        handleLongPressComplete(t.clientX, t.clientY);
        longPressStart.current = null;
        setLongPressIndicator(null);
      }, LONG_PRESS_MS);
    };

    const handleTouchMoveLP = (e: TouchEvent) => {
      if (!longPressStart.current || e.touches.length !== 1) {
        cancelLongPress();
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - longPressStart.current.x;
      const dy = t.clientY - longPressStart.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_THRESHOLD) {
        cancelLongPress();
      }
    };

    const handleTouchEndLP = (e: TouchEvent) => {
      cancelLongPress();
      if (longPressFired.current) {
        e.preventDefault();
        longPressFired.current = false;
      }
    };

    container.addEventListener("touchstart", handleTouchStartLP, { passive: true });
    container.addEventListener("touchmove", handleTouchMoveLP, { passive: true });
    container.addEventListener("touchend", handleTouchEndLP, { passive: false });
    return () => {
      container.removeEventListener("touchstart", handleTouchStartLP);
      container.removeEventListener("touchmove", handleTouchMoveLP);
      container.removeEventListener("touchend", handleTouchEndLP);
    };
  }, [documentId, cancelLongPress, handleLongPressComplete]);

  /* =================== PIN ACTIONS =================== */

  const handlePinClick = useCallback((ann: Annotation, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedPin(ann);

    // Daire pini (uygulama veya inherited + label'lı) → open checklist popup
    if ((isUygulama || ann.inherited) && ann.label && checklistTemplates && checklistTemplates.length > 0) {
      setChecklistActiveParent(null);
      setChecklistActiveChild(null);
      setChecklistMedia({});
      setChecklistOpen(true);
      setChecklistMediaLoading(true);

      // Önce özel daire+kategori kırılımlarını kontrol et
      const loadTemplates = async () => {
        // unitId pin'den veya label eşleşmesinden bul
        let unitId = ann.unitId;
        if (!unitId && ann.label) {
          // Önce pageFloorUnits'den ara (sayfa bazlı)
          if (pageFloorUnits) {
            for (const units of Object.values(pageFloorUnits)) {
              const match = units.find(u => u.name === ann.label);
              if (match) { unitId = match.id; break; }
            }
          }
          // pageFloorUnits'de bulunamadıysa allBlockUnits'den ara
          if (!unitId && allBlockUnits) {
            const match = allBlockUnits.find(u => u.name === ann.label);
            if (match) { unitId = match.id; }
          }
        }
        if (siteId && unitId && activeCategoryId) {
          try {
            const r = await fetch(`/api/sites/${siteId}/checklist?unitId=${unitId}&categoryId=${activeCategoryId}`);
            if (r.ok) {
              const d = await r.json();
              if (d.templates && d.templates.length > 0) {
                setActiveChecklistTemplates(d.templates.map((t: { id: string; name: string; children?: { id: string; name: string }[] }) => ({
                  id: t.id, name: t.name, children: (t.children || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
                })));
              } else {
                setActiveChecklistTemplates(checklistTemplates);
              }
            } else {
              setActiveChecklistTemplates(checklistTemplates);
            }
          } catch {
            setActiveChecklistTemplates(checklistTemplates);
          }
        } else {
          setActiveChecklistTemplates(checklistTemplates);
        }
      };
      loadTemplates();

      // Fetch checklist media for this pin
      fetch(`/api/annotations/${ann.id}/checklist-media`)
        .then(r => r.json())
        .then(data => { setChecklistMedia(data.media || {}); })
        .catch(() => {})
        .finally(() => setChecklistMediaLoading(false));
      return;
    }

    if (ann.inherited && ann.media.length > 0) {
      // Kalıtılan pin: doğrudan medya görüntüle
      setViewingMedia(ann.media[0]);
    } else if (ann.inherited) {
      // Kalıtılan pin (medyasız): boyut popup
      setPinSizePopup(true);
    } else if (ann.media.length > 0) {
      setPinActionMenu(true);
    } else {
      setPinDialogOpen(true);
    }
  }, [checklistTemplates, isUygulama, siteId, activeCategoryId, pageFloorUnits, allBlockUnits]);

  const handleDeletePin = useCallback((pinId: string) => {
    setConfirmDelete({ pinId });
  }, []);

  const executeDeletePin = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/annotations/${confirmDelete.pinId}`, { method: "DELETE" });
      if (res.ok) {
        setAnnotations((prev) => prev.filter((a) => a.id !== confirmDelete.pinId));
        setPinDialogOpen(false);
        setSelectedPin(null);
      }
    } catch (err) {
      console.error("Pin silme hatası:", err);
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete]);

  // Daire pini taşıma: sürükleme başlat
  const startMovePin = useCallback((pin: Annotation) => {
    setChecklistOpen(false);
    setChecklistActiveParent(null);
    setChecklistActiveChild(null);
    setSelectedPin(null);
    setMovingPin(pin);
    setMoveNotification(`"${pin.label}" dairesinin yerini değiştirmek için dairenin üzerine basılı tutup yerleştirmek istediğiniz yere sürükleyin.`);
  }, []);

  // Daire pini sürükleme: mouse/touch down
  const handleMovePinDown = useCallback((pin: Annotation, e: React.MouseEvent | React.TouchEvent) => {
    if (!movingPin || movingPin.id !== pin.id) return;
    e.stopPropagation();
    e.preventDefault();
    isDraggingPin.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartPos.current = { x: clientX, y: clientY };
  }, [movingPin]);

  // Daire pini sürükleme: mouse/touch move
  useEffect(() => {
    if (!movingPin) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const pinEl = document.getElementById(`move-pin-${movingPin.id}`);

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingPin.current || !pinEl) return;
      e.preventDefault();
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const canvasRect = canvas.getBoundingClientRect();
      const xPct = Math.max(0, Math.min(1, (clientX - canvasRect.left) / canvasRect.width));
      const yPct = Math.max(0, Math.min(1, (clientY - canvasRect.top) / canvasRect.height));

      pinEl.style.left = `${xPct * 100}%`;
      pinEl.style.top = `${yPct * 100}%`;
    };

    const handleUp = async (e: MouseEvent | TouchEvent) => {
      if (!isDraggingPin.current) return;
      isDraggingPin.current = false;

      const clientX = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;

      const canvasRect = canvas.getBoundingClientRect();
      const xPct = Math.max(0, Math.min(1, (clientX - canvasRect.left) / canvasRect.width));
      const yPct = Math.max(0, Math.min(1, (clientY - canvasRect.top) / canvasRect.height));

      // Kaydediliyor bildirimi
      const pinLabel = movingPin.label || 'Daire';
      setMoveNotification(`"${pinLabel}" yer değişikliği kaydediliyor...`);
      if (moveNotifTimer.current) clearTimeout(moveNotifTimer.current);

      try {
        const res = await fetch(`/api/annotations/${movingPin.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ xPercent: xPct, yPercent: yPct }),
        });
        if (res.ok) {
          setAnnotations(prev => prev.map(a => a.id === movingPin.id ? { ...a, xPercent: xPct, yPercent: yPct } : a));
          setMovingPin(null);
          setMoveNotification('Yer değişikliği başarılı!');
          moveNotifTimer.current = setTimeout(() => {
            setMoveNotification(null);
          }, 3000);
        } else {
          setMoveNotification('Yer değişikliği sırasında hata oluştu.');
          moveNotifTimer.current = setTimeout(() => {
            setMoveNotification(null);
            setMovingPin(null);
          }, 3000);
        }
      } catch {
        setMoveNotification('Yer değişikliği sırasında hata oluştu.');
        moveNotifTimer.current = setTimeout(() => {
          setMoveNotification(null);
          setMovingPin(null);
        }, 3000);
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [movingPin]);

  // Checklist daire silme
  const executeChecklistDeletePin = useCallback(async () => {
    if (!selectedPin) return;
    try {
      const res = await fetch(`/api/annotations/${selectedPin.id}`, { method: 'DELETE' });
      if (res.ok) {
        setAnnotations(prev => prev.filter(a => a.id !== selectedPin.id));
        setChecklistOpen(false);
        setChecklistDeleteConfirm(false);
        setSelectedPin(null);
      }
    } catch {
      console.error('Daire silme hatası');
    }
  }, [selectedPin]);

  const handlePinUpdate = useCallback(async (pinId: string, field: "label" | "color", value: string) => {
    try {
      const res = await fetch(`/api/annotations/${pinId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        setAnnotations((prev) =>
          prev.map((a) => a.id === pinId ? { ...a, [field]: value } : a)
        );
        setSelectedPin((prev) =>
          prev && prev.id === pinId ? { ...prev, [field]: value } : prev
        );
      }
    } catch (err) {
      console.error("Pin güncelleme hatası:", err);
    }
  }, []);

  const handleMediaMetaUpdate = useCallback(async (mediaId: string, field: "title" | "description", value: string) => {
    try {
      const res = await fetch(`/api/annotations/media/${mediaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updateMedia = (media: MediaItem[]) =>
          media.map((m) => m.id === mediaId ? { ...m, [field]: value } : m);
        setAnnotations((prev) =>
          prev.map((a) => ({ ...a, media: updateMedia(a.media) }))
        );
        setSelectedPin((prev) =>
          prev ? { ...prev, media: updateMedia(prev.media) } : prev
        );
      }
    } catch (err) {
      console.error("Medya güncelleme hatası:", err);
    }
  }, []);

  const handleMediaUpload = useCallback(async (files: FileList) => {
    if (!selectedPin) return;
    setMediaUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      const res = await fetch(`/api/annotations/${selectedPin.id}`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === selectedPin.id
              ? { ...a, media: [...(data.uploaded || []), ...a.media] }
              : a
          )
        );
        setSelectedPin((prev) =>
          prev ? { ...prev, media: [...(data.uploaded || []), ...prev.media] } : prev
        );
      }
    } catch (err) {
      console.error("Medya yükleme hatası:", err);
    } finally {
      setMediaUploading(false);
    }
  }, [selectedPin]);

  /* =================== PC CAMERA (getUserMedia) =================== */

  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const openLiveCamera = useCallback(async (mode: "photo" | "video") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === "video",
      });
      mediaStreamRef.current = stream;
      setCameraOpen(mode);
      setTimeout(() => {
        if (liveCameraRef.current) {
          liveCameraRef.current.srcObject = stream;
          liveCameraRef.current.play();
        }
      }, 100);
    } catch (err) {
      console.error("Kamera a\u00e7\u0131lamad\u0131:", err);
      alert("Kamera eri\u015fimi sa\u011flanamad\u0131. L\u00fctfen taray\u0131c\u0131 ayarlar\u0131ndan kamera iznini kontrol edin.");
    }
  }, []);

  const stopLiveCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setCameraOpen(null);
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = liveCameraRef.current;
    if (!video) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d")?.drawImage(video, 0, 0);
    c.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
      const dt = new DataTransfer();
      dt.items.add(file);
      stopLiveCamera();
      handleMediaUpload(dt.files);
    }, "image/jpeg", 0.92);
  }, [stopLiveCamera, handleMediaUpload]);

  const startVideoRecording = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    recordedChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
    mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const file = new File([blob], `video_${Date.now()}.webm`, { type: "video/webm" });
      const dt = new DataTransfer();
      dt.items.add(file);
      stopLiveCamera();
      handleMediaUpload(dt.files);
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  }, [stopLiveCamera, handleMediaUpload]);

  const stopVideoRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleDeleteMedia = useCallback(async (mediaId: string) => {
    try {
      const res = await fetch(`/api/annotations/media/${mediaId}`, { method: "DELETE" });
      if (res.ok) {
        setAnnotations((prev) =>
          prev.map((a) => ({ ...a, media: a.media.filter((m) => m.id !== mediaId) }))
        );
        setSelectedPin((prev) =>
          prev ? { ...prev, media: prev.media.filter((m) => m.id !== mediaId) } : prev
        );
      }
    } catch (err) {
      console.error("Medya silme hatası:", err);
    }
  }, []);

  /* =================== CHECKLIST MEDIA HANDLERS =================== */

  const handleChecklistMediaUpload = useCallback(async (files: FileList, checklistItemId: string) => {
    if (!selectedPin || !checklistItemId) return;
    setChecklistUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append("file", files[i]);
        formData.append("checklistItemId", checklistItemId);
        const res = await fetch(`/api/annotations/${selectedPin.id}/checklist-media`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setChecklistMedia((prev) => ({
            ...prev,
            [checklistItemId]: [data.media, ...(prev[checklistItemId] || [])],
          }));
        }
      }
    } catch (err) {
      console.error("Checklist media upload error:", err);
    } finally {
      setChecklistUploading(false);
    }
  }, [selectedPin]);

  const handleDeleteChecklistMedia = useCallback(async (mediaId: string, checklistItemId: string) => {
    try {
      const res = await fetch(`/api/checklist-media/${mediaId}`, { method: "DELETE" });
      if (res.ok) {
        setChecklistMedia((prev) => ({
          ...prev,
          [checklistItemId]: (prev[checklistItemId] || []).filter((m) => m.id !== mediaId),
        }));
      }
    } catch (err) {
      console.error("Checklist media delete error:", err);
    }
  }, []);

  /* =================== KEYBOARD =================== */

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (pinDialogOpen || viewingMedia || pinSizePopup) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentPage > 1) setCurrentPage((p) => p - 1);
      if (e.key === "ArrowRight" && currentPage < totalPages) setCurrentPage((p) => p + 1);
      if (e.key === "+" || e.key === "=") setZoom((z) => clampZoom(z + zoomStep, maxZoom));
      if (e.key === "-") setZoom((z) => clampZoom(z - zoomStep, maxZoom));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentPage, totalPages, onClose, pinDialogOpen, viewingMedia, pinSizePopup]);

  /* =================== CURRENT PAGE PINS =================== */

  const currentPagePins = annotations.filter((a) => a.pageNumber === currentPage);

  // İndir: native (telefona kaydet) veya web (blob)
  const handleDownload = useCallback(async (url: string, name: string) => {
    try {
      const msg = await downloadFile(url, name);
      if (msg) alert(msg);
    } catch {
      alert("İndirilemedi");
    }
  }, []);

  /* =================== RENDER =================== */

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      {/* Üst Bar (telefon status bar'ı ile çakışmasın) */}
      <div className="modal-safe-top bg-[#1a1a2e] text-white px-3 py-2 flex items-center justify-between flex-shrink-0 gap-2">
        <span className="font-medium truncate text-sm flex-1 min-w-0">{fileName}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setZoom((z) => clampZoom(z - zoomStep, maxZoom))} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
            <ZoomOut size={18} />
          </button>
          <span className="text-xs min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => clampZoom(z + zoomStep, maxZoom))} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
            <ZoomIn size={18} />
          </button>
          <button onClick={() => setZoom(1.0)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all" title="Sıfırla">
            <RotateCcw size={16} />
          </button>
          <button onClick={() => handleDownload(originalDownloadUrl || fileUrl, fileName)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all" title="İndir">
            <Download size={18} />
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Pin bilgi çubuğu */}
      {documentId && (
        <div className="bg-[#2a2a4e] text-white/70 px-3 py-1 text-xs text-center flex-shrink-0">
          {isUygulama ? <Home size={12} className="inline mr-1" /> : <MapPin size={12} className="inline mr-1" />}
          {isUygulama ? "Basılı tutarak daire noktası ekleyin" : "Basılı tutarak pin ekleyin"} &bull; {currentPagePins.length} pin
        </div>
      )}

      {/* PDF İçerik */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onSelect={(e) => e.preventDefault()}
      >
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent mx-auto mb-3"></div>
              <p>PDF yükleniyor...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white">
              <p className="text-red-400 mb-4">{error}</p>
              <button onClick={() => handleDownload(fileUrl, fileName)} className="inline-flex items-center gap-2 px-6 py-3 bg-[#c0392b] text-white rounded-lg hover:bg-[#922b21]">
                <Download size={18} /> Dosyayı İndir
              </button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="p-4" style={{ width: "fit-content", minWidth: "100%" }}>
            <div ref={wrapperRef} style={{ position: "relative", width: "fit-content", margin: "0 auto" }}>
              <canvas ref={canvasRef} className="shadow-lg block" style={{ backgroundColor: 'white' }} />
              {isDwg && <canvas ref={hdCanvasRef} style={{ position: 'absolute', top: 0, left: 0, display: 'none', pointerEvents: 'none' }} />}

              {/* Kat Etiketi Overlay */}
              {floorLabels?.[currentPage] && (
                <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 20, pointerEvents: "none" }}>
                  <div className="bg-[#1e3a5f] text-white text-sm font-semibold px-4 py-1.5 rounded-lg shadow-lg" style={{ opacity: 0.9 }}>
                    {floorLabels[currentPage]}
                  </div>
                </div>
              )}

              {/* Pin Overlay */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                {(() => {
                  // Zoom-responsive scale: pins shrink gently after 2x zoom
                  const pinScale = zoom <= 2 ? 1 : Math.max(0.6, 1 / Math.pow(zoom / 2, 0.3));
                  return currentPagePins.map((pin) => (
                  (isUygulama || pin.inherited) && pin.label ? (
                    /* Daire pini: Dikdörtgen görünüm */
                    <button
                      key={pin.id}
                      id={movingPin?.id === pin.id ? `move-pin-${pin.id}` : undefined}
                      onClick={(e) => { if (movingPin) return; handlePinClick(pin, e); }}
                      onMouseDown={(e) => movingPin?.id === pin.id && handleMovePinDown(pin, e)}
                      onTouchStart={(e) => movingPin?.id === pin.id && handleMovePinDown(pin, e)}
                      style={{
                        position: "absolute",
                        left: `${pin.xPercent * 100}%`,
                        top: `${pin.yPercent * 100}%`,
                        transform: `translate(-50%, -50%) scale(${pinScale})`,
                        pointerEvents: "auto",
                        zIndex: movingPin?.id === pin.id ? 50 : 10,
                        cursor: movingPin?.id === pin.id ? 'grab' : 'pointer',
                      }}
                      title={pin.label}
                    >
                      <div
                        className={`flex items-center justify-center rounded-md shadow-md border-2 hover:scale-105 transition-transform ${movingPin?.id === pin.id ? 'animate-pulse ring-2 ring-blue-400' : ''}`}
                        style={{
                          backgroundColor: `${pin.color || '#3b82f6'}30`,
                          borderColor: pin.color || '#3b82f6',
                          minWidth: pin.pinSize === 'small' ? 40 : pin.pinSize === 'medium' ? 55 : 70,
                          minHeight: pin.pinSize === 'small' ? 22 : pin.pinSize === 'medium' ? 28 : 36,
                          padding: pin.pinSize === 'small' ? '2px 5px' : pin.pinSize === 'medium' ? '3px 7px' : '4px 10px',
                        }}
                      >
                        <Home size={pin.pinSize === 'small' ? 10 : pin.pinSize === 'medium' ? 12 : 14} style={{ color: pin.color || '#3b82f6', marginRight: pin.pinSize === 'small' ? 2 : 4, flexShrink: 0 }} />
                        <span className={`font-bold whitespace-nowrap ${pin.pinSize === 'small' ? 'text-[8px]' : pin.pinSize === 'medium' ? 'text-[9px]' : 'text-[11px]'}`} style={{ color: pin.color || '#3b82f6' }}>
                          {pin.label}
                        </span>
                      </div>
                    </button>
                  ) : (
                    /* Normal Pin */
                    <button
                      key={pin.id}
                      onClick={(e) => handlePinClick(pin, e)}
                      style={{
                        position: "absolute",
                        left: `${pin.xPercent * 100}%`,
                        top: `${pin.yPercent * 100}%`,
                        transform: `translate(-50%, -100%) scale(${pinScale})`,
                        pointerEvents: "auto",
                        zIndex: 10,
                        opacity: pin.inherited ? 0.6 : 1,
                      }}
                      className="group"
                      title={pin.inherited ? `[Orijinal] ${pin.label || 'Pin'}` : (pin.label || `Pin (${pin.media.length} medya)`)}
                    >
                      <div className="relative flex flex-col items-center">
                        <MapPin
                          size={pin.pinSize === 'small' ? 16 : pin.pinSize === 'medium' ? 24 : 32}
                          style={{ color: pin.color || '#ef4444', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                          fill={`${pin.color || '#ef4444'}30`}
                          strokeWidth={2.5}
                        />
                        {pin.media.length > 0 && (
                          <span className={`absolute bg-blue-500 text-white font-bold rounded-full flex items-center justify-center px-0.5 ${pin.pinSize === 'small' ? '-top-0.5 -right-1 text-[7px] min-w-[12px] h-[12px]' : pin.pinSize === 'medium' ? '-top-0.5 -right-1.5 text-[8px] min-w-[14px] h-[14px]' : '-top-1 -right-2 text-[10px] min-w-[16px] h-[16px]'}`}>
                            {pin.media.length}
                          </span>
                        )}
                        {pin.label && (
                          <span className="absolute top-[100%] left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm" style={{ backgroundColor: pin.color || '#ef4444', color: 'white' }}>
                            {pin.label}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                ));})()}
              </div>
            </div>
          </div>
        )}

        {/* Long press göstergesi */}
        {longPressIndicator && (
          <div
            className="fixed pointer-events-none z-[60]"
            style={{ left: longPressIndicator.x - 20, top: longPressIndicator.y - 20 }}
          >
            <div className="w-10 h-10 rounded-full border-2 border-red-400 animate-ping opacity-50" />
          </div>
        )}
      </div>

      {/* Alt Bar - Sayfa Navigasyonu */}
      {totalPages > 1 && (
        <div className="bg-[#1a1a2e] text-white px-4 py-2 flex items-center justify-center gap-4 flex-shrink-0">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-all disabled:opacity-30"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm">{currentPage} / {totalPages}</span>
          {floorLabels?.[currentPage] && (
            <span className="bg-white/20 text-white text-xs font-medium px-2 py-0.5 rounded">
              {floorLabels[currentPage]}
            </span>
          )}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-all disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* =================== DAİRE SEÇİCİ (Uygulama Projesi) =================== */}
      {unitPickerPos && isUygulama && (() => {
        const usedLabels = new Set(currentPagePins.filter((p) => p.label).map((p) => p.label));
        return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setUnitPickerPos(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-sm overflow-hidden" style={{ border: '5px solid #1e3a5f' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-3 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <Home size={28} className="text-[#1e3a5f]" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Daire Seçin</h3>
              <p className="text-sm text-gray-500">
                <span className="font-medium text-[#1e3a5f]">{floorLabels?.[currentPage]}</span> — bu noktaya hangi daireyi atamak istersiniz?
              </p>
            </div>
            {pageFloorUnits?.[currentPage]?.length ? (
              <div className="px-6 pb-6 grid grid-cols-2 gap-2">
                {pageFloorUnits[currentPage].map((unit) => {
                  const alreadyUsed = usedLabels.has(unit.name);
                  return (
                    <button
                      key={unit.id}
                      onClick={() => !alreadyUsed && createUnitPin(unit.name, unit.id)}
                      disabled={alreadyUsed}
                      className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl transition-all font-medium text-sm border ${
                        alreadyUsed
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-gray-50 hover:bg-[#1e3a5f] hover:text-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                      }`}
                    >
                      <Home size={16} />
                      {unit.name}
                      {alreadyUsed && <span className="text-[10px] text-orange-500 ml-0.5">✓</span>}
                    </button>
                  );
                })}
                {pageFloorUnits[currentPage].every((u) => usedLabels.has(u.name)) && (
                  <div className="col-span-2 text-center text-xs text-orange-600 bg-orange-50 rounded-lg py-2 mt-1">
                    Bu sayfadaki tüm daireler zaten eklenmiş
                  </div>
                )}
              </div>
            ) : (
              <div className="px-6 pb-6 text-center text-sm text-gray-400">
                Bu katta daire bulunamadı
              </div>
            )}
            <div className="px-6 pb-6 flex justify-center">
              <button onClick={() => setUnitPickerPos(null)} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">İptal</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* =================== KAT ATAMASI UYARISI =================== */}
      {noFloorWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setNoFloorWarning(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-sm overflow-hidden" style={{ border: '5px solid #1e3a5f' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mb-4">
                <Layers size={28} className="text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Kat Ataması Yapılmamış</h3>
              <p className="text-sm text-gray-500">Bu sayfa henüz bir kata atanmamış. Daire pini ekleyebilmek için önce PDF sayfasını bir kata atamalısınız.</p>
              <p className="text-xs text-gray-400 mt-2">Sayfaya kat ataması yapmak için belge listesindeki <span className="inline-flex items-center"><Layers size={12} className="text-[#1e3a5f] mx-0.5" /></span> simgesini kullanın.</p>
            </div>
            <div className="px-6 pb-6 flex justify-center">
              <button onClick={() => setNoFloorWarning(false)} className="px-6 py-2.5 bg-[#1e3a5f] hover:bg-[#152d4a] text-white rounded-lg text-sm font-medium transition-colors">Tamam</button>
            </div>
          </div>
        </div>
      )}

      {/* =================== PIN EYLEM MENÜSÜ =================== */}
      {pinActionMenu && selectedPin && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => { setPinActionMenu(false); setSelectedPin(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-sm overflow-hidden" style={{ border: '5px solid #1e3a5f' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <MapPin size={28} style={{ color: selectedPin.color || '#ef4444' }} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{selectedPin.label || 'Pin Noktası'}</h3>
              <p className="text-sm text-gray-500">{selectedPin.media.length} medya mevcut</p>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6">
              <button
                onClick={() => {
                  setPinActionMenu(false);
                  setViewingMedia(selectedPin.media[0]);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#162d4a] transition-all font-medium text-sm"
              >
                <Eye size={18} />
                Medya Görüntüle
              </button>
              {!selectedPin.inherited && (
                <button
                  onClick={() => {
                    setPinActionMenu(false);
                    setPinDialogOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#c0392b] text-white rounded-xl hover:bg-[#922b21] transition-all font-medium text-sm"
                >
                  <Upload size={18} />
                  Medya Yükle &amp; Ayarlar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================== PIN BOYUT POPUP (Normal kopyalanan pinler) =================== */}
      {pinSizePopup && selectedPin && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => { setPinSizePopup(false); setSelectedPin(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-xs overflow-hidden" style={{ border: '5px solid #1e3a5f' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <MapPin size={24} style={{ color: selectedPin.color || '#ef4444' }} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Pin Boyutu</h3>
              <div className="flex items-center justify-center gap-3">
                {([['small', 'K'], ['medium', 'O'], ['large', 'B']] as const).map(([size, label]) => (
                  <button
                    key={size}
                    onClick={async () => {
                      if (!selectedPin) return;
                      try {
                        const res = await fetch(`/api/annotations/${selectedPin.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ pinSize: size }),
                        });
                        if (res.ok) {
                          setAnnotations(prev => prev.map(a => a.id === selectedPin.id ? { ...a, pinSize: size } : a));
                          setSelectedPin(prev => prev ? { ...prev, pinSize: size } : prev);
                        }
                      } catch {}
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border-2 transition-all p-2 ${
                      (selectedPin?.pinSize || 'large') === size
                        ? 'border-[#1e3a5f] bg-[#1e3a5f]/10'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={{ width: 60, height: 50 }}
                  >
                    <MapPin size={size === 'small' ? 14 : size === 'medium' ? 18 : 24} style={{ color: (selectedPin?.pinSize || 'large') === size ? '#1e3a5f' : '#9ca3af' }} />
                    <span className={`text-[10px] font-bold mt-0.5 ${(selectedPin?.pinSize || 'large') === size ? 'text-[#1e3a5f]' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {selectedPin.media.length > 0 && (
              <div className="px-6 pb-4">
                <button
                  onClick={() => {
                    setPinSizePopup(false);
                    setViewingMedia(selectedPin.media[0]);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#162d4a] transition-all font-medium text-sm"
                >
                  <Eye size={16} />
                  Medya Görüntüle ({selectedPin.media.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== PIN DIALOG =================== */}
      {pinDialogOpen && selectedPin && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50" onClick={() => { setPinDialogOpen(false); setSelectedPin(null); }}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog Başlık */}
            <div className="px-4 py-3 border-b bg-gray-50 rounded-t-2xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <MapPin size={20} style={{ color: selectedPin.color || '#ef4444', flexShrink: 0 }} />
                  {selectedPin.inherited ? (
                    <span className="font-semibold text-gray-800 text-sm py-0.5">{selectedPin.label || 'Pin Noktası'} <span className="text-[10px] text-gray-400">(Orijinal)</span></span>
                  ) : (
                    <input
                      type="text"
                      defaultValue={selectedPin.label || ''}
                      placeholder="Pin Noktası"
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (selectedPin.label || '')) handlePinUpdate(selectedPin.id, 'label', val);
                      }}
                      className="font-semibold text-gray-800 text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#1e3a5f] focus:outline-none py-0.5 w-full min-w-0"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!selectedPin.inherited && (
                    <button
                      onClick={() => handleDeletePin(selectedPin.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-all"
                      title="Pin Sil"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => { setPinDialogOpen(false); setSelectedPin(null); }}
                    className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-500 flex-shrink-0">
                  {selectedPin.creator.firstName} {selectedPin.creator.lastName} &bull; Sayfa {selectedPin.pageNumber}
                </p>
                {!selectedPin.inherited && (
                  <div className="flex items-center gap-1 ml-auto">
                    {PIN_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => handlePinUpdate(selectedPin.id, 'color', c.value)}
                        className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c.value,
                          borderColor: selectedPin.color === c.value || (!selectedPin.color && c.value === '#ef4444') ? '#1e3a5f' : 'transparent',
                          transform: selectedPin.color === c.value || (!selectedPin.color && c.value === '#ef4444') ? 'scale(1.15)' : undefined,
                        }}
                        title={c.name}
                      />
                    ))}
                  </div>
                )}
              </div>
              {/* Pin Boyut Seçici */}
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[10px] text-gray-400 mr-0.5">Boyut</span>
                {([['small', 'K'], ['medium', 'O'], ['large', 'B']] as const).map(([size, label]) => (
                  <button
                    key={size}
                    onClick={async () => {
                      if (!selectedPin) return;
                      try {
                        const res = await fetch(`/api/annotations/${selectedPin.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ pinSize: size }),
                        });
                        if (res.ok) {
                          setAnnotations(prev => prev.map(a => a.id === selectedPin.id ? { ...a, pinSize: size } : a));
                          setSelectedPin(prev => prev ? { ...prev, pinSize: size } : prev);
                        }
                      } catch {}
                    }}
                    className={`flex items-center justify-center rounded-md border transition-all ${
                      (selectedPin?.pinSize || 'large') === size
                        ? 'border-[#1e3a5f] bg-[#1e3a5f]/10'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={{
                      width: size === 'small' ? 26 : size === 'medium' ? 30 : 34,
                      height: 20,
                    }}
                  >
                    <MapPin size={size === 'small' ? 8 : size === 'medium' ? 10 : 12} className={`${(selectedPin?.pinSize || 'large') === size ? 'text-[#1e3a5f]' : 'text-gray-400'} mr-0.5`} />
                    <span className={`font-bold ${size === 'small' ? 'text-[6px]' : size === 'medium' ? 'text-[7px]' : 'text-[8px]'} ${(selectedPin?.pinSize || 'large') === size ? 'text-[#1e3a5f]' : 'text-gray-400'}`}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Medya Listesi */}
            <div className="flex-1 overflow-auto p-4">
              {selectedPin.media.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ImageIcon size={48} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Henüz medya eklenmedi</p>
                  <p className="text-xs">Fotoğraf veya video yükleyin</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {selectedPin.media.map((m) => (
                    <div key={m.id} className="rounded-lg overflow-hidden bg-gray-50 border">
                      <div className="relative group">
                        {m.mimeType.startsWith("video/") ? (
                          <div
                            className="aspect-square flex items-center justify-center cursor-pointer bg-gray-900"
                            onClick={() => setViewingMedia(m)}
                          >
                            <div className="text-center text-white">
                              <Play size={24} className="mx-auto" />
                            </div>
                          </div>
                        ) : (
                          <img
                            src={m.fileUrl}
                            alt={m.fileName}
                            className="w-full aspect-square object-cover cursor-pointer"
                            onClick={() => setViewingMedia(m)}
                          />
                        )}
                        {!selectedPin.inherited && (
                          <button
                            onClick={() => handleDeleteMedia(m.id)}
                            className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="p-1.5 space-y-1">
                        {selectedPin.inherited ? (
                          <>
                            {m.title && <p className="text-[10px] text-gray-700 truncate">{m.title}</p>}
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              placeholder="Başlık"
                              defaultValue={m.title || ""}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val !== (m.title || "")) handleMediaMetaUpdate(m.id, "title", val);
                              }}
                              className="w-full px-1.5 py-1 text-[10px] border border-gray-200 rounded focus:outline-none focus:border-[#c0392b] bg-white"
                            />
                            <input
                              type="text"
                              placeholder="Açıklama"
                              defaultValue={m.description || ""}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val !== (m.description || "")) handleMediaMetaUpdate(m.id, "description", val);
                              }}
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#c0392b] bg-white"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Yükleme Butonları - Kalıtılan pinlerde gizle */}
            {!selectedPin.inherited && (
            <div className="px-4 py-3 border-t bg-gray-50">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleMediaUpload(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <input
                ref={cameraPhotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleMediaUpload(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <input
                ref={cameraVideoRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleMediaUpload(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => isMobile ? cameraPhotoRef.current?.click() : openLiveCamera("photo")}
                  disabled={mediaUploading}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#2980b9] text-white rounded-xl hover:bg-[#2471a3] transition-all disabled:opacity-50 font-medium text-sm"
                >
                  <Camera size={16} />
                  Fotoğraf Çek
                </button>
                <button
                  onClick={() => isMobile ? cameraVideoRef.current?.click() : openLiveCamera("video")}
                  disabled={mediaUploading}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#8e44ad] text-white rounded-xl hover:bg-[#7d3c98] transition-all disabled:opacity-50 font-medium text-sm"
                >
                  <Video size={16} />
                  Video Çek
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={mediaUploading}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#c0392b] text-white rounded-xl hover:bg-[#922b21] transition-all disabled:opacity-50 font-medium text-sm"
                >
                  <Upload size={16} />
                  Galeriden Seç
                </button>
              </div>
              {mediaUploading && (
                <div className="flex items-center justify-center gap-2 mt-2 text-gray-500 text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                  Yükleniyor...
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      )}

      {/* =================== PC KAMERA OVERLAY =================== */}
      {cameraOpen && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-black/80 flex-shrink-0">
            <span className="text-white text-sm font-medium">
              {cameraOpen === "photo" ? "Fotoğraf Çek" : isRecording ? "Kayıt yapılıyor..." : "Video Çek"}
            </span>
            <button onClick={stopLiveCamera} className="text-white p-1.5 hover:bg-white/10 rounded-lg">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <video
              ref={liveCameraRef}
              autoPlay
              playsInline
              muted={cameraOpen === "photo"}
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div className="flex items-center justify-center py-6 bg-black/80">
            {cameraOpen === "photo" ? (
              <button
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-all active:scale-90"
                title="Fotoğraf Çek"
              />
            ) : !isRecording ? (
              <button
                onClick={startVideoRecording}
                className="w-16 h-16 rounded-full border-4 border-white bg-red-500 hover:bg-red-600 transition-all active:scale-90"
                title="Kaydı Başlat"
              />
            ) : (
              <button
                onClick={stopVideoRecording}
                className="w-16 h-16 rounded-full border-4 border-white bg-red-500 hover:bg-red-600 transition-all flex items-center justify-center active:scale-90"
                title="Kaydı Durdur"
              >
                <div className="w-6 h-6 bg-white rounded-sm" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* =================== PIN SİLME ONAY MODALI =================== */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ border: '5px solid #1e3a5f' }}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Pin Silinecek</h3>
              <p className="text-sm text-gray-500">Bu pin ve tüm medyaları kalıcı olarak silinecek.<br/>Bu işlem geri alınamaz.</p>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={executeDeletePin}
                className="flex-1 py-3.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================== MEDYA GÖRÜNTÜLEYICI =================== */}
      {viewingMedia && selectedPin && (() => {
        const mediaList = selectedPin.media;
        const currentIndex = mediaList.findIndex((m) => m.id === viewingMedia.id);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < mediaList.length - 1;
        const goTo = (idx: number) => { if (idx >= 0 && idx < mediaList.length) setViewingMedia(mediaList[idx]); };
        return (
        <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col" onClick={() => setViewingMedia(null)}>
          <div className="flex items-center justify-between px-4 py-2 bg-black/50 flex-shrink-0">
            <span className="text-white text-sm truncate">
              {viewingMedia.title || viewingMedia.fileName}
              {mediaList.length > 1 && <span className="ml-2 opacity-60">({currentIndex + 1}/{mediaList.length})</span>}
            </span>
            <button onClick={() => setViewingMedia(null)} className="text-white p-1.5 hover:bg-white/10 rounded-lg">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto relative" onClick={(e) => e.stopPropagation()}>
            {hasPrev && (
              <button
                onClick={(e) => { e.stopPropagation(); goTo(currentIndex - 1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full transition-all"
              >
                <ChevronLeft size={28} />
              </button>
            )}
            {viewingMedia.mimeType.startsWith("video/") ? (
              <video
                key={viewingMedia.id}
                src={viewingMedia.fileUrl}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-lg"
                playsInline
              />
            ) : (
              <img
                src={viewingMedia.fileUrl}
                alt={viewingMedia.fileName}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            )}
            {hasNext && (
              <button
                onClick={(e) => { e.stopPropagation(); goTo(currentIndex + 1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full transition-all"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>
          {(viewingMedia.title || viewingMedia.description) && (
            <div className="px-4 py-2 bg-black/50 text-white text-center flex-shrink-0">
              {viewingMedia.title && <p className="font-medium text-sm">{viewingMedia.title}</p>}
              {viewingMedia.description && <p className="text-xs opacity-70 mt-0.5">{viewingMedia.description}</p>}
            </div>
          )}
        </div>
        );
      })()}

      {/* =================== CHECKLIST POPUP =================== */}
      {checklistOpen && selectedPin && activeChecklistTemplates.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50" style={{ backdropFilter: 'blur(4px)' }} onClick={() => { setChecklistOpen(false); setSelectedPin(null); setChecklistActiveParent(null); setChecklistActiveChild(null); setViewingChecklistMedia(null); }}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
            style={{ border: '5px solid #1e3a5f' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Başlık */}
            <div className="px-4 py-3 border-b bg-gray-50 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {checklistActiveChild ? (
                    <button onClick={() => setChecklistActiveChild(null)} className="p-1 hover:bg-gray-200 rounded-lg transition-all flex-shrink-0">
                      <ArrowLeft size={18} className="text-gray-600" />
                    </button>
                  ) : checklistActiveParent ? (
                    <button onClick={() => setChecklistActiveParent(null)} className="p-1 hover:bg-gray-200 rounded-lg transition-all flex-shrink-0">
                      <ArrowLeft size={18} className="text-gray-600" />
                    </button>
                  ) : (
                    <Home size={18} className="text-[#3b82f6] flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 text-sm truncate">
                      {checklistActiveChild ? checklistActiveChild.name :
                       checklistActiveParent ? checklistActiveParent.name :
                       (selectedPin.label || 'Daire')}
                    </h3>
                    {!checklistActiveChild && !checklistActiveParent && (
                      <p className="text-[10px] text-gray-400">Kontrol maddelerini seçin</p>
                    )}
                    {checklistActiveParent && !checklistActiveChild && (
                      <p className="text-[10px] text-gray-400">Alt madde seçin veya medya yükleyin</p>
                    )}
                    {checklistActiveChild && (
                      <p className="text-[10px] text-gray-400">Fotoğraf ve video yükleyin</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setChecklistOpen(false); setSelectedPin(null); setChecklistActiveParent(null); setChecklistActiveChild(null); setViewingChecklistMedia(null); }}
                  className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-all flex-shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* İkon Boyutu + Sil/Taşı - sadece ana ekranda ve orijinal pinlerde göster */}
            {!checklistActiveParent && !checklistActiveChild && !selectedPin?.inherited && (
              <div className="px-4 py-2 border-b bg-gray-50/50 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400 mr-1">Boyut</span>
                  {([['small', 'K'], ['medium', 'O'], ['large', 'B']] as const).map(([size, label]) => (
                    <button
                      key={size}
                      onClick={async () => {
                        if (!selectedPin) return;
                        try {
                          const res = await fetch(`/api/annotations/${selectedPin.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pinSize: size }),
                          });
                          if (res.ok) {
                            setAnnotations(prev => prev.map(a => a.id === selectedPin.id ? { ...a, pinSize: size } : a));
                            setSelectedPin(prev => prev ? { ...prev, pinSize: size } : prev);
                          }
                        } catch {}
                      }}
                      className={`flex items-center justify-center rounded-md border transition-all ${
                        (selectedPin?.pinSize || 'large') === size
                          ? 'border-[#1e3a5f] bg-[#1e3a5f]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={{
                        width: size === 'small' ? 28 : size === 'medium' ? 32 : 36,
                        height: size === 'small' ? 18 : size === 'medium' ? 20 : 22,
                      }}
                    >
                      <Home size={size === 'small' ? 7 : size === 'medium' ? 8 : 9} className={`${(selectedPin?.pinSize || 'large') === size ? 'text-[#1e3a5f]' : 'text-gray-400'} mr-0.5`} />
                      <span className={`font-bold ${size === 'small' ? 'text-[6px]' : size === 'medium' ? 'text-[7px]' : 'text-[8px]'} ${(selectedPin?.pinSize || 'large') === size ? 'text-[#1e3a5f]' : 'text-gray-400'}`}>{label}</span>
                    </button>
                  ))}
                </div>
                {!selectedPin?.inherited && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startMovePin(selectedPin!)}
                      className="p-1.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
                      title="Yer Değiştir"
                    >
                      <Move size={14} className="text-gray-500 hover:text-blue-600" />
                    </button>
                    <button
                      onClick={() => setChecklistDeleteConfirm(true)}
                      className="p-1.5 rounded-lg border border-gray-200 hover:border-red-400 hover:bg-red-50 transition-all"
                      title="Sil"
                    >
                      <Trash2 size={14} className="text-gray-500 hover:text-red-600" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* İçerik */}
            <div className="flex-1 overflow-auto p-4">
              {checklistMediaLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#1e3a5f] border-t-transparent"></div>
                </div>
              ) : !checklistActiveParent ? (
                /* Ana maddeler listesi */
                <div className="space-y-2">
                  {activeChecklistTemplates.map((tmpl) => {
                    const mediaCount = (tmpl.children || []).reduce((sum, ch) => sum + (checklistMedia[ch.id]?.length || 0), 0)
                      + (checklistMedia[tmpl.id]?.length || 0);
                    return (
                      <button
                        key={tmpl.id}
                        onClick={() => setChecklistActiveParent(tmpl)}
                        className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 hover:border-[#1e3a5f] hover:bg-blue-50/50 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
                            <ClipboardList size={18} className="text-[#1e3a5f]" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 text-sm truncate">{tmpl.name}</p>
                            <p className="text-[10px] text-gray-400">
                              {tmpl.children?.length || 0} alt madde
                              {mediaCount > 0 && ` · ${mediaCount} medya`}
                            </p>
                          </div>
                        </div>
                        <ChevronRightIcon size={16} className="text-gray-300 group-hover:text-[#1e3a5f] flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : !checklistActiveChild ? (
                /* Alt maddeler listesi (parent seçili) */
                <div className="space-y-2">
                  {checklistActiveParent.children && checklistActiveParent.children.length > 0 ? (
                    checklistActiveParent.children.map((child) => {
                      const mediaCount = checklistMedia[child.id]?.length || 0;
                      return (
                        <button
                          key={child.id}
                          onClick={() => setChecklistActiveChild(child)}
                          className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-[#2980b9] hover:bg-blue-50/30 transition-all text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <ImageIcon size={14} className="text-[#2980b9]" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-700 font-medium truncate">{child.name}</p>
                              {mediaCount > 0 && <p className="text-[10px] text-green-600">{mediaCount} medya yüklendi</p>}
                            </div>
                          </div>
                          <ChevronRightIcon size={14} className="text-gray-300 group-hover:text-[#2980b9] flex-shrink-0" />
                        </button>
                      );
                    })
                  ) : (
                    /* Parent'ın direkt medya yükleme alanı (alt maddesi yoksa) */
                    (() => {
                      const itemId = checklistActiveParent.id;
                      const itemMedia = checklistMedia[itemId] || [];
                      return (
                        <div>
                          {itemMedia.length === 0 ? (
                            <div className="text-center py-6 text-gray-400">
                              <ImageIcon size={36} className="mx-auto mb-2 opacity-50" />
                              <p className="text-sm">Henüz medya eklenmedi</p>
                              <p className="text-xs">Fotoğraf veya video yükleyin</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {itemMedia.map((m) => (
                                <div key={m.id} className="rounded-lg overflow-hidden bg-gray-50 border">
                                  <div className="relative group">
                                    {m.mimeType.startsWith("video/") ? (
                                      <div className="aspect-square flex items-center justify-center cursor-pointer bg-gray-900" onClick={() => setViewingChecklistMedia(m)}>
                                        <div className="text-center text-white"><Play size={24} className="mx-auto" /></div>
                                      </div>
                                    ) : (
                                      <img src={m.fileUrl} alt={m.fileName} className="w-full aspect-square object-cover cursor-pointer" onClick={() => setViewingChecklistMedia(m)} />
                                    )}
                                    <button onClick={() => handleDeleteChecklistMedia(m.id, itemId)} className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              ) : (
                /* Alt madde medya görüntüleme/yükleme */
                (() => {
                  const itemId = checklistActiveChild.id;
                  const itemMedia = checklistMedia[itemId] || [];
                  return (
                    <div>
                      {itemMedia.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                          <ImageIcon size={36} className="mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Henüz medya eklenmedi</p>
                          <p className="text-xs">Fotoğraf veya video yükleyin</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {itemMedia.map((m) => (
                            <div key={m.id} className="rounded-lg overflow-hidden bg-gray-50 border">
                              <div className="relative group">
                                {m.mimeType.startsWith("video/") ? (
                                  <div className="aspect-square flex items-center justify-center cursor-pointer bg-gray-900" onClick={() => setViewingChecklistMedia(m)}>
                                    <div className="text-center text-white"><Play size={24} className="mx-auto" /></div>
                                  </div>
                                ) : (
                                  <img src={m.fileUrl} alt={m.fileName} className="w-full aspect-square object-cover cursor-pointer" onClick={() => setViewingChecklistMedia(m)} />
                                )}
                                <button onClick={() => handleDeleteChecklistMedia(m.id, itemId)} className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Yükleme Butonları - Alt madde veya parent (alt maddesi yoksa) seçiliyken göster */}
            {(checklistActiveChild || (checklistActiveParent && (!checklistActiveParent.children || checklistActiveParent.children.length === 0))) && (
              <div className="px-4 py-3 border-t bg-gray-50 flex-shrink-0">
                <input ref={checklistFileRef} type="file" multiple accept="image/*,video/*" className="hidden"
                  onChange={(e) => {
                    const targetId = checklistActiveChild?.id || checklistActiveParent?.id;
                    if (e.target.files && targetId) { handleChecklistMediaUpload(e.target.files, targetId); e.target.value = ""; }
                  }}
                />
                <input ref={checklistCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => {
                    const targetId = checklistActiveChild?.id || checklistActiveParent?.id;
                    if (e.target.files && targetId) { handleChecklistMediaUpload(e.target.files, targetId); e.target.value = ""; }
                  }}
                />
                <input ref={checklistVideoRef} type="file" accept="video/*" capture="environment" className="hidden"
                  onChange={(e) => {
                    const targetId = checklistActiveChild?.id || checklistActiveParent?.id;
                    if (e.target.files && targetId) { handleChecklistMediaUpload(e.target.files, targetId); e.target.value = ""; }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => checklistCameraRef.current?.click()}
                    disabled={checklistUploading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#2980b9] text-white rounded-xl hover:bg-[#2471a3] transition-all disabled:opacity-50 font-medium text-sm"
                  >
                    <Camera size={16} />
                    Fotoğraf
                  </button>
                  <button
                    onClick={() => checklistVideoRef.current?.click()}
                    disabled={checklistUploading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#8e44ad] text-white rounded-xl hover:bg-[#7d3c98] transition-all disabled:opacity-50 font-medium text-sm"
                  >
                    <Video size={16} />
                    Video
                  </button>
                  <button
                    onClick={() => checklistFileRef.current?.click()}
                    disabled={checklistUploading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#27ae60] text-white rounded-xl hover:bg-[#219a52] transition-all disabled:opacity-50 font-medium text-sm"
                  >
                    <Upload size={16} />
                    Dosya
                  </button>
                </div>
                {checklistUploading && (
                  <div className="mt-2 flex items-center justify-center gap-2 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#1e3a5f] border-t-transparent"></div>
                    Yükleniyor...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== DAİRE SİLME ONAY POPUP =================== */}
      {checklistDeleteConfirm && selectedPin && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50" style={{ backdropFilter: 'blur(4px)' }} onClick={() => setChecklistDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" style={{ border: '5px solid #1e3a5f' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Daire Sil</h3>
                <p className="text-xs text-gray-400">{selectedPin.label}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Bu daireyi silmek istediğinizden emin misiniz? Daire üzerine yüklenen tüm medyalar, belgeler ve kontrol listesi verileri kalıcı olarak silinecektir.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setChecklistDeleteConfirm(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
                İptal
              </button>
              <button onClick={executeChecklistDeletePin} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-all">
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================== YER DEĞİŞTİRME BİLDİRİMİ =================== */}
      {moveNotification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] max-w-md w-full px-4">
          <div className={`rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 ${moveNotification.includes('başarılı') ? 'bg-green-600' : moveNotification.includes('hata') ? 'bg-red-600' : 'bg-[#1e3a5f]'} text-white`}>
            {moveNotification.includes('başarılı') ? (
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </div>
            ) : moveNotification.includes('kaydediliyor') ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent flex-shrink-0" />
            ) : (
              <Move size={18} className="flex-shrink-0 animate-pulse" />
            )}
            <p className="text-sm font-medium">{moveNotification}</p>
            {moveNotification.includes('sürükleyin') && (
              <button onClick={() => { setMoveNotification(null); setMovingPin(null); }} className="ml-auto p-1 hover:bg-white/20 rounded-lg flex-shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* =================== CHECKLIST MEDIA VIEWER =================== */}
      {viewingChecklistMedia && (
        <div className="fixed inset-0 z-[80] bg-black flex items-center justify-center" onClick={() => setViewingChecklistMedia(null)}>
          <button onClick={() => setViewingChecklistMedia(null)} className="absolute top-4 right-4 z-10 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full transition-all">
            <X size={24} />
          </button>
          <div className="w-full h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            {viewingChecklistMedia.mimeType.startsWith("video/") ? (
              <video src={viewingChecklistMedia.fileUrl} controls autoPlay className="max-w-full max-h-full rounded-lg" />
            ) : (
              <img src={viewingChecklistMedia.fileUrl} alt={viewingChecklistMedia.fileName} className="max-w-full max-h-full object-contain rounded-lg" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
