"use client";

import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSidebar, useUser } from "../../layout";
import { isAdmin } from "@/lib/roles";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useDevice } from "@/hooks/useDevice";
import {
  ArrowLeft,
  Building2,
  FileText,
  ChevronRight,
  Upload,
  Download,
  File,
  X,
  Trash2,
  Edit3,
  Plus,
  Layers,
  Paintbrush,
  Trees,
  CheckCircle,
  Hammer,
  Camera,
  Image as ImageIcon,
  Video,
  Eye,
  ChevronLeft as ArrowLeftIcon,
  ChevronRight as ArrowRightIcon,
  FolderOpen,
  GripVertical,
  Share2,
  Flag,
  RotateCcw,
  HardHat,
  History,
  Loader2,
  Maximize2,
  Minimize2,
} from "lucide-react";

const PdfViewer = lazy(() => import("@/components/PdfViewer"));
const DwgViewer = lazy(() => import("@/components/DwgViewer"));
import MetrajForm, { MetrajItem } from "@/components/MetrajForm";
import MobileConstructionView from "./_components/MobileConstructionView";
import AnimatedProgress from "./_components/AnimatedProgress";
import MediaViewer from "../../satis/_components/MediaViewer";

interface Category {
  id: string;
  name: string;
  description: string;
  parentCategoryId: string | null;
  order: number;
  color: string;
  imageUrl: string;
  config: any;
  subCategories: Category[];
  workItems: WorkItem[];
}

interface WorkItem {
  id: string;
  name: string;
  progress: number;
  status: string;
  startDate: string;
  endDate: string;
  imageUrl: string;
  taskEntries: TaskEntry[];
}

interface TaskEntry {
  id: string;
  name: string;
  progress: number;
  status: string;
  startDate: string;
  endDate: string;
}

interface Block {
  id: string;
  name: string;
  order: number;
  floors: Floor[];
}

interface Floor {
  id: string;
  name: string;
  order: number;
  units: Unit[];
}

interface Unit {
  id: string;
  name: string;
  order: number;
}

interface CategoryDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploader: { firstName: string; lastName: string };
}

interface FloorAttachment {
  id: string;
  floorId: string;
  documentId: string;
  pageNumber: number;
  document: { id: string; fileName: string; fileUrl: string };
}

interface Site {
  id: string;
  name: string;
  description: string;
  address: string;
  status: string;
  startDate: string;
  endDate: string;
  blocks: Block[];
  categories: Category[];
  config?: any;
  _count: { costRecords: number };
}

// Tarih gruplama helper'ları (Personnel popup ve construction medias için)
function dateKey(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function dateLabel(key: string): string {
  if (!key) return "";
  const d = new Date(key + "T00:00:00");
  if (isNaN(d.getTime())) return key;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(d) === dateKey(today)) return "Bugün";
  if (dateKey(d) === dateKey(yesterday)) return "Dün";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCollapsed } = useSidebar();
  const user = useUser();
  const { isMobile } = useDevice();
  const [site, setSite] = useState<Site | null>(null);
  const [blockProgress, setBlockProgress] = useState<Record<string, { percent: number; completed: number; total: number; byType?: Record<string, { percent: number; completed: number; total: number }> }>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ name: string; category?: Category }[]>([]);
  const [categoryDocuments, setCategoryDocuments] = useState<CategoryDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingGroup, setUploadingGroup] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<CategoryDocument | null>(null);
  const [groupDocs, setGroupDocs] = useState<Record<string, CategoryDocument[]>>({});
  const [activeBlock, setActiveBlock] = useState<Block | null>(null);

  // Dosya adı düzenleme / yükleme popup state'leri
  const [pendingFile, setPendingFile] = useState<{ file: File; groupKey?: string } | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");
  const [renamingDoc, setRenamingDoc] = useState<{ doc: CategoryDocument; isGroup: boolean } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingDoc, setDeletingDoc] = useState<{ doc: CategoryDocument; isGroup: boolean } | null>(null);
  const [floorAttachments, setFloorAttachments] = useState<Record<string, FloorAttachment[]>>({});
  const [floorAttachDoc, setFloorAttachDoc] = useState<CategoryDocument | null>(null);
  const [attachingFloor, setAttachingFloor] = useState<Floor | null>(null);
  const [attachPage, setAttachPage] = useState("");
  const [viewingDocFloorLabels, setViewingDocFloorLabels] = useState<Record<number, string>>({});
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [viewingDocIsUygulama, setViewingDocIsUygulama] = useState(false);
  const [checklistTemplates, setChecklistTemplates] = useState<{ id: string; name: string; children: { id: string; name: string }[] }[]>([]);

  // İnşaat takip state'leri
  const [activeConstructionType, setActiveConstructionType] = useState<string | null>(null);
  const [constructionFloors, setConstructionFloors] = useState<any[]>([]);
  const [constructionEntries, setConstructionEntries] = useState<Record<string, { id: string; status: string; mediaCount: number }>>({});
  const [constructionLoading, setConstructionLoading] = useState(false);
  const [constructionMediaPopup, setConstructionMediaPopup] = useState<{ workId: string; workName: string; floorName: string; floorId?: string } | null>(null);
  const [constructionMedias, setConstructionMedias] = useState<any[]>([]);
  const [constructionMediaLoading, setConstructionMediaLoading] = useState(false);
  const [constructionMediaUploading, setConstructionMediaUploading] = useState(false);
  const [constructionMediaMode, setConstructionMediaMode] = useState<"choice" | "upload" | "view">("upload");
  const [constructionViewIndex, setConstructionViewIndex] = useState(0);

  // Photo zoom state (shared by both gallery viewers)
  const [imgZoom, setImgZoom] = useState(1);
  const [imgPan, setImgPan] = useState({ x: 0, y: 0 });
  const [imgFullscreen, setImgFullscreen] = useState(false);
  const imgTouchRef = useRef<{ dist: number; cx: number; cy: number; scale: number; px: number; py: number; moved: boolean; t: number; swipeDx?: number } | null>(null);
  const lastTapRef = useRef(0);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const pendingAutoWork = useRef<string | null>(null);
  const hasAutoNavigated = useRef(false);

  const [constructionEntryStartDate, setConstructionEntryStartDate] = useState<string>("");
  const [constructionEntryEndDate, setConstructionEntryEndDate] = useState<string>("");
  const [constructionEntryStatus, setConstructionEntryStatus] = useState<string>("NOT_STARTED");
  // True only AFTER the openConstructionMedia fetch resolves; prevents race-condition writes that
  // would otherwise overwrite historical dates with empty/today during the brief loading window.
  const [constructionEntryLoaded, setConstructionEntryLoaded] = useState<boolean>(false);

  // İnce İnşaat state'leri
  const [inceViewMode, setInceViewMode] = useState<"select" | "daire_bazinda" | "is_bazinda" | null>(null);
  const [selectedInceDaire, setSelectedInceDaire] = useState<any>(null);
  const [selectedInceWork, setSelectedInceWork] = useState<any>(null);
  // İnce İnşaat entries: key = "workId:daireId" → { id, mediaCount, status }
  const [inceEntries, setInceEntries] = useState<Record<string, { id: string; mediaCount: number; status: string }>>({});
  // İnce İnşaat daireleri (API'den gelir)
  const [inceDaires, setInceDaires] = useState<{ id: string; name: string }[]>([]);
  // Daireye özel iş kalemi override'ları
  const [inceUnitOverrides, setInceUnitOverrides] = useState<Record<string, { added: string[]; removed: string[] }>>({});

  // Ruhsat-İskan PDF görüntüleme
  const [ruhsatViewingPdf, setRuhsatViewingPdf] = useState<{ fileUrl: string; fileName: string } | null>(null);
  const [ruhsatUploadingFloorId, setRuhsatUploadingFloorId] = useState<string | null>(null);
  const [ruhsatRenamingMedia, setRuhsatRenamingMedia] = useState<{ mediaId: string; workId: string; fileName: string } | null>(null);
  const [ruhsatRenameValue, setRuhsatRenameValue] = useState("");
  const [ruhsatActiveWork, setRuhsatActiveWork] = useState<{ workId: string; workName: string; floorName: string } | null>(null);
  const [ruhsatDeleteConfirm, setRuhsatDeleteConfirm] = useState<{ mediaId: string; workId: string; fileName: string } | null>(null);
  // Belge Tarayıcı state'leri
  const [scannerMode, setScannerMode] = useState(false);
  const [scannedImages, setScannedImages] = useState<{ data: string; name: string }[]>([]);
  const [scannerConverting, setScannerConverting] = useState(false);
  const [scannerPreview, setScannerPreview] = useState<number | null>(null);
  const [scannerDragging, setScannerDragging] = useState<number | null>(null);
  const scannerInputRef = useRef<HTMLInputElement>(null);

  // Diğer bloklar state'leri
  const [showOtherBlocks, setShowOtherBlocks] = useState(false);
  const [otherBlocksData, setOtherBlocksData] = useState<{ blockId: string; blockName: string; floors: any[]; entries: Record<string, { id: string; status: string; mediaCount: number }>; daires?: { id: string; name: string }[]; inceEntries?: Record<string, { id: string; mediaCount: number; status: string }> }[]>([]);
  const [otherBlocksLoading, setOtherBlocksLoading] = useState(false);

  // Diğer blok önizleme popup state'leri
  const [otherBlockPreview, setOtherBlockPreview] = useState<{ workId: string; workName: string; floorName: string; blockId: string; blockName: string; floorId?: string } | null>(null);
  const [otherBlockPreviewMedias, setOtherBlockPreviewMedias] = useState<any[]>([]);
  const [otherBlockPreviewLoading, setOtherBlockPreviewLoading] = useState(false);
  const [otherBlockPreviewIndex, setOtherBlockPreviewIndex] = useState(0);
  const [otherBlockPreviewMode, setOtherBlockPreviewMode] = useState<"grid" | "view">("grid");

  // Personel popup state'leri (medya popup'ı içinde)
  const [personnelPopupOpen, setPersonnelPopupOpen] = useState(false);
  const [personnelRecords, setPersonnelRecords] = useState<any[]>([]);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [personnelFormName, setPersonnelFormName] = useState("");
  const [personnelFormCompany, setPersonnelFormCompany] = useState("");
  const [personnelFormDuration, setPersonnelFormDuration] = useState<"FULL_DAY" | "HALF_DAY">("FULL_DAY");
  const [personnelNameSuggestions, setPersonnelNameSuggestions] = useState<string[]>([]);
  const [personnelCompanySuggestions, setPersonnelCompanySuggestions] = useState<string[]>([]);
  const [personnelShowNameSugg, setPersonnelShowNameSugg] = useState(false);
  const [personnelShowCompSugg, setPersonnelShowCompSugg] = useState(false);
  const [personnelFilteredNames, setPersonnelFilteredNames] = useState<string[]>([]);
  const [personnelFilteredComps, setPersonnelFilteredComps] = useState<string[]>([]);
  const [personnelHistoryOpen, setPersonnelHistoryOpen] = useState(false);
  const [personnelHistoryDate, setPersonnelHistoryDate] = useState("");
  const [personnelHistoryRecords, setPersonnelHistoryRecords] = useState<any[]>([]);
  const [personnelHistoryLoading, setPersonnelHistoryLoading] = useState(false);

  // Keyboard navigation for galleries
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (constructionMediaMode === "view" && constructionMediaPopup && constructionMedias.length > 0) {
        if (e.key === "ArrowRight" && constructionViewIndex < constructionMedias.length - 1) {
          setConstructionViewIndex(constructionViewIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
        } else if (e.key === "ArrowLeft" && constructionViewIndex > 0) {
          setConstructionViewIndex(constructionViewIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
        } else if (e.key === "Escape") {
          setConstructionMediaPopup(null); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false);
        }
      }
      if (otherBlockPreviewMode === "view" && otherBlockPreview && otherBlockPreviewMedias.length > 0) {
        if (e.key === "ArrowRight" && otherBlockPreviewIndex < otherBlockPreviewMedias.length - 1) {
          setOtherBlockPreviewIndex(otherBlockPreviewIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
        } else if (e.key === "ArrowLeft" && otherBlockPreviewIndex > 0) {
          setOtherBlockPreviewIndex(otherBlockPreviewIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
        } else if (e.key === "Escape") {
          setOtherBlockPreview(null); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [constructionMediaMode, constructionMediaPopup, constructionMedias, constructionViewIndex, otherBlockPreviewMode, otherBlockPreview, otherBlockPreviewMedias, otherBlockPreviewIndex]);

  // Gallery viewer: auto-enable zoom/pan when viewer is open
  useEffect(() => {
    const viewerOpen = (constructionMediaMode === "view" && constructionMediaPopup) || (otherBlockPreviewMode === "view" && otherBlockPreview);
    if (viewerOpen) {
      setImgFullscreen(true);
    } else {
      setImgFullscreen(false);
      setImgZoom(1);
      setImgPan({ x: 0, y: 0 });
    }
  }, [constructionMediaMode, constructionMediaPopup, otherBlockPreviewMode, otherBlockPreview]);

  // Track fullscreen exit via browser UI (e.g. swipe down on iPad)
  // NOT: imgFullscreen artık viewer'ın açık olup olmadığını temsil ediyor;
  // browser fullscreen API'sinden bağımsız. Bu yüzden burada state'i
  // resetlemiyoruz; sadece pan/zoom'u sıfırlıyoruz.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        setImgZoom(1);
        setImgPan({ x: 0, y: 0 });
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  const [otherBlockPreviewDates, setOtherBlockPreviewDates] = useState<{ start: string; end: string }>({ start: "", end: "" });

  // İnce İnşaat diğer blok daire seçim popup state'leri
  const [otherBlockInceDairePopup, setOtherBlockInceDairePopup] = useState<{ workId: string; workName: string; blockId: string; blockName: string; daires: { id: string; name: string }[]; inceEntries: Record<string, { id: string; mediaCount: number; status: string }> } | null>(null);

  // Kamera state'leri
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraType, setCameraType] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Medya yükleme ve silme state'leri
  const [constructionPendingFile, setConstructionPendingFile] = useState<Blob | null>(null);
  const [constructionPendingFileName, setConstructionPendingFileName] = useState("");
  const [constructionMediaTitle, setConstructionMediaTitle] = useState("");
  const [constructionMediaDesc, setConstructionMediaDesc] = useState("");
  const [constructionDeleteConfirm, setConstructionDeleteConfirm] = useState<{ mediaId: string; fileName: string; fromGallery?: boolean } | null>(null);
  const constructionPendingUrl = useMemo(() => constructionPendingFile ? URL.createObjectURL(constructionPendingFile) : null, [constructionPendingFile]);
  useEffect(() => { return () => { if (constructionPendingUrl) URL.revokeObjectURL(constructionPendingUrl); }; }, [constructionPendingUrl]);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [editMediaTitle, setEditMediaTitle] = useState("");
  const [editMediaDesc, setEditMediaDesc] = useState("");

  // Metraj popup state'leri
  const [metrajModalOpen, setMetrajModalOpen] = useState(false);
  const [metrajItems, setMetrajItems] = useState<MetrajItem[]>([]);
  const [metrajSaving, setMetrajSaving] = useState(false);
  const [metrajSaveError, setMetrajSaveError] = useState("");

  // Body scroll lock when ANY modal/popup overlay is open
  // (must be after all state declarations above to avoid TDZ errors)
  const anyModalOpen = !!(
    constructionMediaPopup ||
    otherBlockPreview ||
    otherBlockInceDairePopup ||
    personnelPopupOpen ||
    ruhsatActiveWork ||
    ruhsatViewingPdf ||
    ruhsatRenamingMedia ||
    ruhsatDeleteConfirm ||
    scannerPreview !== null ||
    pendingFile ||
    renamingDoc ||
    deletingDoc ||
    floorAttachDoc ||
    cameraActive
  );
  useBodyScrollLock(anyModalOpen);


  useEffect(() => {
    fetchSite();
  }, [params.id]);

  // Auto-navigate when arriving from admin dashboard link
  useEffect(() => {
    if (!site || hasAutoNavigated.current) return;
    const autoBlock = searchParams.get("autoBlock");
    const autoType = searchParams.get("autoType");
    const autoWork = searchParams.get("autoWork");
    const inceView = searchParams.get("inceView");
    if (!autoBlock || !autoType) return;
    hasAutoNavigated.current = true;
    const block = site.blocks.find((b) => b.id === autoBlock);
    if (!block) return;
    setActiveBlock(block);
    setActiveConstructionType(autoType);
    if (autoType === "INCE_INSAAT") {
      setInceViewMode(inceView === "daire_bazinda" ? "daire_bazinda" : "is_bazinda");
      if (autoWork) pendingAutoWork.current = autoWork;
    }
    fetchConstructionData(autoBlock, autoType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  // Auto-select ince iş once construction floors load
  useEffect(() => {
    if (!pendingAutoWork.current || !constructionFloors.length) return;
    const allWorks = (constructionFloors as any[]).flatMap((f) => f.works || []);
    const work = allWorks.find((w) => w.name === pendingAutoWork.current);
    if (work) {
      setSelectedInceWork(work);
      pendingAutoWork.current = null;
    }
  }, [constructionFloors]);

  // Sidebar auto-collapse when in construction mode
  useEffect(() => {
    if (activeConstructionType) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
    }
  }, [activeConstructionType, setCollapsed]);

  useEffect(() => {
    if (viewingDoc && (viewingDoc.fileType === "PDF" || viewingDoc.mimeType === "application/pdf")) {
      fetchFloorLabelsForDoc(viewingDoc.id);
    } else {
      setViewingDocFloorLabels({});
    }
  }, [viewingDoc]);

  // Uygulama PDF'i için sayfa-daire listesi
  const pageFloorUnits = (() => {
    if (!viewingDocIsUygulama || !activeBlock) return {};
    const result: Record<number, { id: string; name: string }[]> = {};
    for (const [pageStr, floorName] of Object.entries(viewingDocFloorLabels)) {
      const page = Number(pageStr);
      const floor = activeBlock.floors.find((f) => f.name === floorName);
      if (floor) result[page] = floor.units.map((u) => ({ id: u.id, name: u.name }));
    }
    return result;
  })();

  const fetchSite = async () => {
    try {
      const res = await fetch(`/api/sites/${params.id}`);
      if (!res.ok) {
        router.push("/dashboard/sites");
        return;
      }
      const data = await res.json();
      setSite(data.site);
      // Blok ilerleme yüzdelerini getir (kaba+ince+bina genel kapsamında)
      try {
        const bpRes = await fetch(`/api/sites/${params.id}/blocks-progress`);
        if (bpRes.ok) {
          const bpData = await bpRes.json();
          setBlockProgress(bpData.progress || {});
        }
      } catch {}
      // Fetch checklist templates
      try {
        const clRes = await fetch(`/api/sites/${params.id}/checklist`);
        if (clRes.ok) {
          const clData = await clRes.json();
          setChecklistTemplates(clData.templates || []);
        }
      } catch {}
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const navigateToCategory = (cat: Category) => {
    setActiveCategory(cat);
    const newBreadcrumb = [...breadcrumb, { name: cat.name, category: cat }];
    setBreadcrumb(newBreadcrumb);
    setCategoryDocuments([]);
    setGroupDocs({});
    fetchCategoryDocuments(cat.id);
    // Ruhsatlandırma kontrolü
    if (newBreadcrumb.some((b) => b.name.toLowerCase().includes("ruhsat"))) {
      fetchGroupDocs(cat.id);
    }
  };

  const navigateBack = () => {
    if (breadcrumb.length > 1) {
      const newBreadcrumb = breadcrumb.slice(0, -1);
      setBreadcrumb(newBreadcrumb);
      const prevCat = newBreadcrumb[newBreadcrumb.length - 1]?.category || null;
      setActiveCategory(prevCat);
      if (prevCat) fetchCategoryDocuments(prevCat.id);
      else setCategoryDocuments([]);
    } else if (activeCategory) {
      setActiveCategory(null);
      setBreadcrumb([]);
      setCategoryDocuments([]);
      setGroupDocs({});
    } else if (activeConstructionType === "INCE_INSAAT") {
      // İnce İnşaat çok adımlı geri navigasyonu
      if (selectedInceDaire) {
        setSelectedInceDaire(null);
      } else if (selectedInceWork) {
        setSelectedInceWork(null);
      } else if (inceViewMode && inceViewMode !== "select") {
        setInceViewMode("select");
        setShowOtherBlocks(false);
        setOtherBlocksData([]);
      } else {
        // İnce select modundan çık → bloğu koru ki 4-kart ara ekranına dönelim.
        setActiveConstructionType(null);
        setInceViewMode(null);
        setConstructionFloors([]);
        setConstructionEntries({});
        setInceEntries({});
        setInceDaires([]);
        setShowOtherBlocks(false);
        setOtherBlocksData([]);
      }
    } else if (activeConstructionType) {
      // Tip seçili → tip ekranından çık, ama bloğu koru ki 4-kart ara ekranına dönelim.
      setActiveConstructionType(null);
      setConstructionFloors([]);
      setConstructionEntries({});
      setShowOtherBlocks(false);
      setOtherBlocksData([]);
    } else if (activeBlock) {
      setActiveBlock(null);
    }
  };

  const goHome = () => {
    setActiveCategory(null);
    setBreadcrumb([]);
    setCategoryDocuments([]);
    setGroupDocs({});
    setActiveBlock(null);
    setActiveConstructionType(null);
    setConstructionFloors([]);
    setConstructionEntries({});
    setInceViewMode(null);
    setSelectedInceDaire(null);
    setSelectedInceWork(null);
    setInceEntries({});
    setInceDaires([]);
    setShowOtherBlocks(false);
    setOtherBlocksData([]);
  };

  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) {
      setActiveCategory(null);
      setBreadcrumb([]);
      setCategoryDocuments([]);
    } else {
      const newBreadcrumb = breadcrumb.slice(0, index + 1);
      setBreadcrumb(newBreadcrumb);
      const cat = newBreadcrumb[newBreadcrumb.length - 1]?.category || null;
      setActiveCategory(cat);
      if (cat) fetchCategoryDocuments(cat.id);
      else setCategoryDocuments([]);
    }
  };

  const fetchCategoryDocuments = async (categoryId: string) => {
    try {
      const blockParam = activeBlock ? `?blockId=${activeBlock.id}` : '';
      const res = await fetch(`/api/categories/${categoryId}/documents${blockParam}`);
      if (res.ok) {
        const data = await res.json();
        setCategoryDocuments(data.documents);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, groupKey?: string) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    setPendingFileName(nameWithoutExt);
    setPendingFile({ file, groupKey });
    e.target.value = "";
  };

  const getFileExt = (name: string) => {
    const match = name.match(/\.[^/.]+$/);
    return match ? match[0] : "";
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !activeCategory) return;
    const { file, groupKey } = pendingFile;
    const ext = getFileExt(file.name);
    const finalName = pendingFileName.trim() + ext;

    if (groupKey) setUploadingGroup(groupKey);
    else setUploading(true);

    setPendingFile(null);
    setUploadProgress(0);

    try {
      const renamedFile = new Blob([file], { type: file.type });
      const formData = new FormData();
      formData.append("file", renamedFile, finalName);
      if (groupKey) formData.append("group", groupKey);
      if (activeBlock) formData.append("blockId", activeBlock.id);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/categories/${activeCategory!.id}/documents`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (groupKey) fetchGroupDocs(activeCategory!.id);
            else fetchCategoryDocuments(activeCategory!.id);
            setUploadSuccess(finalName);
            setTimeout(() => setUploadSuccess(null), 2500);
            resolve();
          } else {
            try { const d = JSON.parse(xhr.responseText); alert(d.error || "Dosya yüklenemedi"); } catch { alert("Dosya yüklenemedi"); }
            reject();
          }
        };
        xhr.onerror = () => { alert("Dosya yüklenirken hata oluştu"); reject(); };
        xhr.send(formData);
      });
    } catch { /* handled */ } finally {
      setUploadProgress(null);
      if (groupKey) setUploadingGroup(null);
      else setUploading(false);
    }
  };

  const handleRenameDoc = async () => {
    if (!renamingDoc || !activeCategory) return;
    const { doc, isGroup } = renamingDoc;
    const ext = getFileExt(doc.fileName);
    const newName = renameValue.trim() + ext;
    if (!newName || newName === doc.fileName) { setRenamingDoc(null); return; }

    try {
      const res = await fetch(`/api/categories/${activeCategory.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, fileName: newName }),
      });
      if (res.ok) {
        if (isGroup) fetchGroupDocs(activeCategory.id);
        else fetchCategoryDocuments(activeCategory.id);
      } else {
        const data = await res.json();
        alert(data.error || "İsim değiştirilemedi");
      }
    } catch {
      alert("İsim değiştirilirken hata oluştu");
    } finally {
      setRenamingDoc(null);
    }
  };

  const handleDeleteDocument = (doc: CategoryDocument) => {
    setDeletingDoc({ doc, isGroup: false });
  };

  const handleDeleteGroupDoc = (doc: CategoryDocument) => {
    setDeletingDoc({ doc, isGroup: true });
  };

  const confirmDelete = async () => {
    if (!deletingDoc || !activeCategory) return;
    const { doc, isGroup } = deletingDoc;
    setDeletingDoc(null);
    try {
      const res = await fetch(`/api/categories/${activeCategory.id}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (res.ok) {
        if (isGroup) fetchGroupDocs(activeCategory.id);
        else fetchCategoryDocuments(activeCategory.id);
      } else {
        const data = await res.json();
        alert(data.error || "Dosya silinemedi");
      }
    } catch {
      alert("Dosya silinirken hata oluştu");
    }
  };

  // Ruhsatlandırma proje grupları
  const RUHSAT_GROUPS = [
    { key: "mimari", label: "Mimari Proje", buttonLabel: "Mimari Proje Ekle" },
    { key: "statik", label: "Statik Proje", buttonLabel: "Statik Proje Ekle" },
    { key: "mekanik", label: "Mekanik Proje", buttonLabel: "Mekanik Proje Ekle" },
    { key: "zemin", label: "Zemin Etüdü", buttonLabel: "Zemin Etüdü Ekle" },
    { key: "uygulama", label: "Uygulama Projesi", buttonLabel: "Uygulama Projesi Ekle" },
    { key: "elektrik", label: "Elektrik Projesi", buttonLabel: "Elektrik Projesi Ekle" },
    { key: "ruhsat", label: "Yapı Ruhsatı", buttonLabel: "Yapı Ruhsatı Ekle" },
    { key: "diger", label: "Diğer Belgeler", buttonLabel: "Belge Ekle" },
  ];

  const isRuhsatlandirma = breadcrumb.some((b) => b.name.toLowerCase().includes("ruhsat"));

  const fetchGroupDocs = async (categoryId: string) => {
    const result: Record<string, CategoryDocument[]> = {};
    const blockParam = activeBlock ? `&blockId=${activeBlock.id}` : '';
    await Promise.all(
      RUHSAT_GROUPS.map(async (g) => {
        try {
          const res = await fetch(`/api/categories/${categoryId}/documents?group=${g.key}${blockParam}`);
          if (res.ok) {
            const data = await res.json();
            result[g.key] = data.documents;
          } else {
            result[g.key] = [];
          }
        } catch {
          result[g.key] = [];
        }
      })
    );
    setGroupDocs(result);
  };

  const fetchFloorAttachments = async (docId: string) => {
    try {
      const res = await fetch(`/api/floor-attachments?documentId=${docId}`);
      if (res.ok) {
        const data = await res.json();
        setFloorAttachments(data.attachments || {});
      }
    } catch {
      setFloorAttachments({});
    }
  };

  const fetchFloorLabelsForDoc = async (docId: string) => {
    try {
      const res = await fetch(`/api/floor-attachments?documentId=${docId}`);
      if (res.ok) {
        const data = await res.json();
        setViewingDocFloorLabels(data.pageLabels || {});
      }
    } catch {
      setViewingDocFloorLabels({});
    }
  };

  const openFloorAttachPopup = (doc: CategoryDocument) => {
    setFloorAttachDoc(doc);
    fetchFloorAttachments(doc.id);
  };

  // İnşaat takip fonksiyonları
  const fetchConstructionData = async (blockId: string, type: string) => {
    setConstructionLoading(true);
    try {
      const url = blockId
        ? `/api/construction?siteId=${params.id}&blockId=${blockId}&type=${type}`
        : `/api/construction?siteId=${params.id}&type=${type}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setConstructionFloors(data.floors || []);

        if (type === "INCE_INSAAT") {
          // İnce İnşaat: daireler ve allEntries API'den ayrı gelir
          setInceDaires(data.daires || []);
          setInceUnitOverrides(data.unitOverrides || {});
          const ince: Record<string, { id: string; mediaCount: number; status: string }> = {};
          for (const [key, val] of Object.entries(data.allEntries || {})) {
            if (typeof val === "number") {
              ince[key] = { id: key, mediaCount: val, status: val > 0 ? "IN_PROGRESS" : "NOT_STARTED" };
            } else {
              const v = val as { mediaCount: number; status: string };
              ince[key] = { id: key, mediaCount: v.mediaCount, status: v.status || "NOT_STARTED" };
            }
          }
          setInceEntries(ince);
        } else {
          // Kaba İnşaat / Peyzaj: entries nested floors.works.entries
          const entries: Record<string, { id: string; status: string; mediaCount: number }> = {};
          for (const floor of (data.floors || [])) {
            for (const work of (floor.works || [])) {
              if (work.entries && work.entries.length > 0) {
                for (const entry of work.entries) {
                  entries[work.id] = {
                    id: entry.id,
                    status: entry.status || "IN_PROGRESS",
                    mediaCount: entry.media?.length || 0,
                  };
                }
              }
            }
          }
          setConstructionEntries(entries);
        }
      }
    } catch (err) {
      console.error("Construction data fetch error:", err);
    } finally {
      setConstructionLoading(false);
    }
  };

  // Diğer blokların verilerini getir (read-only karşılaştırma)
  const fetchOtherBlocksData = async (currentBlockId: string, type: string) => {
    if (!site) return;
    setOtherBlocksLoading(true);
    try {
      const otherBlocks = site.blocks.filter(b => b.id !== currentBlockId);
      const results: typeof otherBlocksData = [];
      for (const block of otherBlocks) {
        const url = `/api/construction?siteId=${params.id}&blockId=${block.id}&type=${type}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (type === "INCE_INSAAT") {
            const ince: Record<string, { id: string; mediaCount: number; status: string }> = {};
            for (const [key, val] of Object.entries(data.allEntries || {})) {
              const v = val as any;
              ince[key] = { id: key, mediaCount: typeof v === "number" ? v : v.mediaCount || 0, status: typeof v === "number" ? (v > 0 ? "IN_PROGRESS" : "NOT_STARTED") : v.status || "NOT_STARTED" };
            }
            results.push({ blockId: block.id, blockName: block.name, floors: data.floors || [], entries: {}, daires: data.daires || [], inceEntries: ince });
          } else {
            const entries: Record<string, { id: string; status: string; mediaCount: number }> = {};
            for (const floor of (data.floors || [])) {
              for (const work of (floor.works || [])) {
                if (work.entries && work.entries.length > 0) {
                  for (const entry of work.entries) {
                    entries[work.id] = { id: entry.id, status: entry.status || "IN_PROGRESS", mediaCount: entry.media?.length || 0 };
                  }
                }
              }
            }
            results.push({ blockId: block.id, blockName: block.name, floors: data.floors || [], entries });
          }
        }
      }
      setOtherBlocksData(results);
    } catch (err) {
      console.error("Other blocks fetch error:", err);
    } finally {
      setOtherBlocksLoading(false);
    }
  };

  // Peyzaj için siteId'yi blockId olarak kullan
  const effectiveBlockId = activeBlock?.id || (activeConstructionType === "PEYZAJ" ? params.id as string : null);

  const openConstructionMedia = async (workId: string, workName: string, floorName: string, floorId?: string) => {
    if (!effectiveBlockId) return;
    // Reset mode immediately so no stale "view" state flashes before fetch completes
    setConstructionMediaMode("upload");
    setConstructionMedias([]);
    setConstructionMediaPopup({ workId, workName, floorName, floorId });
    setConstructionMediaLoading(true);
    // Mark NOT loaded; do NOT reset dates yet to avoid showing stale-empty inputs.
    setConstructionEntryLoaded(false);
    setConstructionEntryStartDate("");
    setConstructionEntryEndDate("");
    setConstructionEntryStatus("NOT_STARTED");
    try {
      const floorParam = floorId ? `&floorId=${floorId}` : "";
      const res = await fetch(`/api/construction/${workId}?blockId=${effectiveBlockId}${floorParam}`);
      if (res.ok) {
        const data = await res.json();
        setConstructionMedias(data.media || []);
        setConstructionMediaMode("upload");
        if (data.entry?.startDate) setConstructionEntryStartDate(data.entry.startDate.slice(0, 10));
        if (data.entry?.endDate) setConstructionEntryEndDate(data.entry.endDate.slice(0, 10));
        if (data.entry?.status) setConstructionEntryStatus(data.entry.status);
      } else {
        setConstructionMedias([]);
        setConstructionMediaMode("upload");
      }
    } catch {
      setConstructionMedias([]);
      setConstructionMediaMode("upload");
    } finally {
      setConstructionMediaLoading(false);
      setConstructionEntryLoaded(true);
    }
  };

  // ── Personel fonksiyonları (medya popup'ı içinden) ──
  const personnelTodayStr = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  const openPersonnelPopup = async () => {
    if (!constructionMediaPopup || !site) return;
    setPersonnelPopupOpen(true);
    setPersonnelFormName("");
    setPersonnelFormCompany("");
    setPersonnelFormDuration("FULL_DAY");
    setPersonnelHistoryOpen(false);
    setPersonnelShowNameSugg(false);
    setPersonnelShowCompSugg(false);
    setPersonnelLoading(true);

    const entryKey = constructionMediaPopup.floorId
      ? `${constructionMediaPopup.workId}:${constructionMediaPopup.floorId}`
      : constructionMediaPopup.workId;
    const cType = activeConstructionType || "KABA_INSAAT";
    const blockId = effectiveBlockId;

    try {
      const params = new URLSearchParams({
        siteId: site.id,
        constructionType: cType,
        entryKey,
      });
      if (blockId) params.set("blockId", blockId);
      const res = await fetch(`/api/personnel?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPersonnelRecords(data.entries || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPersonnelLoading(false);
    }

    try {
      const res = await fetch(`/api/personnel?siteId=${site.id}&recentNames=1`);
      if (res.ok) {
        const data = await res.json();
        setPersonnelNameSuggestions(data.nameSuggestions || []);
        setPersonnelCompanySuggestions(data.companySuggestions || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePersonnelNameChange = (val: string) => {
    setPersonnelFormName(val);
    if (val.trim().length === 0) {
      setPersonnelFilteredNames(personnelNameSuggestions);
      setPersonnelShowNameSugg(true);
    } else {
      const lower = val.toLowerCase();
      const filtered = personnelNameSuggestions.filter((s) => s.toLowerCase().includes(lower));
      setPersonnelFilteredNames(filtered);
      setPersonnelShowNameSugg(filtered.length > 0);
    }
  };

  const handlePersonnelCompanyChange = (val: string) => {
    setPersonnelFormCompany(val);
    if (val.trim().length === 0) {
      setPersonnelFilteredComps(personnelCompanySuggestions);
      setPersonnelShowCompSugg(true);
    } else {
      const lower = val.toLowerCase();
      const filtered = personnelCompanySuggestions.filter((s) => s.toLowerCase().includes(lower));
      setPersonnelFilteredComps(filtered);
      setPersonnelShowCompSugg(filtered.length > 0);
    }
  };

  const applyPersonnelConstructionEntryProgress = (
    constructionEntry?: { id?: string; status?: string; startDate?: string | null; endDate?: string | null } | null
  ) => {
    if (!constructionEntry?.status || !constructionMediaPopup) return;

    setConstructionEntryStatus(constructionEntry.status);
    if (constructionEntry.startDate && !constructionEntryStartDate) {
      setConstructionEntryStartDate(new Date(constructionEntry.startDate).toISOString().slice(0, 10));
    }
    if (constructionEntry.endDate) {
      setConstructionEntryEndDate(new Date(constructionEntry.endDate).toISOString().slice(0, 10));
    }

    const entryKey = constructionMediaPopup.floorId
      ? `${constructionMediaPopup.workId}:${constructionMediaPopup.floorId}`
      : constructionMediaPopup.workId;

    if (constructionMediaPopup.floorId) {
      setInceEntries((prev) => ({
        ...prev,
        [entryKey]: {
          id: prev[entryKey]?.id || constructionEntry.id || entryKey,
          mediaCount: prev[entryKey]?.mediaCount || 0,
          status: constructionEntry.status,
        },
      }));
    } else {
      setConstructionEntries((prev) => ({
        ...prev,
        [constructionMediaPopup.workId]: {
          id: constructionEntry.id || prev[constructionMediaPopup.workId]?.id || constructionMediaPopup.workId,
          mediaCount: prev[constructionMediaPopup.workId]?.mediaCount || 0,
          status: constructionEntry.status,
        },
      }));
    }
  };

  const handleAddPersonnel = async () => {
    if (!personnelFormName.trim() || !constructionMediaPopup || !site) return;
    setPersonnelShowNameSugg(false);
    setPersonnelShowCompSugg(false);
    const entryKey = constructionMediaPopup.floorId
      ? `${constructionMediaPopup.workId}:${constructionMediaPopup.floorId}`
      : constructionMediaPopup.workId;
    const cType = activeConstructionType || "KABA_INSAAT";
    try {
      const res = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: site.id,
          blockId: effectiveBlockId,
          constructionType: cType,
          workName: constructionMediaPopup.workName,
          floorName: constructionMediaPopup.floorName,
          entryKey,
          date: personnelTodayStr(),
          personnelName: personnelFormName.trim(),
          company: personnelFormCompany.trim() || null,
          workDuration: personnelFormDuration,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPersonnelRecords((prev) => [...prev, data.entry]);
        applyPersonnelConstructionEntryProgress(data.constructionEntry);
        setPersonnelFormName("");
        setPersonnelFormCompany("");
        setPersonnelFormDuration("FULL_DAY");
        // Personel eklendiğinde başlangıç tarihi yoksa otomatik ata.
        // RACE GUARD: only auto-set when the entry has fully loaded; otherwise we might overwrite
        // a historical startDate that hadn't arrived from the API yet.
        if (!constructionEntryStartDate && constructionMediaPopup && constructionEntryLoaded) {
          // Re-verify against the server right before writing to eliminate any remaining race window.
          try {
            const floorParam = constructionMediaPopup.floorId ? `&floorId=${constructionMediaPopup.floorId}` : "";
            const checkRes = await fetch(`/api/construction/${constructionMediaPopup.workId}?blockId=${effectiveBlockId}${floorParam}`);
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.entry?.startDate) {
                setConstructionEntryStartDate(checkData.entry.startDate.slice(0, 10));
              } else {
                const today = new Date().toISOString().slice(0, 10);
                setConstructionEntryStartDate(today);
                fetch(`/api/construction/${constructionMediaPopup.workId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ entryStartDate: today, blockId: effectiveBlockId, floorId: constructionMediaPopup.floorId || null }),
                }).catch(() => {});
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Personel popup kapatılırken entry tarihlerini API'den tazele
  const closePersonnelPopup = async () => {
    setPersonnelPopupOpen(false);
    if (constructionMediaPopup && effectiveBlockId) {
      try {
        const floorParam = constructionMediaPopup.floorId ? `&floorId=${constructionMediaPopup.floorId}` : "";
        const res = await fetch(`/api/construction/${constructionMediaPopup.workId}?blockId=${effectiveBlockId}${floorParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.entry?.startDate) setConstructionEntryStartDate(data.entry.startDate.slice(0, 10));
          if (data.entry?.endDate) setConstructionEntryEndDate(data.entry.endDate.slice(0, 10));
          if (data.entry?.status) setConstructionEntryStatus(data.entry.status);
        }
      } catch {}
    }
  };

  const handleDeletePersonnel = async (id: string) => {
    try {
      const res = await fetch(`/api/personnel/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPersonnelRecords((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPersonnelHistory = async (date: string) => {
    if (!constructionMediaPopup || !site) return;
    setPersonnelHistoryLoading(true);
    const entryKey = constructionMediaPopup.floorId
      ? `${constructionMediaPopup.workId}:${constructionMediaPopup.floorId}`
      : constructionMediaPopup.workId;
    const cType = activeConstructionType || "KABA_INSAAT";
    try {
      const params = new URLSearchParams({
        siteId: site.id,
        constructionType: cType,
        entryKey,
        date,
      });
      if (effectiveBlockId) params.set("blockId", effectiveBlockId);
      const res = await fetch(`/api/personnel?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPersonnelHistoryRecords(data.entries || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPersonnelHistoryLoading(false);
    }
  };

  const openPersonnelHistory = () => {
    setPersonnelHistoryOpen(true);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");
    setPersonnelHistoryDate(yStr);
    fetchPersonnelHistory(yStr);
  };

  const changePersonnelHistoryDate = (delta: number) => {
    const d = new Date(personnelHistoryDate);
    d.setDate(d.getDate() + delta);
    const str = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    setPersonnelHistoryDate(str);
    fetchPersonnelHistory(str);
  };

  // Diğer blok önizleme popup'ı aç (read-only)
  const openOtherBlockPreview = async (workId: string, workName: string, floorName: string, blockId: string, blockName: string, floorId?: string) => {
    setOtherBlockPreviewMedias([]);
    setOtherBlockPreviewMode("grid");
    setOtherBlockPreviewIndex(0);
    setOtherBlockPreviewDates({ start: "", end: "" });
    setOtherBlockPreview({ workId, workName, floorName, blockId, blockName, floorId });
    setOtherBlockPreviewLoading(true);
    try {
      const floorParam = floorId ? `&floorId=${floorId}` : "";
      const res = await fetch(`/api/construction/${workId}?blockId=${blockId}${floorParam}`);
      if (res.ok) {
        const data = await res.json();
        setOtherBlockPreviewMedias(data.media || []);
        if (data.entry?.startDate) setOtherBlockPreviewDates(prev => ({ ...prev, start: data.entry.startDate.slice(0, 10) }));
        if (data.entry?.endDate) setOtherBlockPreviewDates(prev => ({ ...prev, end: data.entry.endDate.slice(0, 10) }));
      }
    } catch {
      setOtherBlockPreviewMedias([]);
    } finally {
      setOtherBlockPreviewLoading(false);
    }
  };

  // Kamera fonksiyonları
  const startCamera = useCallback(async (type: "photo" | "video") => {
    // Mobil/tablet cihazlarda doğrudan native kameraya yönlendir
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) {
      if (type === "photo") photoInputRef.current?.click();
      else videoInputRef.current?.click();
      return;
    }
    setCameraType(type);
    // Önceki stream varsa kapat
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: type === "video",
      });
      cameraStreamRef.current = stream;
      setCameraActive(true);
      // Video elementine bağla - DOM güncellemesini bekle
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
      // Kamera erişimi başarısız - dosya seçiciye düş
      if (type === "photo") photoInputRef.current?.click();
      else videoInputRef.current?.click();
    }
  }, []);

  const closeCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
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

  const capturePhoto = useCallback(async () => {
    if (!cameraVideoRef.current || !constructionMediaPopup || !effectiveBlockId) return;
    const video = cameraVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      closeCamera();
      setConstructionPendingFile(blob);
      setConstructionPendingFileName(`foto_${Date.now()}.jpg`);
      setConstructionMediaTitle("");
      setConstructionMediaDesc("");
    }, "image/jpeg", 0.9);
  }, [constructionMediaPopup, effectiveBlockId, closeCamera]);

  const startVideoRecording = useCallback(() => {
    if (!cameraStreamRef.current) return;
    recordedChunksRef.current = [];
    // En uyumlu format tespiti - MP4 öncelikli (tüm cihazlarda oynatılabilir)
    const supportedTypes = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    let selectedType = "";
    for (const t of supportedTypes) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
        selectedType = t;
        break;
      }
    }
    const options: MediaRecorderOptions = selectedType ? { mimeType: selectedType } : {};
    const recorder = new MediaRecorder(cameraStreamRef.current, options);
    const actualMime = recorder.mimeType;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: actualMime });
      closeCamera();
      if (!constructionMediaPopup || !effectiveBlockId) return;
      const ext = actualMime.includes("mp4") ? "mp4" : "webm";
      setConstructionPendingFile(blob);
      setConstructionPendingFileName(`video_${Date.now()}.${ext}`);
      setConstructionMediaTitle("");
      setConstructionMediaDesc("");
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000); // Her saniye veri parçası al - daha güvenilir kayıt
    setIsRecording(true);
  }, [constructionMediaPopup, effectiveBlockId, closeCamera]);

  const stopVideoRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const handleConstructionMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !constructionMediaPopup || !effectiveBlockId) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    if (files.length === 1) {
      setConstructionPendingFile(files[0]);
      setConstructionPendingFileName(files[0].name);
      setConstructionMediaTitle("");
      setConstructionMediaDesc("");
      return;
    }
    // Multiple files: upload all directly without title/desc
    setConstructionMediaUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("blockId", effectiveBlockId);
      if (constructionMediaPopup.floorId) formData.append("floorId", constructionMediaPopup.floorId);
      try {
        const res = await fetch(`/api/construction/${constructionMediaPopup.workId}`, { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          setConstructionMedias(prev => [...prev, data.media]);
          if (data.entryStatus) setConstructionEntryStatus(data.entryStatus);
          if (data.entryStartDate && !constructionEntryStartDate) setConstructionEntryStartDate(new Date(data.entryStartDate).toISOString().slice(0, 10));
          if (constructionMediaPopup!.floorId) {
            const inceKey = `${constructionMediaPopup!.workId}:${constructionMediaPopup!.floorId}`;
            setInceEntries(prev => ({
              ...prev,
              [inceKey]: {
                id: data.media?.entryId || prev[inceKey]?.id || "",
                mediaCount: (prev[inceKey]?.mediaCount || 0) + 1,
                status: data.entryStatus || prev[inceKey]?.status || "IN_PROGRESS",
              },
            }));
          } else {
            setConstructionEntries(prev => ({
              ...prev,
              [constructionMediaPopup!.workId]: {
                id: data.media?.entryId || prev[constructionMediaPopup!.workId]?.id || "",
                status: data.entryStatus || "IN_PROGRESS",
                mediaCount: (prev[constructionMediaPopup!.workId]?.mediaCount || 0) + 1,
              },
            }));
          }
        }
      } catch (err) {
        console.error("Multi upload error:", err);
      }
    }
    setConstructionMediaUploading(false);
  };

  const confirmConstructionMediaUpload = async () => {
    if (!constructionPendingFile || !constructionMediaPopup || !effectiveBlockId) return;
    setConstructionMediaUploading(true);
    const formData = new FormData();
    formData.append("file", constructionPendingFile, constructionPendingFileName || `media_${Date.now()}`);
    formData.append("blockId", effectiveBlockId);
    if (constructionMediaPopup.floorId) formData.append("floorId", constructionMediaPopup.floorId);
    if (constructionMediaTitle.trim()) formData.append("title", constructionMediaTitle.trim());
    if (constructionMediaDesc.trim()) formData.append("description", constructionMediaDesc.trim());
    try {
      const res = await fetch(`/api/construction/${constructionMediaPopup.workId}`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setConstructionMedias(prev => [...prev, data.media]);
        if (data.entryStatus) setConstructionEntryStatus(data.entryStatus);
        if (data.entryStartDate && !constructionEntryStartDate) setConstructionEntryStartDate(new Date(data.entryStartDate).toISOString().slice(0, 10));
        if (constructionMediaPopup!.floorId) {
          const inceKey = `${constructionMediaPopup!.workId}:${constructionMediaPopup!.floorId}`;
          setInceEntries(prev => ({
            ...prev,
            [inceKey]: {
              id: data.media?.entryId || prev[inceKey]?.id || "",
              mediaCount: (prev[inceKey]?.mediaCount || 0) + 1,
              status: data.entryStatus || prev[inceKey]?.status || "IN_PROGRESS",
            },
          }));
        } else {
          setConstructionEntries(prev => ({
            ...prev,
            [constructionMediaPopup!.workId]: {
              id: data.media?.entryId || prev[constructionMediaPopup!.workId]?.id || "",
              status: data.entryStatus || "IN_PROGRESS",
              mediaCount: (prev[constructionMediaPopup!.workId]?.mediaCount || 0) + 1,
            },
          }));
        }
      }
    } catch (err) {
      console.error("Construction media upload error:", err);
    } finally {
      setConstructionMediaUploading(false);
      setConstructionPendingFile(null);
      setConstructionPendingFileName("");
      setConstructionMediaTitle("");
      setConstructionMediaDesc("");
    }
  };

  const handleDeleteConstructionMedia = async (mediaId: string) => {
    if (!constructionMediaPopup) return;
    try {
      const res = await fetch(`/api/construction/${constructionMediaPopup.workId}?mediaId=${mediaId}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setConstructionMedias(prev => prev.filter(m => m.id !== mediaId));
        // Backend artık son medya silinse bile entry'nin durumunu/tarihlerini KORUYOR.
        // (entryReset her zaman false; bilinçli olarak „NOT_STARTED'a sfırla“ artık yapılmıyor.)
        if (constructionMediaPopup!.floorId) {
          const inceKey = `${constructionMediaPopup!.workId}:${constructionMediaPopup!.floorId}`;
          setInceEntries(prev => {
            const current = prev[inceKey];
            if (current && current.mediaCount > 0) {
              const newCount = current.mediaCount - 1;
              return { ...prev, [inceKey]: { ...current, mediaCount: newCount } };
            }
            return prev;
          });
        } else {
          setConstructionEntries(prev => {
            const current = prev[constructionMediaPopup!.workId];
            if (current && current.mediaCount > 0) {
              const newCount = current.mediaCount - 1;
              return { ...prev, [constructionMediaPopup!.workId]: { ...current, mediaCount: newCount } };
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error("Construction media delete error:", err);
    }
  };

  const handleUpdateConstructionMedia = async (mediaId: string, title: string, description: string) => {
    if (!constructionMediaPopup) return;
    try {
      const res = await fetch(`/api/construction/${constructionMediaPopup.workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, title: title.trim() || null, description: description.trim() || null }),
      });
      if (res.ok) {
        setConstructionMedias(prev => prev.map(m => m.id === mediaId ? { ...m, title: title.trim() || null, description: description.trim() || null } : m));
      }
    } catch (err) {
      console.error("Construction media update error:", err);
    }
    setEditingMediaId(null);
  };

  // Ruhsat-İskan: Doğrudan PDF yükleme
  const handleRuhsatUpload = async (workId: string, file: File) => {
    if (!effectiveBlockId) return;
    setRuhsatUploadingFloorId(workId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("blockId", effectiveBlockId);
    try {
      const res = await fetch(`/api/construction/${workId}`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setConstructionFloors(prev => prev.map(floor => ({
          ...floor,
          works: (floor.works || []).map((w: any) => {
            if (w.id !== workId) return w;
            const entries = w.entries?.length > 0
              ? w.entries.map((e: any) => ({ ...e, media: [...(e.media || []), data.media] }))
              : [{ id: data.media.entryId, media: [data.media] }];
            return { ...w, entries };
          }),
        })));
        setConstructionEntries(prev => ({
          ...prev,
          [workId]: {
            id: data.media?.entryId || prev[workId]?.id || "",
            status: "COMPLETED",
            mediaCount: (prev[workId]?.mediaCount || 0) + 1,
          },
        }));
      }
    } catch (err) {
      console.error("Ruhsat upload error:", err);
    } finally {
      setRuhsatUploadingFloorId(null);
    }
  };

  // Ruhsat-İskan: Dosya silme
  const handleRuhsatDelete = async (workId: string, mediaId: string) => {
    try {
      const res = await fetch(`/api/construction/${workId}?mediaId=${mediaId}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setConstructionFloors(prev => prev.map(floor => ({
          ...floor,
          works: (floor.works || []).map((w: any) => {
            if (w.id !== workId) return w;
            const entries = w.entries?.map((e: any) => ({
              ...e,
              media: (e.media || []).filter((m: any) => m.id !== mediaId),
            })) || [];
            return { ...w, entries };
          }),
        })));
        setConstructionEntries(prev => {
          const current = prev[workId];
          if (current && current.mediaCount > 0) {
            const newCount = current.mediaCount - 1;
            // Durumu koru (backend de artık tarihleri/durumu koruyor)
            return { ...prev, [workId]: { ...current, mediaCount: newCount } };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error("Ruhsat delete error:", err);
    }
  };

  // Ruhsat-İskan: Dosya adı değiştirme
  const handleRuhsatRename = async () => {
    if (!ruhsatRenamingMedia || !ruhsatRenameValue.trim()) return;
    const { mediaId, workId } = ruhsatRenamingMedia;
    try {
      const res = await fetch(`/api/construction/${workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, fileName: ruhsatRenameValue.trim() }),
      });
      if (res.ok) {
        setConstructionFloors(prev => prev.map(floor => ({
          ...floor,
          works: (floor.works || []).map((w: any) => {
            if (w.id !== workId) return w;
            const entries = w.entries?.map((e: any) => ({
              ...e,
              media: (e.media || []).map((m: any) => m.id === mediaId ? { ...m, fileName: ruhsatRenameValue.trim() } : m),
            })) || [];
            return { ...w, entries };
          }),
        })));
      }
    } catch (err) {
      console.error("Ruhsat rename error:", err);
    }
    setRuhsatRenamingMedia(null);
  };

  // Belge Tarayıcı: Fotoğraf ekleme
  const handleScannerCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setScannedImages(prev => [...prev, { data: ev.target!.result as string, name: file.name }]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // Belge Tarayıcı: Fotoğrafları PDF'e dönüştür ve yükle
  const handleScannerConvert = async (workId: string) => {
    if (scannedImages.length === 0) return;
    setScannerConverting(true);
    try {
      const { jsPDF } = await import("jspdf");

      // Fotoğrafı Canvas'a çizip normalize JPEG data URL döndür
      const normalizeImage = (src: string): Promise<{ dataUrl: string; w: number; h: number }> =>
        new Promise((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => {
            const w = img.width;
            const h = img.height;
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL("image/jpeg", 1.0);
            resolve({ dataUrl, w, h });
          };
          img.onerror = reject;
          img.src = src;
        });

      // İlk fotoğrafı yükle ve PDF oluştur
      const first = await normalizeImage(scannedImages[0].data);
      const firstOrientation = first.w > first.h ? "landscape" : "portrait";
      // Sayfa boyutunu fotoğraf oranına göre ayarla (mm cinsinden, A4 genişlik bazlı)
      const PAGE_BASE = 210; // mm
      const firstPageW = firstOrientation === "landscape" ? PAGE_BASE * (first.w / first.h) : PAGE_BASE;
      const firstPageH = firstOrientation === "landscape" ? PAGE_BASE : PAGE_BASE * (first.h / first.w);
      const pdf = new jsPDF({ orientation: firstOrientation, unit: "mm", format: [firstPageW, firstPageH] });
      pdf.addImage(first.dataUrl, "JPEG", 0, 0, firstPageW, firstPageH);

      for (let i = 1; i < scannedImages.length; i++) {
        const { dataUrl, w, h } = await normalizeImage(scannedImages[i].data);
        const orient = w > h ? "landscape" : "portrait";
        const pageW = orient === "landscape" ? PAGE_BASE * (w / h) : PAGE_BASE;
        const pageH = orient === "landscape" ? PAGE_BASE : PAGE_BASE * (h / w);
        pdf.addPage([pageW, pageH], orient);
        pdf.addImage(dataUrl, "JPEG", 0, 0, pageW, pageH);
      }

      const pdfBlob = pdf.output("blob");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const pdfFile = new window.File([pdfBlob], `Tarama_${timestamp}.pdf`, { type: "application/pdf" });
      await handleRuhsatUpload(workId, pdfFile);
      setScannedImages([]);
      setScannerMode(false);
    } catch (err) {
      console.error("PDF dönüştürme hatası:", err);
      alert("PDF dönüştürme sırasında hata oluştu.");
    } finally {
      setScannerConverting(false);
    }
  };

  const handleAddFloorAttachment = async () => {
    if (!attachingFloor || !floorAttachDoc || !attachPage) return;
    try {
      const res = await fetch("/api/floor-attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floorId: attachingFloor.id, documentId: floorAttachDoc.id, pageNumber: Number(attachPage) }),
      });
      if (res.ok) {
        fetchFloorAttachments(floorAttachDoc.id);
        setAttachingFloor(null);
        setAttachPage("");
      } else {
        const err = await res.json();
        alert(err.error || "Bağlantı eklenemedi");
      }
    } catch {
      alert("Bağlantı eklenemedi");
    }
  };

  const handleRemoveFloorAttachment = async (id: string) => {
    try {
      await fetch(`/api/floor-attachments?id=${id}`, { method: "DELETE" });
      if (floorAttachDoc) fetchFloorAttachments(floorAttachDoc.id);
    } catch { /* ignore */ }
  };

  // handleDeleteGroupDoc defined above with handleDeleteDocument

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getStatusColor = (progress: number) => {
    if (progress === 100) return "bg-[#27ae60]";
    if (progress > 0) return "bg-[#f39c12]";
    return "bg-[#c0392b]";
  };

  const getStatusBg = (progress: number) => {
    if (progress === 100) return "bg-[#27ae60]";
    if (progress > 0) return "bg-gradient-to-br from-[#f39c12] to-[#e67e22]";
    return "bg-[#c0392b]";
  };

  const formatDate = (date: string) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  if (loading || !site) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
      </div>
    );
  }

  // Ana kategorileri göster
  const siteCategories = site.categories.filter(
    (c) => !c.config?.scope || c.config?.scope !== "block"
  );
  const blockCategories = site.categories.filter(
    (c) => c.config?.scope === "block"
  );
  const currentCategories = activeCategory ? activeCategory.subCategories : [];
  const currentWorkItems = activeCategory ? activeCategory.workItems : [];

  // Aktif kategorinin alt kırılımlarını checklist formatına çevir
  const categoryChecklistTemplates = activeCategory && activeCategory.subCategories.length > 0
    ? activeCategory.subCategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        children: (sub.subCategories || []).map((child) => ({ id: child.id, name: child.name })),
      }))
    : checklistTemplates;

  // Sayfa başlığı
  const pageTitle = activeCategory
    ? `${site.name} - ${breadcrumb.map((b) => b.name).join(" - ")}`
    : site.name;

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Üst Bar - MeşaleGrup Tarzı */}
      <div className="bg-white rounded-xl shadow-sm border-2 border-black overflow-hidden">
        <div className="flex items-center gap-2 p-3 sm:p-4">
          {/* Logo */}
          <div className="flex-shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#c0392b] rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 64 64" className="w-5 h-5 sm:w-6 sm:h-6">
                <path d="M32 8 L28 28 L20 48 L32 40 L44 48 L36 28 Z" fill="white" />
              </svg>
            </div>
          </div>

          {/* Başlık */}
          <div className="flex-1 min-w-0 text-center">
            <h1 className="text-xs sm:text-lg md:text-xl font-bold leading-tight truncate">
              {site.name}
              {activeBlock && (
                <>
                  {" - "}
                  <span className="text-[#c0392b]">{activeBlock.name}</span>
                </>
              )}
              {activeConstructionType && (
                <>
                  {" - "}
                  {activeConstructionType === "KABA_INSAAT" ? "Kaba İnşaat" : activeConstructionType === "PEYZAJ" ? "Peyzaj" : activeConstructionType === "BINA_GENEL" ? "Bina Genel" : activeConstructionType === "RUHSAT_ISKAN" ? "Belgeler" : "İnce İnşaat"}
                </>
              )}
              {activeConstructionType === "INCE_INSAAT" && inceViewMode && inceViewMode !== "select" && (
                <>
                  {" - "}
                  {inceViewMode === "daire_bazinda" ? "Daire Bazında" : "İş Bazında"}
                </>
              )}
              {activeConstructionType === "INCE_INSAAT" && inceViewMode === "daire_bazinda" && selectedInceDaire && (
                <>
                  {" - "}
                  <span className="text-teal-600">{selectedInceDaire.name}</span>
                </>
              )}
              {activeConstructionType === "INCE_INSAAT" && inceViewMode === "is_bazinda" && selectedInceWork && (
                <>
                  {" - "}
                  <span className="text-indigo-600">{selectedInceWork.name}</span>
                </>
              )}
              {activeCategory && (
                <>
                  {" - "}
                  {breadcrumb.map((b) => b.name).join(" - ")}
                </>
              )}
            </h1>
          </div>
        </div>
      </div>

      {/* Navigasyon Butonları */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {(activeCategory || activeBlock || activeConstructionType) ? (
          <>
            <button
              onClick={goHome}
              className="px-4 py-2 bg-[#c0392b] text-white rounded-lg text-sm font-medium hover:bg-[#922b21] transition-all"
            >
              Anasayfa
            </button>
            <button
              onClick={navigateBack}
              className="px-4 py-2 bg-[#c0392b] text-white rounded-lg text-sm font-medium hover:bg-[#922b21] transition-all"
            >
              Geri
            </button>
          </>
        ) : (
          <>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2a4a6f] transition-all flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Ana Sayfa
            </Link>
            <Link
              href="/dashboard/sites"
              className="px-4 py-2 bg-[#c0392b] text-white rounded-lg text-sm font-medium hover:bg-[#922b21] transition-all flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Şantiyeler
            </Link>
          </>
        )}
        {searchParams.get("returnDate") && (
          <button
            onClick={() => router.push(`/dashboard?returnDate=${searchParams.get("returnDate")}`)}
            className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2a4a6f] transition-all flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Panele Dön
          </button>
        )}

        {/* Breadcrumb */}
        {(breadcrumb.length > 0 || activeBlock || activeConstructionType) && (
          <div className="flex flex-wrap items-center gap-1 text-[10px] sm:text-sm text-gray-500">
            <button
              onClick={goHome}
              className="hover:text-[#c0392b] cursor-pointer truncate max-w-[80px] sm:max-w-none"
            >
              {site.name}
            </button>
            {activeBlock && (
              <span className="flex items-center gap-1">
                <ChevronRight size={14} />
                <button
                  onClick={() => { setActiveCategory(null); setBreadcrumb([]); setCategoryDocuments([]); }}
                  className={`hover:text-[#c0392b] cursor-pointer ${!activeCategory ? "font-semibold text-gray-800" : ""}`}
                >
                  {activeBlock.name}
                </button>
              </span>
            )}
            {!activeBlock && activeConstructionType === "PEYZAJ" && (
              <span className="flex items-center gap-1">
                <ChevronRight size={14} />
                <span className="font-semibold text-gray-800">Peyzaj</span>
              </span>
            )}
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight size={14} />
                <button
                  onClick={() => navigateToBreadcrumb(i)}
                  className={`hover:text-[#c0392b] cursor-pointer ${i === breadcrumb.length - 1 ? "font-semibold text-gray-800" : ""}`}
                >
                  {b.name}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Ana Sayfa - Site kategorileri + Bloklar */}
      {!activeCategory && !activeBlock && !activeConstructionType && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 site-cards-grid">
          {siteCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => navigateToCategory(cat)}
              className="pressable pressable-dark bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover text-center group"
            >
              <div className="w-12 h-12 mx-auto mb-3 bg-[#1a1a2e] rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
                <Building2 size={24} />
              </div>
              <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
                {cat.name}
              </p>
              {cat.subCategories?.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">{cat.subCategories.length} alt kategori</p>
              )}
            </button>
          ))}
          {site.blocks.map((block) => {
            const bp = blockProgress[block.id];
            const pct = bp?.percent ?? 0;
            return (
            <button
              key={block.id}
              type="button"
              onClick={() => setActiveBlock(block)}
              className="pressable pressable-dark bg-white rounded-xl shadow-sm border border-gray-100 text-center flex flex-col card-hover group"
            >
              <div className="p-5 text-center w-full">
                <div className="w-12 h-12 mx-auto mb-3 bg-[#1a1a2e] rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
                  <Building2 size={24} />
                </div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
                  {block.name}
                </p>
                <p className="text-xs text-gray-400 mt-1">{block.floors.length} kat</p>
                <AnimatedProgress pct={pct} completed={bp?.completed} total={bp?.total} />
              </div>
            </button>
            );
          })}
          {/* Peyzaj kartı */}
          <button
            onClick={() => { setActiveConstructionType("PEYZAJ"); fetchConstructionData(params.id as string, "PEYZAJ"); }}
            className="pressable pressable-dark bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-green-600 rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
              <Trees size={24} />
            </div>
            <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
              Peyzaj
            </p>
          </button>
          {/* Metraj Bilgisi kartı */}
          <button
            onClick={() => {
              const existing = (site?.config?.metraj as MetrajItem[] | undefined) || [];
              setMetrajItems(Array.isArray(existing) ? existing.map((it) => ({ ...it })) : []);
              setMetrajSaveError("");
              setMetrajModalOpen(true);
            }}
            className="pressable pressable-dark bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-orange-500 rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
              <FileText size={24} />
            </div>
            <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
              Metraj Bilgisi
            </p>
          </button>
        </div>
      )}

      {/* Blok İçi - Sabit 4 Kart (Belgeler / Kaba / İnce / Bina Genel) */}
      {!activeCategory && activeBlock && !activeConstructionType && (() => {
        const bp = blockProgress[activeBlock.id];
        const byType = bp?.byType || {};
        const cards: Array<{
          key: "RUHSAT_ISKAN" | "KABA_INSAAT" | "INCE_INSAAT" | "BINA_GENEL";
          label: string;
          icon: React.ReactNode;
          iconBg: string;
          accent: string;
          accentBar: string;
        }> = [
          { key: "RUHSAT_ISKAN", label: "Belgeler", icon: <FileText size={28} />, iconBg: "bg-purple-600", accent: "text-purple-700", accentBar: "bg-purple-500" },
          { key: "KABA_INSAAT", label: "Kaba İnşaat", icon: <Hammer size={28} />, iconBg: "bg-amber-600", accent: "text-amber-700", accentBar: "bg-amber-500" },
          { key: "BINA_GENEL", label: "Bina Genel", icon: <Building2 size={28} />, iconBg: "bg-gray-700", accent: "text-gray-800", accentBar: "bg-gray-600" },
          { key: "INCE_INSAAT", label: "İnce İnşaat", icon: <Paintbrush size={28} />, iconBg: "bg-teal-600", accent: "text-teal-700", accentBar: "bg-teal-500" },
        ];
        const onCardClick = (key: typeof cards[number]["key"]) => {
          setActiveConstructionType(key);
          if (key === "INCE_INSAAT") setInceViewMode("select");
          fetchConstructionData(activeBlock!.id, key);
        };
        return (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {cards.map((c) => {
              // Belgeler için ilerleme yüzdesi yok (RUHSAT_ISKAN entry tabanlı değil).
              const tp = c.key === "RUHSAT_ISKAN" ? null : byType[c.key];
              const pct = tp?.percent ?? 0;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onCardClick(c.key)}
                  className="pressable pressable-dark bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover text-center group flex flex-col"
                >
                  <div className={`w-14 h-14 mx-auto mb-3 ${c.iconBg} rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all`}>
                    {c.icon}
                  </div>
                  <p className={`text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all`}>
                    {c.label}
                  </p>
                  {tp ? (
                    <AnimatedProgress pct={pct} completed={tp.completed} total={tp.total} accent={c.accent} />
                  ) : (
                    <div className="mt-3 text-[11px] text-gray-400">Belge yönetimi</div>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* İnce İnşaat UI */}
      {!activeCategory && activeBlock && activeConstructionType === "INCE_INSAAT" && (
        <div className="space-y-4">
          {constructionLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
            </div>
          ) : inceViewMode === "select" ? (
            /* Mod Seçimi: Daire Bazında / İş Bazında */
            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
              <button
                onClick={() => setInceViewMode("daire_bazinda")}
                className="pressable pressable-dark bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover text-center group"
              >
                <div className="w-14 h-14 mx-auto mb-3 bg-teal-600 rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
                  <Building2 size={28} />
                </div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
                  Daire Bazında
                </p>
                <p className="text-xs text-gray-400 mt-1">Önce daire seç, sonra iş</p>
              </button>
              <button
                onClick={() => setInceViewMode("is_bazinda")}
                className="pressable pressable-dark bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover text-center group"
              >
                <div className="w-14 h-14 mx-auto mb-3 bg-indigo-600 rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
                  <Hammer size={28} />
                </div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
                  İş Bazında
                </p>
                <p className="text-xs text-gray-400 mt-1">Önce iş seç, sonra daire</p>
              </button>
            </div>
          ) : (inceDaires.length === 0 || constructionFloors.flatMap((f: any) => f.works || []).length === 0) ? (
            /* Veri yok uyarısı */
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <Hammer size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">Henüz İnce İnşaat yapılandırması yapılmamış</p>
              <p className="text-gray-400 text-sm mt-1">Ayarlar sayfasından daire ve iş kalemlerini tanımlayın</p>
            </div>
          ) : inceViewMode === "daire_bazinda" && !selectedInceDaire ? (
            /* Daire Bazında - Daire Grid (4 sütun, dikey akış) */
            (() => {
              const allFloorWorks = constructionFloors.flatMap((f: any) => f.works || []).sort((a: any, b: any) => a.order - b.order);
              // Determine per-daire work names
              const perDaireNames = new Set<string>();
              for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
              const baseWorks = allFloorWorks.filter((w: any) => !perDaireNames.has(w.name));
              // Helper: get works for a specific daire
              const getWorksForDaire = (daireId: string) => {
                const ov = inceUnitOverrides[daireId] || { added: [], removed: [] };
                const filtered = baseWorks.filter((w: any) => !(ov.removed || []).includes(w.name));
                const added = allFloorWorks.filter((w: any) => (ov.added || []).includes(w.name));
                return [...filtered, ...added];
              };
              const cols = isMobile ? 2 : 4;
              const rows = Math.ceil(inceDaires.length / cols);
              return (
                <div className="overflow-x-auto">
                  <div className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-center text-base border-2 border-[#1e3a5f]">
                    Daireler
                  </div>
                  <div
                    className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2 ince-insaat-grid"
                    style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {inceDaires.map((daire) => {
                      const daireWorks = getWorksForDaire(daire.id);
                      const totalWorks = daireWorks.length;
                      const completedWorks = daireWorks.filter((w: any) => {
                        const key = `${w.id}:${daire.id}`;
                        const e = inceEntries[key];
                        return e && e.status === "COMPLETED";
                      }).length;
                      const startedWorks = daireWorks.filter((w: any) => {
                        const key = `${w.id}:${daire.id}`;
                        const e = inceEntries[key];
                        return e && (e.status !== "NOT_STARTED" || e.mediaCount > 0);
                      }).length;
                      const allCompleted = completedWorks > 0 && completedWorks === totalWorks;
                      const hasAnyStarted = startedWorks > 0;
                      const btnColor = allCompleted ? "bg-green-500 text-white hover:bg-green-600" : hasAnyStarted ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                      return (
                        <button
                          key={daire.id}
                          onClick={() => setSelectedInceDaire(daire)}
                          className={`construction-cell-btn p-3 text-center transition-all rounded-lg shadow-sm ${btnColor}`}
                        >
                          <span className="block font-bold text-sm">{daire.name}</span>
                          <span className={`block text-xs italic mt-1 ${allCompleted || hasAnyStarted ? "text-white/80" : "text-green-600"}`}>Tamamlanan {completedWorks} / {totalWorks}</span>
                          <span className={`block text-xs italic ${allCompleted || hasAnyStarted ? "text-white/60" : "text-red-400"}`}>Bekleyen {totalWorks - completedWorks}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : inceViewMode === "daire_bazinda" && selectedInceDaire ? (
            /* Daire Bazında - Seçilen Daire İçin İşler (4 sütun, dikey akış) */
            (() => {
              const allFloorWorks = constructionFloors.flatMap((f: any) => f.works || []).sort((a: any, b: any) => a.order - b.order);
              const perDaireNames = new Set<string>();
              for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
              const baseWorks = allFloorWorks.filter((w: any) => !perDaireNames.has(w.name));
              const ov = inceUnitOverrides[selectedInceDaire.id] || { added: [], removed: [] };
              const filtered = baseWorks.filter((w: any) => !(ov.removed || []).includes(w.name));
              const added = allFloorWorks.filter((w: any) => (ov.added || []).includes(w.name));
              const daireWorks = [...filtered, ...added];
              const cols = isMobile ? 2 : 4;
              const rows = Math.ceil(daireWorks.length / cols);
              return (
                <div className="overflow-x-auto">
                  <div className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-center text-base border-2 border-[#1e3a5f]">
                    İşler
                  </div>
                  <div
                    className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2 ince-insaat-grid"
                    style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {daireWorks.map((work: any) => {
                      const key = `${work.id}:${selectedInceDaire.id}`;
                      const entry = inceEntries[key];
                      const hasMedia = entry && entry.mediaCount > 0;
                      const entryStatus = entry?.status || "NOT_STARTED";
                      const hasStarted = entryStatus !== "NOT_STARTED" || hasMedia;
                      const btnColor = entryStatus === "COMPLETED" ? "bg-green-500 text-white hover:bg-green-600" : hasStarted ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                      return (
                        <button
                          key={work.id}
                          onClick={() => openConstructionMedia(work.id, work.name, selectedInceDaire.name, selectedInceDaire.id)}
                          className={`construction-cell-btn p-2 transition-all rounded-lg shadow-sm flex items-center gap-1.5 ${btnColor}`}
                        >
                          <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${entryStatus !== "NOT_STARTED" ? "bg-white/30" : "bg-[#1e3a5f] text-white"}`}>{work.order !== undefined ? work.order + 1 : ''}</span>
                          <span className="flex-1 text-left">
                            <span className="block font-bold text-base">{work.name}</span>
                            <span className={`block text-xs mt-0.5 italic ${entryStatus !== "NOT_STARTED" ? "text-white/70" : "text-gray-400"}`}>{selectedInceDaire.name}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : inceViewMode === "is_bazinda" && !selectedInceWork ? (
            /* İş Bazında - İş Listesi (4 sütun, dikey akış) - Tüm dairelerdeki tüm benzersiz işler */
            (() => {
              const allFloorWorks = constructionFloors.flatMap((f: any) => f.works || []).sort((a: any, b: any) => a.order - b.order);
              const perDaireNames = new Set<string>();
              for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
              const baseWorks = allFloorWorks.filter((w: any) => !perDaireNames.has(w.name));
              // Collect all unique work names across all daires
              const allWorkNames = new Map<string, { id: string; name: string; order: number }>();
              for (const bw of baseWorks) {
                allWorkNames.set(bw.name, { id: bw.id, name: bw.name, order: bw.order });
              }
              for (const daire of inceDaires) {
                for (const addedName of (inceUnitOverrides[daire.id]?.added || [])) {
                  if (!allWorkNames.has(addedName)) {
                    const found = allFloorWorks.find((w: any) => w.name === addedName);
                    if (found) allWorkNames.set(addedName, { id: found.id, name: found.name, order: found.order });
                  }
                }
              }
              const allWorks = Array.from(allWorkNames.values()).sort((a, b) => a.order - b.order);

              // Helper: which daires have this work
              const getDairesForWork = (workName: string) => {
                return inceDaires.filter((d) => {
                  const ov = inceUnitOverrides[d.id] || { added: [], removed: [] };
                  if (perDaireNames.has(workName)) return (ov.added || []).includes(workName);
                  return !(ov.removed || []).includes(workName);
                });
              };

              const cols = isMobile ? 2 : 4;
              const rows = Math.ceil(allWorks.length / cols);
              return (
                <div className="overflow-x-auto">
                  <div className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-center text-base border-2 border-[#1e3a5f]">
                    İnce İşler
                  </div>
                  <div
                    className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2 ince-insaat-grid"
                    style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {allWorks.map((work) => {
                      const workDaires = getDairesForWork(work.name);
                      const totalDaires = workDaires.length;
                      const completedDaires = workDaires.filter((daire) => {
                        const key = `${work.id}:${daire.id}`;
                        const e = inceEntries[key];
                        return e && e.status === "COMPLETED";
                      }).length;
                      const startedDaires = workDaires.filter((daire) => {
                        const key = `${work.id}:${daire.id}`;
                        const e = inceEntries[key];
                        return e && (e.status !== "NOT_STARTED" || e.mediaCount > 0);
                      }).length;
                      const allCompleted = completedDaires > 0 && completedDaires === totalDaires;
                      const hasAnyStarted = startedDaires > 0;
                      const btnColor = allCompleted ? "bg-green-500 text-white hover:bg-green-600" : hasAnyStarted ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                      return (
                        <button
                          key={work.id}
                          onClick={() => setSelectedInceWork(work)}
                          className={`construction-cell-btn p-2 transition-all rounded-lg shadow-sm flex items-center gap-1.5 ${btnColor}`}
                        >
                          <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${allCompleted || hasAnyStarted ? "bg-white/30" : "bg-[#1e3a5f] text-white"}`}>{work.order !== undefined ? work.order + 1 : ''}</span>
                          <span className="flex-1 text-left">
                            <span className="block font-bold text-base">{work.name}</span>
                            <span className={`block text-xs italic mt-0.5 ${allCompleted || hasAnyStarted ? "text-white/80" : "text-green-600"}`}>Tamamlanan {completedDaires} Daire</span>
                            <span className={`block text-xs italic ${allCompleted || hasAnyStarted ? "text-white/60" : "text-red-400"}`}>Bekleyen {totalDaires - completedDaires} Daire</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : inceViewMode === "is_bazinda" && selectedInceWork ? (
            /* İş Bazında - Seçilen İş İçin Daire Grid (yalnızca bu işe sahip daireler, 4 sütun, dikey akış) */
            (() => {
              const allFloorWorks = constructionFloors.flatMap((f: any) => f.works || []);
              const perDaireNames = new Set<string>();
              for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
              // Filter daires to only those that have this work
              const workDaires = inceDaires.filter((daire) => {
                const ov = inceUnitOverrides[daire.id] || { added: [], removed: [] };
                if (perDaireNames.has(selectedInceWork.name)) return (ov.added || []).includes(selectedInceWork.name);
                return !(ov.removed || []).includes(selectedInceWork.name);
              });
              const cols = isMobile ? 2 : 4;
              const rows = Math.ceil(workDaires.length / cols);
              return (
                <div className="overflow-x-auto">
                  <div className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-center text-base border-2 border-[#1e3a5f]">
                    Daireler — {selectedInceWork.name}
                  </div>
                  <div
                    className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2 ince-insaat-grid"
                    style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {workDaires.map((daire) => {
                      const key = `${selectedInceWork.id}:${daire.id}`;
                      const entry = inceEntries[key];
                      const hasMedia = entry && entry.mediaCount > 0;
                      const entryStatus = entry?.status || "NOT_STARTED";
                      const hasStarted = entryStatus !== "NOT_STARTED" || hasMedia;
                      const btnColor = entryStatus === "COMPLETED" ? "bg-green-500 text-white hover:bg-green-600" : hasStarted ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                      return (
                        <button
                          key={daire.id}
                          onClick={() => openConstructionMedia(selectedInceWork.id, selectedInceWork.name, daire.name, daire.id)}
                          className={`construction-cell-btn p-3 text-center transition-all rounded-lg shadow-sm ${btnColor}`}
                        >
                          <span className="block font-bold text-sm">{daire.name}</span>
                          <span className={`block text-[10px] mt-1 italic ${entryStatus !== "NOT_STARTED" ? "text-white/70" : "text-gray-400"}`}>{selectedInceWork.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : null}
        </div>
      )}

      {/* Diğer Blokları Göster/Kaldır butonu - İnce İşler İş Bazında */}
      {!activeCategory && activeBlock && activeConstructionType === "INCE_INSAAT" && inceViewMode === "is_bazinda" && !selectedInceWork && site && site.blocks.length > 1 && !constructionLoading && constructionFloors.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={async () => {
              if (showOtherBlocks) {
                setShowOtherBlocks(false);
                setOtherBlocksData([]);
              } else {
                setShowOtherBlocks(true);
                await fetchOtherBlocksData(activeBlock.id, "INCE_INSAAT");
              }
            }}
            className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2a4a6f] transition-all"
          >
            {showOtherBlocks ? "Diğer Blokları Kaldır" : "Diğer Blokları Göster"}
          </button>
        </div>
      )}

      {/* Diğer Bloklar Read-Only (İnce İşler İş Bazında) */}
      {showOtherBlocks && activeConstructionType === "INCE_INSAAT" && inceViewMode === "is_bazinda" && !selectedInceWork && (
        <div className="space-y-4">
          {otherBlocksLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#1e3a5f] border-t-transparent"></div>
            </div>
          ) : otherBlocksData.map((ob) => {
            const allWorks = ob.floors.flatMap((f: any) => f.works || []);
            const cols = isMobile ? 2 : 4;
            const rows = Math.ceil(allWorks.length / cols);
            const obDaires = ob.daires || [];
            const obInceEntries = ob.inceEntries || {};
            return (
              <div key={ob.blockId} className="opacity-75">
                <div className="bg-gray-600 text-white px-4 py-2 font-bold text-center text-sm rounded-t-xl">{ob.blockName} - İnce İşler</div>
                {allWorks.length > 0 ? (
                  <div className="overflow-x-auto">
                    <div
                      className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2 ince-insaat-grid"
                      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                    >
                      {allWorks.map((work: any) => {
                        const totalDaires = obDaires.length;
                        const completedDaires = obDaires.filter((daire: any) => {
                          const key = `${work.id}:${daire.id}`;
                          const e = obInceEntries[key];
                          return e && e.status === "COMPLETED";
                        }).length;
                        const startedDaires = obDaires.filter((daire: any) => {
                          const key = `${work.id}:${daire.id}`;
                          const e = obInceEntries[key];
                          return e && (e.status !== "NOT_STARTED" || e.mediaCount > 0);
                        }).length;
                        const allCompleted = completedDaires > 0 && completedDaires === totalDaires;
                        const hasAnyStarted = startedDaires > 0;
                        const btnColor = allCompleted ? "bg-green-500 text-white" : hasAnyStarted ? "bg-yellow-500 text-white" : "bg-gray-100 text-gray-600 border border-gray-200";
                        return (
                          <div
                            key={work.id}
                            onClick={() => setOtherBlockInceDairePopup({ workId: work.id, workName: work.name, blockId: ob.blockId, blockName: ob.blockName, daires: obDaires, inceEntries: obInceEntries })}
                            className={`p-2 cursor-pointer rounded-lg shadow-sm flex items-center gap-1.5 hover:ring-2 hover:ring-gray-400 transition-all ${btnColor}`}
                          >
                            <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${allCompleted || hasAnyStarted ? "bg-white/30" : "bg-gray-400 text-white"}`}>{work.order !== undefined ? work.order + 1 : ''}</span>
                            <span className="flex-1 text-left">
                              <span className="block font-bold text-base">{work.name}</span>
                              <span className={`block text-xs italic mt-0.5 ${allCompleted || hasAnyStarted ? "text-white/80" : "text-green-600"}`}>Tamamlanan {completedDaires} Daire</span>
                              <span className={`block text-xs italic ${allCompleted || hasAnyStarted ? "text-white/60" : "text-red-400"}`}>Bekleyen {totalDaires - completedDaires} Daire</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-[#1e3a5f] border-t-0 p-4 text-center text-gray-400 text-sm">Veri yok</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ruhsat-İskan Dosya Alanları */}
      {!activeCategory && activeBlock && activeConstructionType === "RUHSAT_ISKAN" && (
        <div className="space-y-3">
          {constructionLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
            </div>
          ) : constructionFloors.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <Layers size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">Henüz belge yapılandırması yapılmamış</p>
              <p className="text-gray-400 text-sm mt-1">Ayarlar sayfasından şantiye düzenleme ekranını kullanarak grup ve maddeleri tanımlayın</p>
            </div>
          ) : isMobile ? (
            <MobileConstructionView
              floors={constructionFloors as any}
              getEntry={(id) => constructionEntries[id]}
              onCellClick={(w, f) => setRuhsatActiveWork({ workId: w.id, workName: w.name, floorName: f.name })}
              title="Belgeler"
            />
          ) : (() => {
            const maxWorks = Math.max(...constructionFloors.map((f: any) => (f.works || []).length), 0);
            const cumulativeOffsets: number[] = [];
            let cumSum = 0;
            for (const f of constructionFloors) {
              cumulativeOffsets.push(cumSum);
              cumSum += (f as any).works?.length || 0;
            }
            return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {constructionFloors.map((floor: any) => (
                        <th key={floor.id} className="bg-[#1e3a5f] text-white px-4 py-3 font-semibold text-sm text-center border-r border-[#152d4a] last:border-r-0" style={{width: `${100/constructionFloors.length}%`}}>
                          {floor.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxWorks }, (_, rowIdx) => (
                      <tr key={rowIdx} className={rowIdx < maxWorks - 1 ? "border-b border-gray-100" : ""}>
                        {constructionFloors.map((floor: any, colIdx: number) => {
                          const work = (floor.works || [])[rowIdx];
                          if (!work) return <td key={`${floor.id}-empty-${rowIdx}`} className="p-1.5"></td>;
                          const num = cumulativeOffsets[colIdx] + rowIdx + 1;
                          const entry = constructionEntries[work.id];
                          const hasMedia = entry && entry.mediaCount > 0;
                          const entryStatus = entry?.status || "NOT_STARTED";
                          const hasStarted = entryStatus !== "NOT_STARTED" || hasMedia;
                          const btnColor = entryStatus === "COMPLETED" ? "bg-green-500 text-white hover:bg-green-600 shadow-sm" : hasStarted ? "bg-yellow-500 text-white hover:bg-yellow-600 shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                          return (
                            <td key={work.id} className="p-1.5">
                              <button
                                onClick={() => setRuhsatActiveWork({ workId: work.id, workName: work.name, floorName: floor.name })}
                                className={`w-full px-2 py-2 rounded-lg text-sm font-medium transition-all leading-tight flex items-center gap-1.5 ${btnColor}`}
                              >
                                <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${hasStarted ? "bg-white/30" : "bg-[#1e3a5f] text-white"}`}>{num}</span>
                                <span className="flex-1 text-left">
                                  <span className="block">{work.name}</span>
                                  {hasMedia && (
                                    <span className="block text-[10px] opacity-80 mt-0.5">({entry.mediaCount})</span>
                                  )}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}
        </div>
      )}

      {/* Diğer Blokları Göster/Kaldır butonu - Ruhsat-İskan */}
      {!activeCategory && activeBlock && activeConstructionType === "RUHSAT_ISKAN" && site && site.blocks.length > 1 && constructionFloors.length > 0 && !constructionLoading && (
        <div className="flex justify-end">
          <button
            onClick={async () => {
              if (showOtherBlocks) {
                setShowOtherBlocks(false);
                setOtherBlocksData([]);
              } else {
                setShowOtherBlocks(true);
                await fetchOtherBlocksData(activeBlock.id, "RUHSAT_ISKAN");
              }
            }}
            className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2a4a6f] transition-all"
          >
            {showOtherBlocks ? "Diğer Blokları Kaldır" : "Diğer Blokları Göster"}
          </button>
        </div>
      )}

      {/* Diğer Bloklar Read-Only (Ruhsat-İskan) */}
      {showOtherBlocks && activeConstructionType === "RUHSAT_ISKAN" && (
        <div className="space-y-4">
          {otherBlocksLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#1e3a5f] border-t-transparent"></div>
            </div>
          ) : otherBlocksData.map((ob) => {
            const maxWorks = Math.max(...ob.floors.map((f: any) => (f.works || []).length), 0);
            const cumulativeOffsets: number[] = [];
            let cumSum = 0;
            for (const f of ob.floors) {
              cumulativeOffsets.push(cumSum);
              cumSum += (f as any).works?.length || 0;
            }
            return (
              <div key={ob.blockId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden opacity-75">
                <div className="bg-gray-600 text-white px-4 py-2 font-semibold text-sm text-center">{ob.blockName} - Belgeler</div>
                {isMobile && (
                  <div className="p-2">
                    <MobileConstructionView
                      floors={ob.floors as any}
                      getEntry={(id) => ob.entries[id]}
                      onCellClick={(w, f) => openOtherBlockPreview(w.id, w.name, f.name, ob.blockId, ob.blockName)}
                      title={`${ob.blockName} - Belgeler`}
                      readOnly
                      muted
                    />
                  </div>
                )}
                <div className={`overflow-x-auto ${isMobile ? "hidden" : ""}`}>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {ob.floors.map((floor: any) => (
                          <th key={floor.id} className="bg-gray-500 text-white px-4 py-3 font-semibold text-sm text-center border-r border-gray-400 last:border-r-0" style={{width: `${100/ob.floors.length}%`}}>
                            {floor.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxWorks }, (_, rowIdx) => (
                        <tr key={rowIdx} className={rowIdx < maxWorks - 1 ? "border-b border-gray-100" : ""}>
                          {ob.floors.map((floor: any, colIdx: number) => {
                            const work = (floor.works || [])[rowIdx];
                            if (!work) return <td key={`${floor.id}-empty-${rowIdx}`} className="p-1.5"></td>;
                            const num = cumulativeOffsets[colIdx] + rowIdx + 1;
                            const entry = ob.entries[work.id];
                            const hasMedia = entry && entry.mediaCount > 0;
                            const entryStatus = entry?.status || "NOT_STARTED";
                            const hasStarted = entryStatus !== "NOT_STARTED" || hasMedia;
                            const btnColor = entryStatus === "COMPLETED"
                              ? hasMedia ? "bg-green-400 text-white cursor-pointer hover:bg-green-500" : "bg-green-400 text-white cursor-default"
                              : hasStarted
                                ? hasMedia ? "bg-yellow-400 text-white cursor-pointer hover:bg-yellow-500" : "bg-yellow-400 text-white cursor-default"
                                : "bg-gray-100 text-gray-500 border border-gray-200 cursor-default";
                            return (
                              <td key={work.id} className="p-1.5">
                                <div
                                  onClick={() => hasMedia ? openOtherBlockPreview(work.id, work.name, floor.name, ob.blockId, ob.blockName) : undefined}
                                  className={`w-full px-2 py-2 rounded-lg text-sm font-medium leading-tight flex items-center gap-1.5 ${btnColor}`}
                                >
                                  <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${hasStarted ? "bg-white/30" : "bg-gray-400 text-white"}`}>{num}</span>
                                  <span className="flex-1 text-left">
                                    <span className="block">{work.name}</span>
                                    {hasMedia && <span className="block text-[10px] opacity-80 mt-0.5">({entry.mediaCount})</span>}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ruhsat-İskan Dosya Popup */}
      {ruhsatActiveWork && (() => {
        const activeFloor = constructionFloors.find((f: any) => (f.works || []).some((w: any) => w.id === ruhsatActiveWork.workId));
        const activeWork = activeFloor?.works?.find((w: any) => w.id === ruhsatActiveWork.workId);
        const medias: any[] = activeWork?.entries?.flatMap((e: any) => e.media || []) || [];
        const isUploading = ruhsatUploadingFloorId === ruhsatActiveWork.workId;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setRuhsatActiveWork(null); setScannerMode(false); setScannedImages([]); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <div>
                  <p className="text-xs text-gray-400">{ruhsatActiveWork.floorName}</p>
                  <h3 className="text-base font-bold text-gray-800">{ruhsatActiveWork.workName}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setScannerMode(true); setScannedImages([]); }}
                    className="belge-upload-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-medium text-[11px] cursor-pointer transition-all border bg-[#2980b9] text-white border-[#2980b9] hover:bg-[#2471a3]"
                  >
                    <Camera size={11} /> Belge Tara
                  </button>
                  <label className={`belge-upload-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-medium text-[11px] cursor-pointer transition-all border ${
                    isUploading ? "bg-gray-100 text-gray-400 border-gray-200" : "bg-[#c0392b] text-white border-[#c0392b] hover:bg-[#a93226]"
                  }`}>
                    {isUploading ? (
                      <><div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div> Yükleniyor...</>
                    ) : (
                      <><Upload size={11} /> Dosya Yükle</>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.bmp,.webp,.svg,.heic,.heif,.mp3,.mp4,.mov,.webm,.avi,.mkv,.wav,.ogg,.flac,.aac,.zip,.rar,.7z,.dwg,.dxf,.tiff,.tif"
                      className="hidden"
                      disabled={isUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleRuhsatUpload(ruhsatActiveWork.workId, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button onClick={() => { setRuhsatActiveWork(null); setScannerMode(false); setScannedImages([]); }} className="text-gray-400 hover:text-gray-600 p-1">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {scannerMode ? (
                  <div className="space-y-4">
                    <input
                      ref={scannerInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={handleScannerCapture}
                    />
                    {scannedImages.length > 0 ? (
                      <>
                        <div className="space-y-2">
                          {scannedImages.map((img, idx) => (
                            <div
                              key={idx}
                              className={`relative flex items-center gap-2 bg-gray-50 rounded-lg border p-1.5 transition-colors ${
                                scannerDragging === idx ? "border-[#2980b9] bg-blue-50 opacity-60" : "border-gray-200"
                              }`}
                              draggable
                              onDragStart={() => setScannerDragging(idx)}
                              onDragOver={(e) => { e.preventDefault(); }}
                              onDrop={() => {
                                if (scannerDragging !== null && scannerDragging !== idx) {
                                  setScannedImages(prev => {
                                    const arr = [...prev];
                                    const [moved] = arr.splice(scannerDragging, 1);
                                    arr.splice(idx, 0, moved);
                                    return arr;
                                  });
                                }
                                setScannerDragging(null);
                              }}
                              onDragEnd={() => setScannerDragging(null)}
                              onTouchStart={(e) => {
                                const touch = e.touches[0];
                                const target = e.currentTarget;
                                const handle = target.querySelector('[data-drag-handle]');
                                if (!handle || !handle.contains(e.target as Node)) return;
                                setScannerDragging(idx);
                                const onMove = (ev: TouchEvent) => {
                                  ev.preventDefault();
                                  const t = ev.touches[0];
                                  const el = document.elementFromPoint(t.clientX, t.clientY);
                                  const row = el?.closest('[data-scan-idx]');
                                  if (row) row.classList.add('bg-blue-50');
                                };
                                const onEnd = (ev: TouchEvent) => {
                                  const t = ev.changedTouches[0];
                                  const el = document.elementFromPoint(t.clientX, t.clientY);
                                  const row = el?.closest('[data-scan-idx]');
                                  if (row) {
                                    const toIdx = Number(row.getAttribute('data-scan-idx'));
                                    if (!isNaN(toIdx) && toIdx !== idx) {
                                      setScannedImages(prev => {
                                        const arr = [...prev];
                                        const [moved] = arr.splice(idx, 1);
                                        arr.splice(toIdx, 0, moved);
                                        return arr;
                                      });
                                    }
                                  }
                                  setScannerDragging(null);
                                  document.removeEventListener('touchmove', onMove);
                                  document.removeEventListener('touchend', onEnd);
                                };
                                document.addEventListener('touchmove', onMove, { passive: false });
                                document.addEventListener('touchend', onEnd);
                              }}
                              data-scan-idx={idx}
                            >
                              <div data-drag-handle className="cursor-grab active:cursor-grabbing touch-none text-gray-400 hover:text-gray-600 flex-shrink-0">
                                <GripVertical size={16} />
                              </div>
                              <div
                                className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 cursor-pointer border border-gray-200"
                                onClick={() => setScannerPreview(idx)}
                              >
                                <img src={img.data} alt={`Sayfa ${idx + 1}`} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-700">Sayfa {idx + 1}</p>
                                <p className="text-[10px] text-gray-400 truncate">{img.name}</p>
                              </div>
                              <button
                                onClick={() => setScannedImages(prev => prev.filter((_, i) => i !== idx))}
                                className="flex-shrink-0 p-1.5 rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => scannerInputRef.current?.click()}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg font-medium text-xs border border-[#2980b9] text-[#2980b9] hover:bg-[#2980b9]/10 transition-colors"
                          >
                            <Camera size={14} /> Fotoğraf Ekle
                          </button>
                          <button
                            onClick={() => handleScannerConvert(ruhsatActiveWork!.workId)}
                            disabled={scannerConverting}
                            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg font-medium text-xs transition-colors ${
                              scannerConverting ? "bg-gray-200 text-gray-400" : "bg-[#27ae60] text-white hover:bg-[#229954]"
                            }`}
                          >
                            {scannerConverting ? (
                              <><div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div> Dönüştürülüyor...</>
                            ) : (
                              <><FileText size={14} /> PDF&apos;e Dönüştür ({scannedImages.length} sayfa)</>
                            )}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <Camera size={40} className="mx-auto text-[#2980b9] mb-3" />
                        <p className="text-sm text-gray-600 font-medium mb-1">Belge Tarayıcı</p>
                        <p className="text-xs text-gray-400 mb-4">Fotoğraf çekin, birden fazla ekleyin ve PDF&apos;e dönüştürün</p>
                        <button
                          onClick={() => scannerInputRef.current?.click()}
                          className="belge-upload-btn inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full font-medium text-sm bg-[#2980b9] text-white hover:bg-[#2471a3] transition-colors"
                        >
                          <Camera size={16} /> Fotoğraf Çek
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => { setScannerMode(false); setScannedImages([]); }}
                      className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1"
                    >
                      ← Dosya listesine dön
                    </button>
                  </div>
                ) : medias.length > 0 ? (
                  <div className="space-y-1.5">
                    {medias.map((m: any) => {
                      const ext = m.fileName?.split('.').pop()?.toLowerCase() || '';
                      const isPdf = ext === 'pdf';
                      const isImage = ['png','jpg','jpeg','gif','bmp','webp','svg','heic','heif','tiff','tif'].includes(ext);
                      const isVideo = ['mp4','mov','webm','avi','mkv'].includes(ext);
                      const isAudio = ['mp3','wav','ogg','flac','aac'].includes(ext);
                      const isDwg = ['dwg','dxf'].includes(ext);
                      return (
                        <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2 hover:bg-gray-100 transition-colors cursor-pointer"
                          onClick={() => {
                            if (isPdf || isImage || isDwg) {
                              setRuhsatViewingPdf({ fileUrl: m.fileUrl, fileName: m.fileName });
                            } else {
                              window.open(`/api/download?url=${encodeURIComponent(m.fileUrl)}&name=${encodeURIComponent(m.fileName || 'dosya')}`, '_self');
                            }
                          }}
                        >
                          {isPdf ? <FileText size={14} className="text-red-500 flex-shrink-0" /> :
                           isImage ? <ImageIcon size={14} className="text-green-500 flex-shrink-0" /> :
                           isVideo ? <Video size={14} className="text-purple-500 flex-shrink-0" /> :
                           isAudio ? <File size={14} className="text-blue-500 flex-shrink-0" /> :
                           isDwg ? <FileText size={14} className="text-orange-500 flex-shrink-0" /> :
                           <File size={14} className="text-gray-500 flex-shrink-0" />}
                          <span className="text-xs text-gray-700 font-medium truncate flex-1">{m.fileName}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setRuhsatRenamingMedia({ mediaId: m.id, workId: ruhsatActiveWork.workId, fileName: m.fileName }); setRuhsatRenameValue(m.fileName); }}
                            className="text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0"
                            title="Dosya adını düzenle"
                          >
                            <Edit3 size={11} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); window.open(`/api/download?url=${encodeURIComponent(m.fileUrl)}&name=${encodeURIComponent(m.fileName || 'dosya')}`, '_self'); }}
                            className="text-[10px] text-gray-400 hover:text-blue-600 flex-shrink-0"
                            title="İndir"
                          >
                            <Download size={11} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setRuhsatDeleteConfirm({ mediaId: m.id, workId: ruhsatActiveWork.workId, fileName: m.fileName }); }}
                            className="text-[10px] text-red-400 hover:text-red-600 flex-shrink-0"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <File size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">Henüz dosya yüklenmemiş</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Ruhsat-İskan Dosya Görüntüleyici */}
      {ruhsatViewingPdf && (() => {
        const vExt = ruhsatViewingPdf.fileName?.split('.').pop()?.toLowerCase() || '';
        const vIsPdf = vExt === 'pdf';
        const vIsImage = ['png','jpg','jpeg','gif','bmp','webp','svg','tiff','tif'].includes(vExt);
        if (vIsPdf) return (
          <Suspense fallback={
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent"></div>
            </div>
          }>
            <PdfViewer
              fileUrl={ruhsatViewingPdf.fileUrl}
              fileName={ruhsatViewingPdf.fileName}
              onClose={() => setRuhsatViewingPdf(null)}
            />
          </Suspense>
        );
        if (vIsImage) return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setRuhsatViewingPdf(null)}>
            <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <button onClick={() => setRuhsatViewingPdf(null)} className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg z-10 hover:bg-gray-100">
                <X size={16} className="text-gray-700" />
              </button>
              <img src={ruhsatViewingPdf.fileUrl} alt={ruhsatViewingPdf.fileName} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
              <p className="text-center text-white text-sm mt-2 opacity-80">{ruhsatViewingPdf.fileName}</p>
            </div>
          </div>
        );
        const vIsDwg = ['dwg','dxf'].includes(vExt);
        if (vIsDwg) return (
          <Suspense fallback={
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent"></div>
            </div>
          }>
            <DwgViewer
              fileUrl={ruhsatViewingPdf.fileUrl}
              fileName={ruhsatViewingPdf.fileName}
              onClose={() => setRuhsatViewingPdf(null)}
            />
          </Suspense>
        );
        return null;
      })()}

      {/* Ruhsat-İskan Dosya Adı Düzenleme Popup */}
      {ruhsatRenamingMedia && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRuhsatRenamingMedia(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Dosya Adını Düzenle</h3>
            <input
              type="text"
              value={ruhsatRenameValue}
              onChange={e => setRuhsatRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleRuhsatRename(); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-[#c0392b] outline-none mb-3"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRuhsatRenamingMedia(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium">İptal</button>
              <button onClick={handleRuhsatRename} className="px-3 py-1.5 text-xs bg-[#c0392b] text-white rounded-lg font-medium hover:bg-[#a93226]">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Ruhsat-İskan Medya Silme Onay Popup */}
      {ruhsatDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Medya Silinecek</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              <span className="font-medium text-gray-700">&ldquo;{ruhsatDeleteConfirm.fileName}&rdquo;</span> medyasını silmek istediğinize emin misiniz?
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setRuhsatDeleteConfirm(null)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >İptal</button>
              <button
                onClick={() => {
                  const { mediaId, workId } = ruhsatDeleteConfirm;
                  setRuhsatDeleteConfirm(null);
                  handleRuhsatDelete(workId, mediaId);
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
              >Sil</button>
            </div>
          </div>
        </div>
      )}

      {/* Belge Tarayıcı Fotoğraf Önizleme */}
      {scannerPreview !== null && scannedImages[scannerPreview] && (
        <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={() => setScannerPreview(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setScannerPreview(null)} className="absolute -top-2 -right-2 bg-white rounded-full p-1.5 shadow-lg z-10 hover:bg-gray-100">
              <X size={16} className="text-gray-700" />
            </button>
            <img
              src={scannedImages[scannerPreview].data}
              alt={`Sayfa ${scannerPreview + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="flex items-center gap-4 mt-3">
              <button
                onClick={() => setScannerPreview(prev => prev !== null && prev > 0 ? prev - 1 : prev)}
                disabled={scannerPreview === 0}
                className={`p-2 rounded-full ${scannerPreview === 0 ? "text-gray-600" : "text-white hover:bg-white/20"}`}
              >
                <ArrowLeftIcon size={20} />
              </button>
              <p className="text-white text-sm">Sayfa {scannerPreview + 1} / {scannedImages.length}</p>
              <button
                onClick={() => setScannerPreview(prev => prev !== null && prev < scannedImages.length - 1 ? prev + 1 : prev)}
                disabled={scannerPreview === scannedImages.length - 1}
                className={`p-2 rounded-full ${scannerPreview === scannedImages.length - 1 ? "text-gray-600" : "text-white hover:bg-white/20"}`}
              >
                <ArrowRightIcon size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* İnşaat Tablosu (Kaba/Peyzaj/Bina Genel) */}
      {!activeCategory && (activeBlock || activeConstructionType === "PEYZAJ") && activeConstructionType && activeConstructionType !== "INCE_INSAAT" && activeConstructionType !== "RUHSAT_ISKAN" && (
        <div className="space-y-4">
          {constructionLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
            </div>
          ) : constructionFloors.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <Hammer size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">Henüz inşaat maddesi eklenmemiş</p>
              <p className="text-gray-400 text-sm mt-1">Ayarlar sayfasından şantiye düzenleme ekranını kullanarak madde ekleyebilirsiniz</p>
            </div>
          ) : activeConstructionType === "PEYZAJ" ? (
            /* Peyzaj - dikey grid layout (tek sayfaya sığsın) */
            <div className="space-y-3">
              {(() => {
                let globalNum = 0;
                return constructionFloors.map((floor: any) => (
                  <div key={floor.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-[#1e3a5f] text-white px-4 py-2 font-bold text-base text-center">
                      {floor.name}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-3">
                      {floor.works.map((work: any) => {
                        globalNum++;
                        const num = globalNum;
                        const entry = constructionEntries[work.id];
                        const hasMedia = entry && entry.mediaCount > 0;
                        const entryStatus = entry?.status || "NOT_STARTED";
                        const hasStarted = entryStatus !== "NOT_STARTED" || hasMedia;
                        const floorPrefix = floor.name + " - ";
                        const displayName = work.name.startsWith(floorPrefix) ? work.name.slice(floorPrefix.length) : work.name;
                        const btnColor = entryStatus === "COMPLETED" ? "bg-green-500 text-white hover:bg-green-600 shadow-sm" : hasStarted ? "bg-yellow-500 text-white hover:bg-yellow-600 shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                        return (
                          <button key={work.id} onClick={() => openConstructionMedia(work.id, work.name, floor.name)}
                            className={`construction-cell-btn w-full px-3 py-3 rounded-lg text-sm font-medium transition-all text-center flex flex-col items-center justify-center ${btnColor}`}>
                            <span className={`inline-block text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center mb-1 ${entryStatus !== "NOT_STARTED" ? "bg-white/30" : "bg-[#1e3a5f] text-white"}`}>{num}</span>
                            <span className="block leading-tight">{displayName}</span>
                            {hasMedia && <span className="block text-xs opacity-80 mt-0.5">({entry.mediaCount})</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : isMobile ? (
            <MobileConstructionView
              floors={constructionFloors as any}
              getEntry={(id) => constructionEntries[id]}
              onCellClick={(w, f) => openConstructionMedia(w.id, w.name, f.name)}
              title={activeConstructionType === "KABA_INSAAT" ? "Kaba İnşaat" : activeConstructionType === "BINA_GENEL" ? "Bina Genel" : "İnşaat"}
            />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {(() => {
                      let globalNum = 0;
                      return constructionFloors.map((floor: any, floorIdx: number) => (
                      <tr key={floor.id} className={floorIdx < constructionFloors.length - 1 ? "border-b-[3px] border-[#1e3a5f]/30" : ""}>
                        <td className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-base whitespace-nowrap align-middle min-w-[140px] border-r border-[#152d4a] sticky left-0 z-10">
                          {floor.name}
                        </td>
                        {floor.works.map((work: any, workIdx: number) => {
                          globalNum++;
                          const num = globalNum;
                          const entry = constructionEntries[work.id];
                          const hasMedia = entry && entry.mediaCount > 0;
                          const entryStatus = entry?.status || "NOT_STARTED";
                          const hasStarted = entryStatus !== "NOT_STARTED" || hasMedia;
                          const floorPrefix = floor.name + " - ";
                          const displayName = work.name.startsWith(floorPrefix) ? work.name.slice(floorPrefix.length) : work.name;
                          const btnColor = entryStatus === "COMPLETED" ? "bg-green-500 text-white hover:bg-green-600 shadow-sm" : hasStarted ? "bg-yellow-500 text-white hover:bg-yellow-600 shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                          return (
                            <td key={work.id} className="p-1 h-px align-top">
                              <button
                                onClick={() => openConstructionMedia(work.id, work.name, floor.name)}
                                className={`construction-cell-btn w-full h-full px-2 py-2 rounded-lg text-base font-medium transition-all leading-tight flex items-center gap-1.5 ${btnColor}`}
                              >
                                <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${entryStatus !== "NOT_STARTED" ? "bg-white/30" : "bg-[#1e3a5f] text-white"}`}>{num}</span>
                                <span className="flex-1 text-left">
                                  <span className="block text-xs opacity-70">{floor.name}</span>
                                  <span className="block">{displayName}</span>
                                  {hasMedia && (
                                    <span className="block text-xs opacity-80 mt-0.5">({entry.mediaCount})</span>
                                  )}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diğer Blokları Göster/Kaldır butonu - Kaba İnşaat / Bina Genel */}
      {!activeCategory && activeBlock && activeConstructionType && activeConstructionType !== "INCE_INSAAT" && activeConstructionType !== "PEYZAJ" && activeConstructionType !== "RUHSAT_ISKAN" && site && site.blocks.length > 1 && constructionFloors.length > 0 && !constructionLoading && (
        <div className="flex justify-end">
          <button
            onClick={async () => {
              if (showOtherBlocks) {
                setShowOtherBlocks(false);
                setOtherBlocksData([]);
              } else {
                setShowOtherBlocks(true);
                await fetchOtherBlocksData(activeBlock.id, activeConstructionType);
              }
            }}
            className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2a4a6f] transition-all"
          >
            {showOtherBlocks ? "Diğer Blokları Kaldır" : "Diğer Blokları Göster"}
          </button>
        </div>
      )}

      {/* Diğer Bloklar Read-Only (Kaba / Bina Genel) */}
      {showOtherBlocks && activeConstructionType && activeConstructionType !== "INCE_INSAAT" && activeConstructionType !== "PEYZAJ" && activeConstructionType !== "RUHSAT_ISKAN" && (
        <div className="space-y-4">
          {otherBlocksLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#1e3a5f] border-t-transparent"></div>
            </div>
          ) : otherBlocksData.map((ob) => (
            <div key={ob.blockId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden opacity-75">
              <div className="bg-gray-600 text-white px-4 py-2 font-semibold text-sm text-center">{ob.blockName}</div>
              {isMobile && (
                <div className="p-2">
                  <MobileConstructionView
                    floors={ob.floors as any}
                    getEntry={(id) => ob.entries[id]}
                    onCellClick={(w, f) => openOtherBlockPreview(w.id, w.name, f.name, ob.blockId, ob.blockName)}
                    title={ob.blockName}
                    readOnly
                    muted
                  />
                </div>
              )}
              <div className={`overflow-x-auto ${isMobile ? "hidden" : ""}`}>
                <table className="w-full border-collapse">
                  <tbody>
                    {(() => {
                      let globalNum = 0;
                      return ob.floors.map((floor: any, floorIdx: number) => (
                      <tr key={floor.id} className={floorIdx < ob.floors.length - 1 ? "border-b-[3px] border-gray-400/40" : ""}>
                        <td className="bg-gray-500 text-white px-4 py-3 font-bold text-base whitespace-nowrap align-middle min-w-[140px] border-r border-gray-400">
                          {floor.name}
                        </td>
                        {floor.works.map((work: any, workIdx: number) => {
                          globalNum++;
                          const num = globalNum;
                          const entry = ob.entries[work.id];
                          const hasMedia = entry && entry.mediaCount > 0;
                          const entryStatus = entry?.status || "NOT_STARTED";
                          const hasStarted = entryStatus !== "NOT_STARTED" || hasMedia;
                          const floorPrefix = floor.name + " - ";
                          const displayName = work.name.startsWith(floorPrefix) ? work.name.slice(floorPrefix.length) : work.name;
                          const btnColor = entryStatus === "COMPLETED"
                            ? hasMedia ? "bg-green-400 text-white cursor-pointer hover:bg-green-500" : "bg-green-400 text-white cursor-default"
                            : hasStarted
                              ? hasMedia ? "bg-yellow-400 text-white cursor-pointer hover:bg-yellow-500" : "bg-yellow-400 text-white cursor-default"
                              : "bg-gray-100 text-gray-500 border border-gray-200 cursor-default";
                          return (
                            <td key={work.id} className="p-1 h-px align-top">
                              <div
                                onClick={() => hasMedia ? openOtherBlockPreview(work.id, work.name, floor.name, ob.blockId, ob.blockName) : undefined}
                                className={`w-full h-full px-2 py-2 rounded-lg text-base font-medium leading-tight flex items-center gap-1.5 ${btnColor}`}>
                                <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${entryStatus !== "NOT_STARTED" ? "bg-white/30" : "bg-gray-400 text-white"}`}>{num}</span>
                                <span className="flex-1 text-left">
                                  <span className="block text-xs opacity-70">{floor.name}</span>
                                  <span className="block">{displayName}</span>
                                  {hasMedia && <span className="block text-xs opacity-80 mt-0.5">({entry.mediaCount})</span>}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Kat Planı Butonu - Alt kategorileri olan kategorilerde göster */}
      {activeCategory && currentCategories.length > 0 && categoryDocuments.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {categoryDocuments.map((doc) => (
            <button
              key={doc.id}
              onClick={() => { if (activeBlock) setViewingDocIsUygulama(isRuhsatlandirma); setViewingDoc(doc); }}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#2a4a6f] transition-all shadow-md hover:shadow-lg font-semibold text-base flex-1 min-w-[250px]"
            >
              <FileText size={22} className="flex-shrink-0" />
              {activeCategory.name} Kat Planı
            </button>
          ))}
        </div>
      )}

      {/* Alt Kategoriler Görünümü */}
      {activeCategory && currentCategories.length > 0 && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {currentCategories.map((subCat) => (
              <button
                key={subCat.id}
                onClick={() => navigateToCategory(subCat)}
                className="relative rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all min-h-[90px] flex items-center justify-center text-center bg-[#1a1a2e] hover:bg-[#2a2a4e]"
              >
                <span className="text-white text-lg font-bold px-4">
                  {subCat.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* İş Kalemleri - Kart Görünümü (çatı sayfası gibi) */}
      {activeCategory && currentWorkItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {currentWorkItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl overflow-hidden shadow-md card-hover relative ${
                item.imageUrl ? "" : getStatusBg(item.progress)
              }`}
              style={{
                backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className={`p-5 ${item.imageUrl ? "bg-black/50" : ""} text-white min-h-[140px] flex flex-col justify-center items-center text-center`}>
                <h3 className="text-lg font-bold mb-1">{item.name}</h3>
                <p className="text-sm opacity-90">
                  %{item.progress} {item.progress === 100 ? "(tamamlandı)" : ""}
                </p>
                {item.startDate && (
                  <div className="mt-2 text-xs opacity-80">
                    <p>Başlangıç: {formatDate(item.startDate)}</p>
                    {item.endDate && <p>Bitiş: {formatDate(item.endDate)}</p>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Entries - Daire bazlı görünüm */}
      {/* Ruhsatlandırma Proje Grupları */}
      {activeCategory && currentWorkItems.length === 0 && currentCategories.length === 0 && isRuhsatlandirma && (
        <div className="space-y-3">
          {RUHSAT_GROUPS.map((group) => {
            const docs = groupDocs[group.key] || [];
            const isUploading = uploadingGroup === group.key;
            return (
              <div key={group.key} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h4 className="text-sm font-semibold text-gray-800 min-w-[140px]">{group.label}</h4>

                  {docs.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap flex-1">
                      {docs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-1 group bg-gray-50 rounded-md border border-gray-200 px-2 py-1">
                          <button
                            onClick={() => { setViewingDocIsUygulama(group.key === "uygulama"); setViewingDoc(doc); }}
                            className="flex items-center gap-1.5 min-w-0 hover:text-[#c0392b] transition-colors"
                          >
                            <FileText size={12} className={`flex-shrink-0 ${
                              doc.fileType === "PDF" ? "text-red-500" :
                              doc.fileType === "PHOTO" ? "text-blue-500" :
                              doc.fileType === "DOCUMENT" ? "text-green-500" :
                              "text-gray-400"
                            }`} />
                            <span className="text-[11px] text-gray-600 truncate group-hover:text-[#c0392b]">{doc.fileName}</span>
                          </button>
                          {group.key === "uygulama" && activeBlock && (doc.fileType === "PDF" || doc.mimeType === "application/pdf") && (
                            <button
                              onClick={() => openFloorAttachPopup(doc)}
                              className="p-1 rounded text-gray-300 hover:text-[#1e3a5f] transition-colors flex-shrink-0"
                              title="Kat Bağlantıları"
                            >
                              <Layers size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => { setRenamingDoc({ doc, isGroup: true }); setRenameValue(doc.fileName.replace(/\.[^/.]+$/, "")); }}
                            className="p-1 rounded text-gray-300 hover:text-blue-500 transition-colors flex-shrink-0"
                            title="Adı Düzenle"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); window.open(`/api/download?url=${encodeURIComponent(doc.fileUrl)}&name=${encodeURIComponent(doc.fileName || 'dosya')}`, '_self'); }}
                            className="p-1 rounded text-gray-300 hover:text-blue-500 transition-colors flex-shrink-0"
                            title="İndir"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteGroupDoc(doc)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Sil"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {docs.length === 0 && (
                    <p className="text-[11px] text-gray-300 flex-1">Dosya yok</p>
                  )}

                  <label className={`inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-md font-medium text-[11px] cursor-pointer transition-all flex-shrink-0 ${
                    isUploading ? "bg-gray-100 text-gray-400" : "bg-gray-50 text-gray-500 hover:bg-[#c0392b] hover:text-white border border-gray-200 hover:border-[#c0392b]"
                  }`}>
                    <Upload size={11} />
                    {isUploading ? "Yükleniyor..." : "Ekle"}
                    <input
                      type="file"
                      onChange={(e) => handleFileSelect(e, group.key)}
                      disabled={isUploading}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.dwg,.dxf,.zip,.rar,.7z,.txt,.csv"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* Dosya Bölümü - Ruhsatlandırma dışındaki kategoriler için */}
      {activeCategory && currentWorkItems.length === 0 && currentCategories.length === 0 && !isRuhsatlandirma && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Dosyalar</span>
            <div className="h-4 w-px bg-gray-300 hidden sm:block" />
            {categoryDocuments.map((doc) => (
              <div key={doc.id} className="flex items-center gap-1 bg-white rounded-md border border-gray-200 hover:border-[#c0392b] transition-all group">
                <button
                  onClick={() => { setViewingDoc(doc); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-left min-w-0"
                >
                  <FileText size={14} className={`flex-shrink-0 ${
                    doc.fileType === "PDF" ? "text-red-500" :
                    doc.fileType === "PHOTO" ? "text-blue-500" :
                    doc.fileType === "DOCUMENT" ? "text-green-500" :
                    "text-gray-500"
                  }`} />
                  <span className="text-xs font-medium text-gray-700 truncate max-w-[180px] sm:max-w-[240px] group-hover:text-[#c0392b]">{doc.fileName}</span>
                </button>
                <button
                  onClick={() => { setRenamingDoc({ doc, isGroup: false }); setRenameValue(doc.fileName.replace(/\.[^/.]+$/, "")); }}
                  className="p-1 rounded text-gray-300 hover:text-blue-500 transition-all flex-shrink-0"
                  title="Düzenle"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  onClick={() => handleDeleteDocument(doc)}
                  className="p-1 mr-1 rounded text-gray-300 hover:text-red-500 transition-all flex-shrink-0"
                  title="Sil"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <label className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all ${
              uploading ? "bg-gray-100 text-gray-400" : "bg-white text-gray-500 hover:bg-[#c0392b] hover:text-white border border-dashed border-gray-300 hover:border-[#c0392b]"
            }`}>
              <Upload size={12} />
              {uploading ? "Yükleniyor..." : "Ekle"}
              <input
                type="file"
                onChange={(e) => handleFileSelect(e)}
                disabled={uploading}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.dwg,.dxf,.zip,.rar,.7z,.txt,.csv"
              />
            </label>
          </div>
        </div>
      )}

      {/* Kat/Daire Tabanlı Görünüm - Kalıp-Beton-Tuğla tarzı */}
      {activeCategory && !isRuhsatlandirma && (activeBlock ? true : site.blocks.length > 0) && currentCategories.length === 0 && currentWorkItems.length === 0 && (
        <div className="space-y-4">
          {(activeBlock ? [activeBlock] : site.blocks).map((block) => (
            <div key={block.id} className="space-y-3">
              {block.floors.map((floor) => (
                <div key={floor.id} className="flex flex-wrap items-start gap-3">
                  {/* Kat Adı */}
                  <div className="bg-[#c0392b] text-white px-4 py-3 rounded-lg min-w-[120px] text-center font-semibold">
                    <p>{floor.name}</p>
                    <p className="text-xs opacity-80">(%0)</p>
                  </div>

                  {/* Daireler */}
                  <div className="flex flex-wrap gap-2">
                    {floor.units.map((unit) => (
                      <div
                        key={unit.id}
                        className="bg-[#c0392b] text-white px-3 py-2 rounded-lg text-sm text-center min-w-[100px] cursor-pointer hover:bg-[#922b21] transition-all"
                      >
                        <p className="font-medium">{unit.name}</p>
                        <p className="text-xs opacity-80">(%0)</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Dosya Görüntüleyici */}
      {viewingDoc && (
        (viewingDoc.fileType === "PDF" || viewingDoc.mimeType === "application/pdf") ? (
          <Suspense fallback={
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent"></div>
            </div>
          }>
            <PdfViewer
              fileUrl={viewingDoc.fileUrl}
              fileName={viewingDoc.fileName}
              documentId={viewingDoc.id}
              onClose={() => { setViewingDoc(null); setViewingDocIsUygulama(false); }}
              floorLabels={viewingDocFloorLabels}
              isUygulama={viewingDocIsUygulama}
              pageFloorUnits={pageFloorUnits}
              allBlockUnits={activeBlock?.floors.flatMap(f => f.units.map(u => ({ id: u.id, name: u.name }))) || []}
              siteId={site?.id}
              checklistTemplates={categoryChecklistTemplates}
              activeCategoryId={breadcrumb[0]?.category?.id}
            />
          </Suspense>
        ) : /\.(dwg|dxf)$/i.test(viewingDoc.fileName) ? (
          <Suspense fallback={
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent"></div>
            </div>
          }>
            <PdfViewer
              fileUrl={viewingDoc.fileUrl.replace(/\.(dwg|dxf)$/i, '.pdf')}
              fileName={viewingDoc.fileName}
              onClose={() => { setViewingDoc(null); setViewingDocIsUygulama(false); }}
              originalDownloadUrl={viewingDoc.fileUrl}
            />
          </Suspense>
        ) : (
          <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
            <div className="bg-[#1a1a2e] text-white px-3 py-2 flex items-center justify-between flex-shrink-0">
              <span className="font-medium truncate text-sm flex-1 min-w-0">{viewingDoc.fileName}</span>
              <div className="flex items-center gap-1">
                <a href={viewingDoc.fileUrl} download className="p-1.5 hover:bg-white/10 rounded-lg"><Download size={18} /></a>
                <button onClick={() => setViewingDoc(null)} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex justify-center items-center p-4">
              {viewingDoc.fileType === "PHOTO" || viewingDoc.mimeType?.startsWith("image/") ? (
                <img src={viewingDoc.fileUrl} alt={viewingDoc.fileName} className="max-w-full max-h-full object-contain rounded-lg" />
              ) : (
                <div className="bg-white rounded-xl p-12 text-center flex flex-col items-center justify-center">
                  <File size={64} className="text-gray-300 mb-4" />
                  <p className="text-gray-600 font-medium mb-2">{viewingDoc.fileName}</p>
                  <p className="text-gray-400 text-sm mb-6">Bu dosya türü önizleme desteklemiyor</p>
                  <a href={viewingDoc.fileUrl} download className="inline-flex items-center gap-2 px-6 py-3 bg-[#c0392b] text-white rounded-lg hover:bg-[#922b21] font-medium"><Download size={18} />Dosyayı İndir</a>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* İnşaat Medya Popup */}
      {constructionMediaPopup && constructionMediaMode === "choice" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConstructionMediaPopup(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Camera size={28} className="text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{constructionMediaPopup.workName}</h3>
              <p className="text-xs text-gray-400 mt-1">{constructionMediaPopup.floorName} — {activeBlock?.name || "Peyzaj"}</p>
              <p className="text-sm text-gray-500 mt-3">{constructionMedias.length} medya mevcut</p>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={() => { setConstructionMediaMode("view"); setConstructionViewIndex(0); }} disabled={constructionMedias.length === 0} className="flex items-center justify-center gap-3 w-full px-4 py-4 rounded-xl bg-[#1e3a5f] text-white font-medium text-sm hover:bg-[#16304f] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <Eye size={20} /> Medyaları Görüntüle
              </button>
              {isAdmin(user?.roles) ? (
                <button onClick={() => setConstructionMediaMode("upload")} className="flex items-center justify-center gap-3 w-full px-4 py-4 rounded-xl bg-[#c0392b] text-white font-medium text-sm hover:bg-[#922b21] transition-all">
                  <Upload size={20} /> Yeni Medya Yükle & Ayarlar
                </button>
              ) : (
                <button onClick={() => setConstructionMediaMode("upload")} className="flex items-center justify-center gap-3 w-full px-4 py-4 rounded-xl bg-[#1e3a5f]/80 text-white font-medium text-sm hover:bg-[#1e3a5f] transition-all">
                  <HardHat size={20} /> Detaylar & Personel
                </button>
              )}
            </div>
            <button onClick={() => setConstructionMediaPopup(null)} className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600">İptal</button>
          </div>
        </div>
      )}

      {/* İnşaat Medya - Yükleme Modu */}
      {constructionMediaPopup && constructionMediaMode === "upload" && (
        <div className={`fixed inset-0 bg-black/50 z-50 ${isMobile ? "" : "backdrop-blur-sm flex items-center justify-center p-4"}`} onClick={() => setConstructionMediaPopup(null)}>
          <div className={`bg-white flex flex-col overflow-hidden ${isMobile ? "w-full h-full" : "rounded-2xl w-full max-w-lg max-h-[90vh] border-[5px] border-[#1e3a5f]"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex-shrink-0 border-b border-gray-200 px-5 py-4 ${isMobile ? "modal-safe-top flex flex-col gap-3" : "flex items-center justify-between gap-3"}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Upload size={20} className="text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-gray-900 truncate">{constructionMediaPopup.workName}</h3>
                  <p className="text-xs text-gray-400 truncate">
                    {constructionMediaPopup.floorName} — {activeBlock?.name || "Peyzaj"}
                  </p>
                </div>
                {isMobile && (
                  <button onClick={() => setConstructionMediaPopup(null)} className="p-2 -mr-1 hover:bg-gray-100 rounded-lg flex-shrink-0 ml-auto">
                    <X size={22} className="text-gray-500" />
                  </button>
                )}
              </div>
              {/* Aksiyon butonları: mobilde alt satır, masaüstünde sağda */}
              <div className={`flex items-center gap-2 ${isMobile ? "" : "flex-shrink-0"}`}>
              {constructionEntryStatus === "IN_PROGRESS" && (
                <button
                  onClick={async () => {
                    if (!constructionMediaPopup) return;
                    try {
                      const body: any = { entryStatus: "COMPLETED", blockId: effectiveBlockId };
                      if (constructionMediaPopup.floorId) body.floorId = constructionMediaPopup.floorId;
                      const res = await fetch(`/api/construction/${constructionMediaPopup.workId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                      if (res.ok) {
                        const data = await res.json();
                        setConstructionEntryStatus("COMPLETED");
                        if (data.entry?.endDate && !constructionEntryEndDate) setConstructionEntryEndDate(new Date(data.entry.endDate).toISOString().slice(0, 10));
                        const entryKey = constructionMediaPopup.floorId ? `${constructionMediaPopup.workId}:${constructionMediaPopup.floorId}` : constructionMediaPopup.workId;
                        if (constructionMediaPopup.floorId) {
                          setInceEntries(prev => ({ ...prev, [entryKey]: { ...prev[entryKey], status: "COMPLETED" } }));
                        } else {
                          setConstructionEntries(prev => ({ ...prev, [entryKey]: { ...prev[entryKey], status: "COMPLETED" } }));
                        }
                      }
                    } catch (e) { console.error(e); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-all flex-shrink-0"
                >
                  <Flag size={16} /> İş Bitir
                </button>
              )}
              {constructionEntryStatus === "COMPLETED" && isAdmin(user?.roles) && (
                <button
                  onClick={async () => {
                    if (!constructionMediaPopup) return;
                    try {
                      const body: any = { entryStatus: "IN_PROGRESS", blockId: effectiveBlockId };
                      if (constructionMediaPopup.floorId) body.floorId = constructionMediaPopup.floorId;
                      const res = await fetch(`/api/construction/${constructionMediaPopup.workId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                      if (res.ok) {
                        setConstructionEntryStatus("IN_PROGRESS");
                        setConstructionEntryEndDate("");
                        const entryKey = constructionMediaPopup.floorId ? `${constructionMediaPopup.workId}:${constructionMediaPopup.floorId}` : constructionMediaPopup.workId;
                        if (constructionMediaPopup.floorId) {
                          setInceEntries(prev => ({ ...prev, [entryKey]: { ...prev[entryKey], status: "IN_PROGRESS" } }));
                        } else {
                          setConstructionEntries(prev => ({ ...prev, [entryKey]: { ...prev[entryKey], status: "IN_PROGRESS" } }));
                        }
                      }
                    } catch (e) { console.error(e); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-all flex-shrink-0"
                >
                  <RotateCcw size={16} /> İşi Devam Ettir
                </button>
              )}
              <button
                onClick={() => openPersonnelPopup()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c0392b] text-white rounded-lg text-sm font-medium hover:bg-[#a93226] transition-all flex-shrink-0"
              >
                <HardHat size={16} /> Personel
              </button>
              {!isMobile && (
                <button onClick={() => setConstructionMediaPopup(null)} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
                  <X size={20} className="text-gray-500" />
                </button>
              )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {constructionMediaLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#c0392b] border-t-transparent"></div>
                </div>
              ) : constructionMedias.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">Henüz medya yüklenmemiş</p>
                  <p className="text-gray-400 text-xs mt-1">Aşağıdaki butonlardan yükleyebilirsiniz</p>
                </div>
              ) : (
                (() => {
                  // Group medias by createdAt date (desc)
                  const groups: Record<string, { media: any; idx: number }[]> = {};
                  constructionMedias.forEach((media: any, idx: number) => {
                    const k = dateKey(media.createdAt) || "0000-00-00";
                    if (!groups[k]) groups[k] = [];
                    groups[k].push({ media, idx });
                  });
                  const sortedKeys = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));
                  return (
                    <div className="space-y-5">
                      {sortedKeys.map((k) => (
                        <div key={k}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                              {k === "0000-00-00" ? "Tarihsiz" : dateLabel(k)}
                            </span>
                            <span className="text-xs text-gray-400">{groups[k].length} medya</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 media-thumb-grid">
                            {groups[k].map(({ media, idx }) => (
                    <div key={media.id} className="relative group rounded-xl overflow-hidden border-2 border-gray-200 hover:border-[#c0392b] cursor-pointer aspect-square shadow-sm hover:shadow-md transition-all"
                      onClick={() => { setConstructionMediaMode("view"); setConstructionViewIndex(idx); }}
                    >
                      {media.mimeType?.startsWith("video/") ? (
                        <video src={media.fileUrl} className="w-full h-full object-cover bg-black pointer-events-none" />
                      ) : (
                        <img src={media.fileUrl + (media.fileUrl.includes("?") ? "&" : "?") + "size=thumb"} alt={media.fileName} loading="lazy" decoding="async" className="w-full h-full object-cover bg-gray-100 pointer-events-none" />
                      )}
                      {/* Edit & Delete buttons — top-right corner (only ADMIN/SUPER_ADMIN) */}
                      {isAdmin(user?.roles) && (
                      <div className="absolute top-1.5 right-1.5 flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingMediaId(media.id); setEditMediaTitle(media.title || ""); setEditMediaDesc(media.description || ""); }}
                          className="bg-blue-600 text-white p-1.5 rounded-full hover:bg-blue-700 transition-all shadow"
                          title="Düzenle"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConstructionDeleteConfirm({ mediaId: media.id, fileName: media.fileName }); }}
                          className="bg-red-600 text-white p-1.5 rounded-full hover:bg-red-700 transition-all shadow"
                          title="Sil"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      )}
                      {/* Photo number badge (top-left) */}
                      <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow">
                        {idx + 1}
                      </div>
                    </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>

            {/* 3 Upload Buttons (only ADMIN/SUPER_ADMIN) */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-200 space-y-2" style={isMobile ? { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" } : undefined}>
              {!isAdmin(user?.roles) ? (
                <div className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-blue-50 text-blue-700 font-medium text-sm border border-blue-200">
                  <Eye size={16} /> Sadece görüntüleme modu
                </div>
              ) : constructionEntryStatus === "COMPLETED" && !isAdmin(user?.roles) ? (
                <div className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-green-50 text-green-700 font-medium text-sm border border-green-200">
                  <Flag size={16} /> İş tamamlandı — düzenleme yapılamaz
                </div>
              ) : constructionMediaUploading ? (
                <div className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-400 font-medium text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div> Yükleniyor...
                </div>
              ) : (
                <>
                  <div className="media-upload-btn-wrap grid grid-cols-2 gap-2">
                    <button onClick={() => startCamera("photo")} className="media-upload-btn flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-blue-600 text-white font-semibold text-sm cursor-pointer hover:bg-blue-700 active:scale-95 transition-all shadow hover:shadow-md">
                      <Camera size={16} /> Fotoğraf Çek
                    </button>
                    <button onClick={() => startCamera("video")} className="media-upload-btn flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-purple-600 text-white font-semibold text-sm cursor-pointer hover:bg-purple-700 active:scale-95 transition-all shadow hover:shadow-md">
                      <Video size={16} /> Video Çek
                    </button>
                  </div>
                  <label className="media-upload-btn flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-full bg-[#c0392b] text-white font-semibold text-sm cursor-pointer hover:bg-[#922b21] active:scale-95 transition-all shadow hover:shadow-md">
                    <FolderOpen size={16} /> Galeriden Fotoğraf / Video Seç
                    <input type="file" onChange={handleConstructionMediaUpload} className="hidden" accept="image/*,video/*" multiple />
                  </label>
                  {constructionMedias.length > 4 && (
                    <p className="ipad-scroll-hint text-center text-sm text-gray-500 mt-2">Diğer fotoğrafları görmek için aşağıya kaydır</p>
                  )}
                  {/* Fallback file inputs for when camera is not available */}
                  <input ref={photoInputRef} type="file" onChange={handleConstructionMediaUpload} className="hidden" accept="image/*" capture="environment" />
                  <input ref={videoInputRef} type="file" onChange={handleConstructionMediaUpload} className="hidden" accept="video/*" capture="environment" />
                </>
              )}

              {/* Tarih Alanları */}
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const isAdminUser = isAdmin(user?.roles);
                // Admin/SUPER_ADMIN: 10 gün limiti yok (geriye dönük düzenleme yapabilir)
                const minDate = isAdminUser
                  ? "2000-01-01"
                  : new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                return (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] text-gray-500 font-medium mb-0.5 block">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={constructionEntryStartDate}
                    min={minDate}
                    max={today}
                    onChange={async (e) => {
                      const val = e.target.value;
                      // GUARD: do NOT silently null on out-of-range; ignore invalid input to prevent date corruption.
                      if (val && (val < minDate || val > today)) {
                        // revert UI value, keep DB intact
                        e.target.value = constructionEntryStartDate;
                        return;
                      }
                      // GUARD: only PATCH after entry has loaded (avoid race overwriting historical date with empty)
                      if (!constructionEntryLoaded) return;
                      setConstructionEntryStartDate(val);
                      if (constructionMediaPopup && val) {
                        await fetch(`/api/construction/${constructionMediaPopup.workId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ entryStartDate: val, blockId: effectiveBlockId, floorId: constructionMediaPopup.floorId || null }),
                        });
                      }
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:border-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium mb-0.5 block">Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={constructionEntryEndDate}
                    min={minDate}
                    max={today}
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (val && (val < minDate || val > today)) {
                        e.target.value = constructionEntryEndDate;
                        return;
                      }
                      if (!constructionEntryLoaded) return;
                      setConstructionEntryEndDate(val);
                      if (constructionMediaPopup && val) {
                        await fetch(`/api/construction/${constructionMediaPopup.workId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ entryEndDate: val, blockId: effectiveBlockId, floorId: constructionMediaPopup.floorId || null }),
                        });
                      }
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:border-teal-500 outline-none"
                  />
                </div>
              </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* İnşaat Medya - Görüntüleme / Galeri Modu */}
      {/* Foto görüntüleyici → paylaşılan MediaViewer (depo vb. ile aynı: swipe, zoom, ok yok, küçültme ikonu yok, safe-top) */}
      {constructionMediaPopup && constructionMediaMode === "view" && constructionMedias.length > 0 && (
        <MediaViewer
          open
          items={constructionMedias.map((m: any) => ({ id: m.id, fileName: m.fileName, fileUrl: m.fileUrl, mimeType: m.mimeType, title: m.title, description: m.description }))}
          index={constructionViewIndex}
          onIndexChange={(i) => setConstructionViewIndex(i)}
          onClose={() => setConstructionMediaMode("upload")}
          onDelete={isAdmin(user?.roles) ? (item) => setConstructionDeleteConfirm({ mediaId: item.id, fileName: item.fileName }) : undefined}
        />
      )}
      {constructionMediaPopup && false && constructionMediaMode === "view" && constructionMedias.length > 0 && (
        <div className="fixed inset-0 bg-black/90 flex flex-col z-50 select-none" onMouseDown={(e) => e.preventDefault()}>
          {/* Gallery Header */}
          <div className="modal-safe-top flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/50">
            <div className="text-white min-w-0">
              <h3 className="text-sm font-semibold truncate">{constructionMediaPopup.workName}</h3>
              <p className="text-xs text-white/60">{constructionMediaPopup.floorName} — {constructionViewIndex + 1} / {constructionMedias.length}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const media = constructionMedias[constructionViewIndex];
                  if (!media) return;
                  window.open(`/api/download?url=${encodeURIComponent(media.fileUrl)}&name=${encodeURIComponent(media.fileName || 'medya')}`, '_self');
                }}
                className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="İndir"
              >
                <Download size={24} />
              </button>
              <button
                onClick={() => {
                  const media = constructionMedias[constructionViewIndex];
                  if (media) {
                    const url = window.location.origin + media.fileUrl;
                    navigator.clipboard.writeText(url).then(() => {
                      alert("Link kopyalandı!");
                    });
                  }
                }}
                className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="Link Kopyala"
              >
                <Share2 size={24} />
              </button>
              <button onClick={() => setConstructionMediaMode("upload")} className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="Yükle">
                <Upload size={24} />
              </button>
              {isAdmin(user?.roles) && (
              <button
                onClick={() => {
                  const media = constructionMedias[constructionViewIndex];
                  if (media) {
                    setConstructionDeleteConfirm({ mediaId: media.id, fileName: media.fileName, fromGallery: true });
                  }
                }}
                className="p-3.5 hover:bg-white/20 rounded-xl text-red-400 min-w-[48px] min-h-[48px] flex items-center justify-center" title="Sil"
              >
                <Trash2 size={24} />
              </button>
              )}
              <button onClick={() => { setConstructionMediaPopup(null); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false); }} className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center">
                <X size={26} />
              </button>
            </div>
          </div>

          {/* Gallery Content */}
          <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative" onClick={(e) => { if (e.target === e.currentTarget) { setConstructionMediaPopup(null); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false); } }}>
            {/* Prev Button */}
            <button onClick={(e) => { e.stopPropagation(); if (constructionViewIndex > 0) { setConstructionViewIndex(constructionViewIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); } }} className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all ${constructionViewIndex <= 0 ? "invisible" : ""}`}>
              <ArrowLeftIcon size={24} />
            </button>

            {/* Media Display */}
            <div className="w-full flex-1 flex items-center justify-center p-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {constructionMedias[constructionViewIndex]?.mimeType?.startsWith("video/") ? (
                <video
                  key={constructionMedias[constructionViewIndex].id}
                  src={constructionMedias[constructionViewIndex].fileUrl}
                  controls
                  playsInline
                  preload="auto"
                  className={isMobile ? "w-full h-full object-contain bg-black" : "w-full max-h-[85vh] rounded-lg cursor-pointer"}
                  onPlay={(e) => {
                    if (isMobile) return;
                    const video = e.currentTarget;
                    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
                      if (video.requestFullscreen) video.requestFullscreen();
                      else if ((video as any).webkitEnterFullscreen) (video as any).webkitEnterFullscreen();
                      else if ((video as any).webkitRequestFullscreen) (video as any).webkitRequestFullscreen();
                    }
                  }}
                />
              ) : (
                <div
                  ref={imgContainerRef}
                  className={`relative w-full h-full flex items-center justify-center ${imgFullscreen || isMobile ? 'bg-black' : ''}`}
                  style={{ touchAction: "none" }}
                  onTouchStart={(e) => {
                    if (e.touches.length === 2 && (imgFullscreen || isMobile)) {
                      // Pinch start
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
                    if (e.touches.length === 2 && (imgFullscreen || isMobile)) {
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
                    } else if (e.touches.length === 1 && (imgFullscreen || isMobile) && imgZoom > 1) {
                      // Pan when zoomed in fullscreen
                      e.preventDefault();
                      const panX = imgTouchRef.current.px + (e.touches[0].clientX - imgTouchRef.current.cx);
                      const panY = imgTouchRef.current.py + (e.touches[0].clientY - imgTouchRef.current.cy);
                      setImgPan({ x: panX, y: panY });
                      imgTouchRef.current.moved = true;
                    } else if (e.touches.length === 1 && imgZoom <= 1) {
                      // Horizontal swipe for navigation
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
                    // Swipe navigation
                    if (imgTouchRef.current.moved && imgTouchRef.current.swipeDx !== undefined && imgZoom <= 1) {
                      const dx = imgTouchRef.current.swipeDx;
                      if (Math.abs(dx) >= 50) {
                        if (dx < -50 && constructionViewIndex < constructionMedias.length - 1) {
                          setConstructionViewIndex(constructionViewIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
                        } else if (dx > 50 && constructionViewIndex > 0) {
                          setConstructionViewIndex(constructionViewIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
                        } else {
                          setImgPan({ x: 0, y: 0 });
                        }
                      } else {
                        setImgPan({ x: 0, y: 0 });
                      }
                      imgTouchRef.current = null;
                      return;
                    }
                    // Pinch end — snap to 1 if close
                    if (imgTouchRef.current.moved && imgTouchRef.current.dist > 0) {
                      if (imgZoom <= 1.05) { setImgZoom(1); setImgPan({ x: 0, y: 0 }); }
                      imgTouchRef.current = null;
                      return;
                    }
                    const elapsed = Date.now() - imgTouchRef.current.t;
                    if (!imgTouchRef.current.moved && elapsed < 400) {
                      // Tap detected
                      const now = Date.now();
                      if ((imgFullscreen || isMobile) && lastTapRef.current && now - lastTapRef.current < 500) {
                        // Double-tap in fullscreen — toggle zoom
                        if (imgZoom > 1) { setImgZoom(1); setImgPan({ x: 0, y: 0 }); }
                        else { setImgZoom(2.5); }
                        lastTapRef.current = 0;
                      } else if (imgFullscreen || isMobile) {
                        // First tap in fullscreen — wait for possible double-tap
                        lastTapRef.current = now;
                      } else {
                        // Not fullscreen — single tap → go fullscreen
                        lastTapRef.current = 0;
                        const el = imgContainerRef.current;
                        if (el) {
                          if (el.requestFullscreen) el.requestFullscreen();
                          else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
                          setImgFullscreen(true);
                        }
                      }
                    }
                    imgTouchRef.current = null;
                  }}
                  onClick={(e) => {
                    if ('ontouchstart' in window) return;
                    // Desktop click — toggle fullscreen
                    if (!imgFullscreen) {
                      const el = imgContainerRef.current;
                      if (el) {
                        if (el.requestFullscreen) el.requestFullscreen();
                        else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
                        setImgFullscreen(true);
                      }
                    } else {
                      if (document.exitFullscreen) document.exitFullscreen();
                      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                      setImgFullscreen(false);
                      setImgZoom(1); setImgPan({ x: 0, y: 0 });
                    }
                  }}
                >
                  <img
                    key={constructionMedias[constructionViewIndex].id}
                    src={constructionMedias[constructionViewIndex].fileUrl}
                    alt={constructionMedias[constructionViewIndex].fileName}
                    className={`object-contain rounded-lg select-none cursor-pointer ${imgFullscreen || isMobile ? 'w-full h-full' : 'w-full max-h-[85vh]'}`}
                    draggable={false}
                    style={{ transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px)`, transition: imgTouchRef.current ? 'none' : 'transform 0.2s ease-out' }}
                  />
                  {/* Fullscreen indicator */}
                  {!imgFullscreen && !isMobile && (
                    <div className="absolute bottom-4 right-4 z-20 p-2 bg-black/50 rounded-full text-white/70 pointer-events-none">
                      <Maximize2 size={18} />
                    </div>
                  )}
                  {/* Zoom indicator in fullscreen */}
                  {imgFullscreen && imgZoom > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }}
                      className="absolute top-4 right-4 z-20 px-3 py-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white text-xs font-medium flex items-center gap-1.5 transition-all"
                    >
                      <X size={14} /> {Math.round(imgZoom * 100)}%
                    </button>
                  )}
                  {/* Exit fullscreen button */}
                  {imgFullscreen && imgZoom <= 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (document.exitFullscreen) document.exitFullscreen();
                        else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                        setImgFullscreen(false);
                        setImgZoom(1); setImgPan({ x: 0, y: 0 });
                      }}
                      className="absolute top-4 right-4 z-20 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-all"
                    >
                      <Minimize2 size={18} />
                    </button>
                  )}
                  {/* Swipe arrows in fullscreen */}
                  {imgFullscreen && imgZoom <= 1 && constructionViewIndex > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); setConstructionViewIndex(constructionViewIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 rounded-full text-white">
                      <ArrowLeftIcon size={24} />
                    </button>
                  )}
                  {imgFullscreen && imgZoom <= 1 && constructionViewIndex < constructionMedias.length - 1 && (
                    <button onClick={(e) => { e.stopPropagation(); setConstructionViewIndex(constructionViewIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 rounded-full text-white">
                      <ArrowRightIcon size={24} />
                    </button>
                  )}
                  {/* Counter in fullscreen */}
                  {imgFullscreen && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-black/50 rounded-full text-white text-xs">
                      {constructionViewIndex + 1} / {constructionMedias.length}
                    </div>
                  )}
                  {/* Title + description overlay in fullscreen */}
                  {imgFullscreen && (constructionMedias[constructionViewIndex]?.title || constructionMedias[constructionViewIndex]?.description) && (
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 max-w-[90%] px-4 py-2 bg-black/55 rounded-lg text-center pointer-events-none">
                      {constructionMedias[constructionViewIndex]?.title && (
                        <p className="text-white text-sm font-semibold">{constructionMedias[constructionViewIndex].title}</p>
                      )}
                      {constructionMedias[constructionViewIndex]?.description && (
                        <p className="text-white/80 text-xs mt-0.5 line-clamp-2">{constructionMedias[constructionViewIndex].description}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title & Description */}
            {(constructionMedias[constructionViewIndex]?.title || constructionMedias[constructionViewIndex]?.description) && (
              <div className="flex-shrink-0 w-full max-w-2xl px-6 pb-2 text-center">
                {constructionMedias[constructionViewIndex]?.title && (
                  <h4 className="text-white text-sm font-semibold">{constructionMedias[constructionViewIndex].title}</h4>
                )}
                {constructionMedias[constructionViewIndex]?.description && (
                  <p className="text-white/70 text-xs mt-1">{constructionMedias[constructionViewIndex].description}</p>
                )}
              </div>
            )}

            {/* Next Button */}
            <button onClick={(e) => { e.stopPropagation(); if (constructionViewIndex < constructionMedias.length - 1) { setConstructionViewIndex(constructionViewIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); } }} className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all ${constructionViewIndex >= constructionMedias.length - 1 ? "invisible" : ""}`}>
              <ArrowRightIcon size={24} />
            </button>
          </div>

          {/* Thumbnail Strip */}
          {constructionMedias.length > 1 && (
            <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 bg-black/50 overflow-x-auto">
              {constructionMedias.map((media: any, idx: number) => (
                <button
                  key={media.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => { setConstructionViewIndex(idx); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }}
                  className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${idx === constructionViewIndex ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"}`}
                >
                  {media.mimeType?.startsWith("video/") ? (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Video size={16} className="text-white" /></div>
                  ) : (
                    <img src={media.fileUrl + (media.fileUrl.includes("?") ? "&" : "?") + "size=thumb"} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kamera Çekim Modalı */}

      {/* Personnel Sub-Popup (on top of media popup) */}
      {personnelPopupOpen && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => closePersonnelPopup()}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col personnel-popup" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                  <HardHat size={20} className="text-[#c0392b]" />
                  Personel Takip
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {constructionMediaPopup?.floorName} — {constructionMediaPopup?.workName}
                </p>
              </div>
              <button onClick={() => closePersonnelPopup()} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Date-grouped records list (read-only for everyone) */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {personnelLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                </div>
              ) : personnelRecords.length === 0 ? (
                <p className="text-gray-400 text-center py-6 text-sm">Henüz personel kaydı yok</p>
              ) : (
                (() => {
                  // Group by date desc
                  const groups: Record<string, any[]> = {};
                  for (const r of personnelRecords) {
                    const k = dateKey(r.date || r.createdAt);
                    if (!k) continue;
                    if (!groups[k]) groups[k] = [];
                    groups[k].push(r);
                  }
                  const sortedKeys = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));
                  return (
                    <div className="space-y-5">
                      {sortedKeys.map((k) => (
                        <div key={k}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2.5 py-1 rounded-full bg-[#c0392b]/10 text-[#c0392b] text-xs font-semibold">
                              {dateLabel(k)}
                            </span>
                            <span className="text-xs text-gray-400">{groups[k].length} kayıt</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                          <div className="space-y-2">
                            {groups[k].map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between bg-gray-50 px-4 py-2.5 rounded-lg">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium text-gray-800">{r.personnelName}</span>
                                  {r.company && <span className="text-gray-500 ml-2 text-sm">({r.company})</span>}
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                                  r.workDuration === "FULL_DAY" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                }`}>
                                  {r.workDuration === "FULL_DAY" ? "Tam Gün" : "Yarım Gün"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* İnce İnşaat Diğer Blok - Daire Seçim Popup */}
      {otherBlockInceDairePopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOtherBlockInceDairePopup(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border-[5px] border-gray-500" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 truncate">{otherBlockInceDairePopup.workName}</h3>
                <p className="text-xs text-gray-400 truncate">
                  <span className="font-medium text-gray-600">{otherBlockInceDairePopup.blockName}</span> — Daire seçin
                </p>
              </div>
              <button onClick={() => setOtherBlockInceDairePopup(null)} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {otherBlockInceDairePopup.daires.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Daire bulunamadı</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {otherBlockInceDairePopup.daires.map((daire) => {
                    const key = `${otherBlockInceDairePopup.workId}:${daire.id}`;
                    const entry = otherBlockInceDairePopup.inceEntries[key];
                    const hasMedia = entry && entry.mediaCount > 0;
                    const entryStatus = entry?.status || "NOT_STARTED";
                    const hasStarted = entryStatus !== "NOT_STARTED" || hasMedia;
                    const btnColor = entryStatus === "COMPLETED"
                      ? hasMedia ? "bg-green-500 text-white hover:bg-green-600 cursor-pointer" : "bg-green-500 text-white cursor-default"
                      : hasStarted
                        ? hasMedia ? "bg-yellow-500 text-white hover:bg-yellow-600 cursor-pointer" : "bg-yellow-500 text-white cursor-default"
                        : "bg-gray-100 text-gray-500 border border-gray-200 cursor-default";
                    return (
                      <button
                        key={daire.id}
                        onClick={() => {
                          if (hasMedia) {
                            openOtherBlockPreview(otherBlockInceDairePopup.workId, otherBlockInceDairePopup.workName, daire.name, otherBlockInceDairePopup.blockId, otherBlockInceDairePopup.blockName, daire.id);
                            setOtherBlockInceDairePopup(null);
                          }
                        }}
                        className={`p-3 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${btnColor}`}
                      >
                        <span className={`shrink-0 w-2 h-2 rounded-full ${entryStatus !== "NOT_STARTED" ? "bg-white/60" : "bg-gray-300"}`}></span>
                        <span className="flex-1 text-left">
                          <span className="block font-medium">{daire.name}</span>
                          {hasMedia && <span className="block text-[10px] opacity-80">({entry.mediaCount} medya)</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-200 text-center">
              <span className="text-xs text-gray-400">Yeşil dairelere tıklayarak önizleme yapabilirsiniz</span>
            </div>
          </div>
        </div>
      )}

      {/* Diğer Blok Önizleme Popup (Read-Only) */}
      {otherBlockPreview && otherBlockPreviewMode === "grid" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOtherBlockPreview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border-[5px] border-gray-500" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Eye size={20} className="text-gray-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 truncate">{otherBlockPreview.workName}</h3>
                  <p className="text-xs text-gray-400 truncate">
                    {otherBlockPreview.floorName} — <span className="font-medium text-gray-600">{otherBlockPreview.blockName}</span>
                    {otherBlockPreviewDates.start && otherBlockPreviewDates.end && (
                      <span className="ml-2 text-teal-600 font-medium">({otherBlockPreviewDates.start} → {otherBlockPreviewDates.end})</span>
                    )}
                  </p>
                </div>
              </div>
              <button onClick={() => setOtherBlockPreview(null)} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {otherBlockPreviewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-400 border-t-transparent"></div>
                </div>
              ) : otherBlockPreviewMedias.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">Bu iş kaleminde henüz medya yok</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {otherBlockPreviewMedias.map((media: any, idx: number) => (
                    <div key={media.id} className="relative group rounded-lg overflow-hidden border border-gray-200 cursor-pointer"
                      onClick={() => { setOtherBlockPreviewMode("view"); setOtherBlockPreviewIndex(idx); }}
                    >
                      {media.mimeType?.startsWith("video/") ? (
                        <video src={media.fileUrl} className="w-full aspect-square object-cover bg-black pointer-events-none" />
                      ) : (
                        <img src={media.fileUrl + (media.fileUrl.includes("?") ? "&" : "?") + "size=thumb"} alt={media.fileName} loading="lazy" decoding="async" className="w-full aspect-square object-cover bg-gray-100 pointer-events-none" />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-white text-[10px] truncate">{media.title || media.fileName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {otherBlockPreviewMedias.length > 0 && (
              <div className="flex-shrink-0 px-5 py-3 border-t border-gray-200 text-center">
                <span className="text-xs text-gray-400">{otherBlockPreviewMedias.length} medya — Sadece önizleme</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Diğer Blok Önizleme - Galeri Modu (Read-Only) */}
      {otherBlockPreview && otherBlockPreviewMode === "view" && otherBlockPreviewMedias.length > 0 && (
        <div className="fixed inset-0 bg-black/90 flex flex-col z-50 select-none" onMouseDown={(e) => e.preventDefault()}>
          {/* Gallery Header */}
          <div className="modal-safe-top flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/50">
            <div className="text-white min-w-0">
              <h3 className="text-sm font-semibold truncate">{otherBlockPreview.workName}</h3>
              <p className="text-xs text-white/60">{otherBlockPreview.floorName} — <span className="font-medium text-white/80">{otherBlockPreview.blockName}</span> — {otherBlockPreviewIndex + 1} / {otherBlockPreviewMedias.length}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => {
                const media = otherBlockPreviewMedias[otherBlockPreviewIndex];
                if (media) {
                  window.open(`/api/download?url=${encodeURIComponent(media.fileUrl)}&name=${encodeURIComponent(media.fileName || 'dosya')}`, '_self');
                }
              }} className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="İndir">
                <Download size={24} />
              </button>
              <button
                onClick={() => {
                  const media = otherBlockPreviewMedias[otherBlockPreviewIndex];
                  if (media) {
                    const url = window.location.origin + media.fileUrl;
                    navigator.clipboard.writeText(url).then(() => {
                      alert("Link kopyalandı!");
                    });
                  }
                }}
                className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="Link Kopyala"
              >
                <Share2 size={24} />
              </button>
              <button onClick={() => setOtherBlockPreviewMode("grid")} className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="Galeri">
                <ImageIcon size={24} />
              </button>
              <button onClick={() => { setOtherBlockPreview(null); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false); }} className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center">
                <X size={26} />
              </button>
            </div>
          </div>

          {/* Gallery Content */}
          <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative" onClick={(e) => { if (e.target === e.currentTarget) { setOtherBlockPreview(null); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false); } }}>
            {/* Prev Button */}
            <button onClick={(e) => { e.stopPropagation(); if (otherBlockPreviewIndex > 0) { setOtherBlockPreviewIndex(otherBlockPreviewIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); } }} className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all ${otherBlockPreviewIndex <= 0 ? "invisible" : ""}`}>
              <ArrowLeftIcon size={24} />
            </button>

            {/* Media Display */}
            <div className="w-full flex-1 flex items-center justify-center p-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {otherBlockPreviewMedias[otherBlockPreviewIndex]?.mimeType?.startsWith("video/") ? (
                <video
                  key={otherBlockPreviewMedias[otherBlockPreviewIndex].id}
                  src={otherBlockPreviewMedias[otherBlockPreviewIndex].fileUrl}
                  controls
                  playsInline
                  preload="auto"
                  className={isMobile ? "w-full h-full object-contain bg-black" : "w-full max-h-[85vh] rounded-lg cursor-pointer"}
                  onPlay={(e) => {
                    if (isMobile) return;
                    const video = e.currentTarget;
                    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
                      if (video.requestFullscreen) video.requestFullscreen();
                      else if ((video as any).webkitEnterFullscreen) (video as any).webkitEnterFullscreen();
                      else if ((video as any).webkitRequestFullscreen) (video as any).webkitRequestFullscreen();
                    }
                  }}
                />
              ) : (
                <div
                  ref={imgContainerRef}
                  className={`relative w-full h-full flex items-center justify-center ${imgFullscreen || isMobile ? 'bg-black' : ''}`}
                  style={{ touchAction: "none" }}
                  onTouchStart={(e) => {
                    if (e.touches.length === 2 && (imgFullscreen || isMobile)) {
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
                    if (e.touches.length === 2 && (imgFullscreen || isMobile)) {
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
                    } else if (e.touches.length === 1 && (imgFullscreen || isMobile) && imgZoom > 1) {
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
                        if (dx < -50 && otherBlockPreviewIndex < otherBlockPreviewMedias.length - 1) {
                          setOtherBlockPreviewIndex(otherBlockPreviewIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
                        } else if (dx > 50 && otherBlockPreviewIndex > 0) {
                          setOtherBlockPreviewIndex(otherBlockPreviewIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
                        } else {
                          setImgPan({ x: 0, y: 0 });
                        }
                      } else {
                        setImgPan({ x: 0, y: 0 });
                      }
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
                      if ((imgFullscreen || isMobile) && lastTapRef.current && now - lastTapRef.current < 500) {
                        if (imgZoom > 1) { setImgZoom(1); setImgPan({ x: 0, y: 0 }); }
                        else { setImgZoom(2.5); }
                        lastTapRef.current = 0;
                      } else if (imgFullscreen) {
                        lastTapRef.current = now;
                      } else {
                        lastTapRef.current = 0;
                        const el = imgContainerRef.current;
                        if (el) {
                          if (el.requestFullscreen) el.requestFullscreen();
                          else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
                          setImgFullscreen(true);
                        }
                      }
                    }
                    imgTouchRef.current = null;
                  }}
                  onClick={(e) => {
                    if ('ontouchstart' in window) return;
                    if (!imgFullscreen) {
                      const el = imgContainerRef.current;
                      if (el) {
                        if (el.requestFullscreen) el.requestFullscreen();
                        else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
                        setImgFullscreen(true);
                      }
                    } else {
                      if (document.exitFullscreen) document.exitFullscreen();
                      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                      setImgFullscreen(false);
                      setImgZoom(1); setImgPan({ x: 0, y: 0 });
                    }
                  }}
                >
                  <img
                    key={otherBlockPreviewMedias[otherBlockPreviewIndex].id}
                    src={otherBlockPreviewMedias[otherBlockPreviewIndex].fileUrl}
                    alt={otherBlockPreviewMedias[otherBlockPreviewIndex].fileName}
                    className={`object-contain rounded-lg select-none cursor-pointer ${imgFullscreen || isMobile ? 'w-full h-full' : 'w-full max-h-[85vh]'}`}
                    draggable={false}
                    style={{ transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px)`, transition: imgTouchRef.current ? 'none' : 'transform 0.2s ease-out' }}
                  />
                  {!imgFullscreen && !isMobile && (
                    <div className="absolute bottom-4 right-4 z-20 p-2 bg-black/50 rounded-full text-white/70 pointer-events-none">
                      <Maximize2 size={18} />
                    </div>
                  )}
                  {imgFullscreen && imgZoom > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }}
                      className="absolute top-4 right-4 z-20 px-3 py-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white text-xs font-medium flex items-center gap-1.5 transition-all"
                    >
                      <X size={14} /> {Math.round(imgZoom * 100)}%
                    </button>
                  )}
                  {imgFullscreen && imgZoom <= 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (document.exitFullscreen) document.exitFullscreen();
                        else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                        setImgFullscreen(false);
                        setImgZoom(1); setImgPan({ x: 0, y: 0 });
                      }}
                      className="absolute top-4 right-4 z-20 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-all"
                    >
                      <Minimize2 size={18} />
                    </button>
                  )}
                  {imgFullscreen && imgZoom <= 1 && otherBlockPreviewIndex > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); setOtherBlockPreviewIndex(otherBlockPreviewIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 rounded-full text-white">
                      <ArrowLeftIcon size={24} />
                    </button>
                  )}
                  {imgFullscreen && imgZoom <= 1 && otherBlockPreviewIndex < otherBlockPreviewMedias.length - 1 && (
                    <button onClick={(e) => { e.stopPropagation(); setOtherBlockPreviewIndex(otherBlockPreviewIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 rounded-full text-white">
                      <ArrowRightIcon size={24} />
                    </button>
                  )}
                  {imgFullscreen && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-black/50 rounded-full text-white text-xs">
                      {otherBlockPreviewIndex + 1} / {otherBlockPreviewMedias.length}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title & Description */}
            {(otherBlockPreviewMedias[otherBlockPreviewIndex]?.title || otherBlockPreviewMedias[otherBlockPreviewIndex]?.description) && (
              <div className="flex-shrink-0 w-full max-w-2xl px-6 pb-2 text-center">
                {otherBlockPreviewMedias[otherBlockPreviewIndex]?.title && (
                  <h4 className="text-white text-sm font-semibold">{otherBlockPreviewMedias[otherBlockPreviewIndex].title}</h4>
                )}
                {otherBlockPreviewMedias[otherBlockPreviewIndex]?.description && (
                  <p className="text-white/70 text-xs mt-1">{otherBlockPreviewMedias[otherBlockPreviewIndex].description}</p>
                )}
              </div>
            )}

            {/* Next Button */}
            <button onClick={(e) => { e.stopPropagation(); if (otherBlockPreviewIndex < otherBlockPreviewMedias.length - 1) { setOtherBlockPreviewIndex(otherBlockPreviewIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); } }} className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all ${otherBlockPreviewIndex >= otherBlockPreviewMedias.length - 1 ? "invisible" : ""}`}>
              <ArrowRightIcon size={24} />
            </button>
          </div>

          {/* Thumbnail Strip */}
          {otherBlockPreviewMedias.length > 1 && (
            <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 bg-black/50 overflow-x-auto">
              {otherBlockPreviewMedias.map((media: any, idx: number) => (
                <button
                  key={media.id}
                  onClick={() => { setOtherBlockPreviewIndex(idx); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }}
                  className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${idx === otherBlockPreviewIndex ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"}`}
                >
                  {media.mimeType?.startsWith("video/") ? (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Video size={16} className="text-white" /></div>
                  ) : (
                    <img src={media.fileUrl + (media.fileUrl.includes("?") ? "&" : "?") + "size=thumb"} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kamera Çekim Modalı */}
      {cameraActive && (
        <div className="fixed inset-0 bg-black z-[60]" style={{ touchAction: "none" }}>
          {/* Camera Preview - Tam Ekran */}
          <video
            ref={cameraVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Camera Header - Overlay */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3" style={{ paddingTop: "env(safe-area-inset-top, 12px)", background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}>
            <div className="text-white">
              <h3 className="text-sm font-semibold drop-shadow-lg">{cameraType === "photo" ? "Fotoğraf Çek" : "Video Çek"}</h3>
              {isRecording && <p className="text-xs text-red-400 animate-pulse font-bold">● Kayıt yapılıyor...</p>}
            </div>
            <button onClick={closeCamera} className="p-2.5 bg-black/40 backdrop-blur-sm rounded-full text-white active:scale-90">
              <X size={22} />
            </button>
          </div>

          {/* Camera Controls - Overlay Bottom */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-6 px-4 py-8" style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)", background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }}>
            {cameraType === "photo" ? (
              <button
                onClick={capturePhoto}
                className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 hover:border-gray-100 transition-all flex items-center justify-center active:scale-90 shadow-2xl"
              >
                <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-200"></div>
              </button>
            ) : !isRecording ? (
              <button
                onClick={startVideoRecording}
                className="w-20 h-20 rounded-full bg-red-600 border-4 border-red-300 hover:bg-red-500 transition-all flex items-center justify-center active:scale-90 shadow-2xl"
              >
                <div className="w-8 h-8 rounded-full bg-red-700"></div>
              </button>
            ) : (
              <button
                onClick={stopVideoRecording}
                className="w-20 h-20 rounded-full bg-red-600 border-4 border-red-300 hover:bg-red-500 transition-all flex items-center justify-center animate-pulse active:scale-90 shadow-2xl"
              >
                <div className="w-8 h-8 rounded-sm bg-white"></div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* İnşaat Medya - Başlık/Açıklama Formu */}
      {constructionPendingFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload size={28} className="text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Medya Yükle</h3>
            <p className="text-xs text-gray-400 text-center mb-4">
              {constructionPendingFileName || "Dosya seçildi"}
            </p>
            {/* Preview */}
            <div className="mb-4 flex justify-center">
              {constructionPendingFile.type?.startsWith("video/") ? (
                <video src={constructionPendingUrl!} className="max-h-40 rounded-lg" controls playsInline />
              ) : (
                <img src={constructionPendingUrl!} alt="Önizleme" className="max-h-40 rounded-lg object-contain" />
              )}
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Başlık (opsiyonel)</label>
                <input
                  type="text"
                  value={constructionMediaTitle}
                  onChange={(e) => setConstructionMediaTitle(e.target.value)}
                  placeholder="Medya başlığı..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama (opsiyonel)</label>
                <textarea
                  value={constructionMediaDesc}
                  onChange={(e) => setConstructionMediaDesc(e.target.value)}
                  placeholder="Medya açıklaması..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setConstructionPendingFile(null); setConstructionPendingFileName(""); setConstructionMediaTitle(""); setConstructionMediaDesc(""); }}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >İptal</button>
              <button
                onClick={confirmConstructionMediaUpload}
                disabled={constructionMediaUploading}
                className="px-5 py-2.5 bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {constructionMediaUploading ? "Yükleniyor..." : "Yükle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* İnşaat Medya - Silme Onay Popup */}
      {constructionDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Medya Silinecek</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              <span className="font-medium text-gray-700">&ldquo;{constructionDeleteConfirm.fileName}&rdquo;</span> medyasını silmek istediğinize emin misiniz?
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConstructionDeleteConfirm(null)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >İptal</button>
              <button
                onClick={async () => {
                  const { mediaId, fromGallery } = constructionDeleteConfirm;
                  setConstructionDeleteConfirm(null);
                  await handleDeleteConstructionMedia(mediaId);
                  if (fromGallery) {
                    if (constructionMedias.length <= 1) {
                      setConstructionMediaMode("upload");
                    } else if (constructionViewIndex >= constructionMedias.length - 1) {
                      setConstructionViewIndex(Math.max(0, constructionViewIndex - 1));
                    }
                  }
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
              >Sil</button>
            </div>
          </div>
        </div>
      )}

      {/* İnşaat Medya - Düzenleme Popup */}
      {editingMediaId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4 construction-edit-popup" onClick={() => setEditingMediaId(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Edit3 size={28} className="text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-4">Medya Bilgilerini Düzenle</h3>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Başlık</label>
                <input
                  type="text"
                  value={editMediaTitle}
                  onChange={(e) => setEditMediaTitle(e.target.value)}
                  placeholder="Medya başlığı..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
                <textarea
                  value={editMediaDesc}
                  onChange={(e) => setEditMediaDesc(e.target.value)}
                  placeholder="Medya açıklaması..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setEditingMediaId(null)} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
              <button
                onClick={() => handleUpdateConstructionMedia(editingMediaId, editMediaTitle, editMediaDesc)}
                className="px-5 py-2.5 bg-[#1e3a5f] hover:bg-[#16304f] text-white rounded-lg text-sm font-medium"
              >Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Dosya Adı Belirleme Popup - Yükleme öncesi */}
      {pendingFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload size={28} className="text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Dosya Adı Belirle</h3>
            <p className="text-xs text-gray-400 text-center mb-4">Uzantı otomatik eklenir: <span className="font-medium text-gray-600">{getFileExt(pendingFile.file.name)}</span></p>
            <div className="flex items-center gap-1 mb-5">
              <input
                type="text"
                value={pendingFileName}
                onChange={(e) => setPendingFileName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmUpload()}
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                autoFocus
              />
              <span className="text-sm text-gray-500 font-medium">{getFileExt(pendingFile.file.name)}</span>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setPendingFile(null)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
              <button onClick={handleConfirmUpload}
                className="px-5 py-2.5 bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg text-sm font-medium">Yükle</button>
            </div>
          </div>
        </div>
      )}

      {/* Dosya Silme Onay Popup */}
      {deletingDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Dosya Silinecek</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              <span className="font-medium text-gray-700">&ldquo;{deletingDoc.doc.fileName}&rdquo;</span> dosyasını silmek istediğinize emin misiniz?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeletingDoc(null)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
              <button onClick={confirmDelete}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Sil</button>
            </div>
          </div>
        </div>
      )}

      {/* Dosya Adı Düzenleme Popup */}
      {renamingDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Edit3 size={28} className="text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Dosya Adını Düzenle</h3>
            <p className="text-xs text-gray-400 text-center mb-4">Uzantı: <span className="font-medium text-gray-600">{getFileExt(renamingDoc.doc.fileName)}</span></p>
            <div className="flex items-center gap-1 mb-5">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRenameDoc()}
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                autoFocus
              />
              <span className="text-sm text-gray-500 font-medium">{getFileExt(renamingDoc.doc.fileName)}</span>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setRenamingDoc(null)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
              <button onClick={handleRenameDoc}
                className="px-5 py-2.5 bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg text-sm font-medium">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Kat Bağlantıları Popup — doküman bazlı */}
      {floorAttachDoc && activeBlock && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setFloorAttachDoc(null); setAttachingFloor(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 border-[5px] border-[#1e3a5f] max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Layers size={20} className="text-[#1e3a5f]" />
              <h3 className="text-lg font-semibold text-gray-800">Kat Bağlantıları</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4 truncate">{floorAttachDoc.fileName} — {activeBlock.name}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {activeBlock.floors.map((floor) => {
                const atts = floorAttachments[floor.id] || [];
                return (
                  <div key={floor.id} className="bg-gray-50 rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#1e3a5f] truncate">{floor.name}</span>
                      <button
                        onClick={() => { setAttachingFloor(floor); setAttachPage(""); }}
                        className="w-5 h-5 rounded-full bg-[#1e3a5f] hover:bg-[#c0392b] text-white flex items-center justify-center transition-colors flex-shrink-0"
                        title="Sayfa Bağla"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    {atts.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {atts.map((att) => (
                          <div key={att.id} className="flex items-center gap-1 bg-white rounded border border-gray-200 px-1.5 py-0.5">
                            <span className="text-[10px] text-gray-600" title={`Sayfa ${att.pageNumber}`}>S.{att.pageNumber}</span>
                            <button onClick={() => handleRemoveFloorAttachment(att.id)} className="text-gray-300 hover:text-red-500 transition-colors"><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-300">Bağlı sayfa yok</p>
                    )}

                    {/* İnline sayfa numarası girişi */}
                    {attachingFloor?.id === floor.id && (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          type="number"
                          min={1}
                          value={attachPage}
                          onChange={(e) => setAttachPage(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddFloorAttachment()}
                          placeholder="Sayfa no"
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:ring-1 focus:ring-[#1e3a5f] min-w-0"
                          autoFocus
                        />
                        <button
                          onClick={handleAddFloorAttachment}
                          disabled={!attachPage}
                          className="px-2 py-1 bg-[#1e3a5f] hover:bg-[#152d4a] disabled:bg-gray-300 text-white rounded text-xs font-medium transition-colors"
                        >
                          Ekle
                        </button>
                        <button
                          onClick={() => setAttachingFloor(null)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button onClick={() => { setFloorAttachDoc(null); setAttachingFloor(null); }}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Yükleme Progress Overlay */}
      {uploadProgress !== null && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[280px] bg-white rounded-xl shadow-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#1e3a5f] border-t-transparent flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700 truncate">Yükleniyor... %{uploadProgress}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-[#1e3a5f] h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Yükleme Başarılı Toast */}
      {uploadSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-green-600 text-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle size={18} />
          <span className="text-sm font-medium truncate max-w-[200px]">{uploadSuccess}</span>
          <span className="text-sm opacity-90">yüklendi</span>
        </div>
      )}

      {/* Metraj Bilgisi Modal */}
      {metrajModalOpen && (
        <div className={`fixed inset-0 z-[60] bg-black/50 ${isMobile ? "" : "flex items-center justify-center p-4"}`} onClick={() => !metrajSaving && setMetrajModalOpen(false)}>
          <div
            className={`bg-white flex flex-col ${isMobile ? "w-full h-full" : "rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center gap-2 border-b border-gray-200 ${isMobile ? "modal-safe-top px-2 pb-3" : "justify-between px-6 py-4"}`}>
              {isMobile && (
                <button
                  onClick={() => !metrajSaving && setMetrajModalOpen(false)}
                  disabled={metrajSaving}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-gray-100 active:scale-90 text-gray-700 shrink-0 transition disabled:opacity-50"
                  aria-label="Geri"
                >
                  <ArrowLeft size={24} />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-800 truncate">Metraj Bilgisi</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">Şantiye için planlanan malzeme listesini düzenleyin</p>
              </div>
              {!isMobile && (
                <button
                  onClick={() => !metrajSaving && setMetrajModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                  disabled={metrajSaving}
                >
                  <X size={22} />
                </button>
              )}
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <MetrajForm items={metrajItems} onChange={setMetrajItems} />
              {metrajSaveError && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                  {metrajSaveError}
                </div>
              )}
            </div>
            <div
              className="px-4 sm:px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3"
              style={isMobile ? { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" } : undefined}
            >
              <div className="text-xs text-gray-500">
                {metrajItems.length} kalem
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => !metrajSaving && setMetrajModalOpen(false)}
                  className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-base font-semibold"
                  disabled={metrajSaving}
                >
                  İptal
                </button>
                <button
                  onClick={async () => {
                    setMetrajSaving(true);
                    setMetrajSaveError("");
                    try {
                      const res = await fetch(`/api/sites/${params.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ metraj: metrajItems }),
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        setMetrajSaveError(data.error || "Kaydetme başarısız");
                        return;
                      }
                      // Local site state'i güncelle
                      setSite((prev) => prev ? { ...prev, config: { ...(prev.config || {}), metraj: metrajItems } } : prev);
                      setMetrajModalOpen(false);
                    } catch {
                      setMetrajSaveError("Bağlantı hatası");
                    } finally {
                      setMetrajSaving(false);
                    }
                  }}
                  className="px-8 py-3 bg-[#c0392b] hover:bg-[#922b21] text-white rounded-xl text-base font-semibold disabled:opacity-50"
                  disabled={metrajSaving}
                >
                  {metrajSaving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
