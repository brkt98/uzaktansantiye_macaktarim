"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import Link from "next/link";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useDevice } from "@/hooks/useDevice";
import {
  Users as UsersIcon,
  HardHat,
  Truck,
  X,
  ArrowLeft,
  Hammer,
  Camera,
  Video,
  Image as ImageIcon,
  Upload,
  Eye,
  Trash2,
  Plus,
  History,
  ChevronLeft as ArrowLeftIcon,
  ChevronRight as ArrowRightIcon,
  Loader2,
  Check,
  Building2,
  Layers,
  CheckCircle,
  FolderOpen,
  Edit3,
  Download,
  Share2,
  Maximize2,
  Minimize2,
  Flag,
  Warehouse,
  Minus,
  AlertTriangle,
  LogOut,
  CalendarOff,
  ClipboardList,
  BookOpen,
  Trees,
  Paintbrush,
  FileText,
} from "lucide-react";
import AriszaTracker from "./AriszaTracker";
import MediaViewer from "../satis/_components/MediaViewer";

interface SiteOption {
  id: string;
  name: string;
  status: string;
  blocks: Block[];
}

interface Block {
  id: string;
  name: string;
}

interface ConstructionFloor {
  id: string;
  name: string;
  works: ConstructionWork[];
}

interface ConstructionWork {
  id: string;
  name: string;
  entries?: { id: string; status: string; media?: { id: string }[] }[];
}

interface MediaItem {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  title: string | null;
  description?: string | null;
  createdAt?: string | null;
}

interface PersonnelRecord {
  id: string;
  personnelName: string;
  company: string | null;
  workDuration: string;
}

// Şantiye seçim ekranında "bugün eklenen personel" listesi için (siteId bazlı tüm kayıt)
interface DayPersonnelEntry {
  id: string;
  siteId: string;
  personnelName: string;
  company: string | null;
  workDuration: string;
  workName: string;
  floorName: string | null;
}

// Aynı kişi + aynı iş kayıtlarını tek satırda topla; daireleri/katları (floorName) listele.
// İnce İnşaat'ta aynı kişi her daireye ayrı kayıt olur → 8 satır yerine tek satır + "Daire 1, Daire 2, …".
interface GroupedDayPersonnel {
  personnelName: string;
  company: string | null;
  workName: string;
  workDuration: string;
  floors: string[];
  count: number;
}
function groupSitePersonnel(entries: DayPersonnelEntry[]): GroupedDayPersonnel[] {
  const map = new Map<string, GroupedDayPersonnel>();
  for (const e of entries) {
    const key = [
      e.personnelName.trim().toLocaleLowerCase("tr-TR"),
      (e.workName || "").trim().toLocaleLowerCase("tr-TR"),
      (e.company || "").trim().toLocaleLowerCase("tr-TR"),
      e.workDuration,
    ].join("||");
    let g = map.get(key);
    if (!g) {
      g = { personnelName: e.personnelName, company: e.company, workName: e.workName, workDuration: e.workDuration, floors: [], count: 0 };
      map.set(key, g);
    }
    g.count++;
    if (e.floorName && !g.floors.includes(e.floorName)) g.floors.push(e.floorName);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    // Daire 1, Daire 2, … Daire 10 (doğal/sayısal sıra)
    g.floors.sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
  }
  return groups;
}

const UNIT_OPTIONS = [
  "adet", "torba", "kg", "ton", "metre", "metrekare", "metreküp",
  "litre", "paket", "kutu", "palet", "rulo", "takım", "çuval",
];

const mediaDateKey = (createdAt?: string | null) => {
  const date = createdAt ? new Date(createdAt) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return [
    safeDate.getFullYear(),
    String(safeDate.getMonth() + 1).padStart(2, "0"),
    String(safeDate.getDate()).padStart(2, "0"),
  ].join("-");
};

const mediaDateLabel = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

interface Props {
  userId: string;
  userFirstName: string;
  userLastName: string;
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ============================================================
   İNŞAAT TABLOSU (Kaba / Bina Genel / Belgeler) — masaüstü tablo + mobil önizleme paylaşır
   ============================================================ */
function ConstructionTable({
  floors,
  entries,
  wizardMode,
  isBulkSelected,
  handleCellClick,
  openCustomWorkModal,
  selectedType,
  interactive = true,
}: {
  floors: ConstructionFloor[];
  entries: Record<string, { id: string; status: string; mediaCount: number }>;
  wizardMode: "personel" | "is" | "teslimat";
  isBulkSelected: (workId: string, floorId?: string) => boolean;
  handleCellClick: (workId: string, workName: string, floorName: string, floorId?: string) => void;
  openCustomWorkModal: (type: string, floorId?: string, floorName?: string, isInce?: boolean) => void;
  selectedType: string;
  interactive?: boolean;
}) {
  let globalNum = 0;
  return (
    <table className={`w-max min-w-full border-collapse ${interactive ? "" : "pointer-events-none"}`}>
      <tbody>
        {floors.map((floor, floorIdx) => (
          <tr key={floor.id} className={floorIdx < floors.length - 1 ? "border-b-[3px] border-[#1e3a5f]/30" : ""}>
            <td className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-base whitespace-nowrap align-middle min-w-[140px] border-r border-[#152d4a] sticky left-0 z-10">
              {floor.name}
            </td>
            {floor.works.map((work) => {
              globalNum++;
              const num = globalNum;
              const entry = entries[work.id];
              const hasMedia = entry && entry.mediaCount > 0;
              const status = entry?.status || "NOT_STARTED";
              const hasStarted = status !== "NOT_STARTED" || hasMedia;
              const floorPrefix = floor.name + " - ";
              const displayName = work.name.startsWith(floorPrefix) ? work.name.slice(floorPrefix.length) : work.name;
              const btnColor = status === "COMPLETED" ? "bg-green-500 text-white hover:bg-green-600" : hasStarted ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
              const isHot = status === "COMPLETED" || hasStarted;
              const selected = wizardMode === "personel" && isBulkSelected(work.id);
              const finalBtnColor = selected ? "bg-yellow-300 text-gray-900 hover:bg-yellow-400 ring-4 ring-yellow-500" : btnColor;
              return (
                <td key={work.id} className="p-1 h-px align-top w-[9.75rem] min-w-[9.75rem] max-w-[9.75rem]">
                  <button onClick={() => handleCellClick(work.id, work.name, floor.name)}
                    className={`construction-cell-btn w-full h-full min-h-[4.5rem] px-3 py-2.5 rounded-lg text-lg font-semibold transition-all leading-snug flex items-center gap-2 ${finalBtnColor}`}>
                    <span className={`shrink-0 text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center ${selected ? "bg-[#1e3a5f] text-white" : (isHot ? "bg-white/30 text-white" : "bg-[#1e3a5f] text-white")}`}>{num}</span>
                    <span className="flex-1 text-left">
                      <span className="block leading-snug">{displayName}</span>
                      {hasMedia && <span className="block text-xs opacity-80 mt-0.5">({entry.mediaCount})</span>}
                    </span>
                  </button>
                </td>
              );
            })}
            {interactive && (
              <td className="p-1 h-px align-top w-14 min-w-14">
                <button
                  onClick={() => openCustomWorkModal(selectedType, floor.id, floor.name, false)}
                  title="Özel iş ekle"
                  className="w-14 h-full min-h-[56px] rounded-lg bg-emerald-50 hover:bg-emerald-100 border-2 border-dashed border-emerald-400 text-emerald-700 flex items-center justify-center transition-all"
                >
                  <Plus size={28} />
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* Telefonda tüm tabloyu önizleme: genişliğe sığar (dik tutuş) + iki parmakla yakınlaştır/uzaklaştır + sürükle. */
function MobileTablePreview({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1, h: 1, cw: 1, ch: 1 });
  // base = fit ölçeği (min scale). scale = mutlak ölçek. pan = mutlak translate (merkezleme dahil — ayrı off YOK).
  const [base, setBase] = useState(1);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const t = useRef<{ dist: number; scale: number; px: number; py: number; cx: number; cy: number } | null>(null);
  const [animate, setAnimate] = useState(true);

  const fitScale = (w: number, h: number, cw: number, ch: number) => Math.min(1, w / cw, h / ch);
  const centerPan = (s: number, w: number, h: number, cw: number, ch: number) => ({
    x: Math.max(0, (w - cw * s) / 2),
    y: Math.max(0, (h - ch * s) / 2),
  });
  // Pan'ı içerik konteyner içinde kalacak şekilde sıkıştır (eksen bazlı): sığıyorsa ortala, değilse kenara clamp.
  const clampPan = (px: number, py: number, s: number, w: number, h: number, cw: number, ch: number) => {
    const cwS = cw * s, chS = ch * s;
    const cx = cwS <= w ? (w - cwS) / 2 : Math.min(0, Math.max(w - cwS, px));
    const cy = chS <= h ? (h - chS) / 2 : Math.min(0, Math.max(h - chS, py));
    return { x: cx, y: cy };
  };

  useIsoLayoutEffect(() => {
    const measure = () => {
      const w = wrapRef.current?.clientWidth || 1;
      const h = wrapRef.current?.clientHeight || 1;
      const cw = innerRef.current?.scrollWidth || 1;
      const ch = innerRef.current?.scrollHeight || 1;
      setDims({ w, h, cw, ch });
      // Yön/boyut değişince: base yeniden hesapla, scale=base, pan=ortalanmış → dik/yatay geçişte tam sığar.
      const b = fitScale(w, h, cw, ch);
      setBase(b);
      setScale(b);
      setPan(centerPan(b, w, h, cw, ch));
    };
    measure();
    const id = window.setTimeout(measure, 120);
    window.addEventListener("resize", measure);
    return () => { window.clearTimeout(id); window.removeEventListener("resize", measure); };
  }, []);

  // Dokunuş noktasını wrapper-lokal koordinata çevir (odak matematiği için).
  const localPoint = (clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { mx: clientX - (r?.left || 0), my: clientY - (r?.top || 0) };
  };

  return (
    <div className="fixed inset-0 z-[80] bg-gray-900 flex flex-col" style={{ touchAction: "none" }}>
      <div className="modal-safe-top flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-medium text-sm">
          <ArrowLeft size={18} /> Geri
        </button>
        <span className="font-semibold truncate px-2">{title}</span>
        <span className="w-[68px] shrink-0" />
      </div>
      <div
        ref={wrapRef}
        className="flex-1 overflow-hidden"
        onTouchStart={(e) => {
          setAnimate(false);
          if (e.touches.length === 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY;
            const { mx, my } = localPoint(
              (e.touches[0].clientX + e.touches[1].clientX) / 2,
              (e.touches[0].clientY + e.touches[1].clientY) / 2,
            );
            t.current = { dist: Math.sqrt(dx * dx + dy * dy), scale, px: pan.x, py: pan.y, cx: mx, cy: my };
          } else if (e.touches.length === 1) {
            const { mx, my } = localPoint(e.touches[0].clientX, e.touches[0].clientY);
            t.current = { dist: 0, scale, px: pan.x, py: pan.y, cx: mx, cy: my };
          }
        }}
        onTouchMove={(e) => {
          if (!t.current) return;
          if (e.touches.length === 2 && t.current.dist > 0) {
            e.preventDefault();
            const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY;
            const d = Math.sqrt(dx * dx + dy * dy);
            const sPrev = t.current.scale;
            const sNew = Math.min(base * 5, Math.max(base, sPrev * (d / t.current.dist)));
            // ODAK: T' = T + (m - T) * (1 - S'/S) → origin top-left iken parmakların ortası sabit kalır.
            const k = 1 - sNew / sPrev;
            const nx = t.current.px + (t.current.cx - t.current.px) * k;
            const ny = t.current.py + (t.current.cy - t.current.py) * k;
            const c = clampPan(nx, ny, sNew, dims.w, dims.h, dims.cw, dims.ch);
            setScale(sNew);
            setPan(c);
          } else if (e.touches.length === 1) {
            e.preventDefault();
            const { mx, my } = localPoint(e.touches[0].clientX, e.touches[0].clientY);
            const nx = t.current.px + (mx - t.current.cx);
            const ny = t.current.py + (my - t.current.cy);
            setPan(clampPan(nx, ny, scale, dims.w, dims.h, dims.cw, dims.ch));
          }
        }}
        onTouchEnd={(e) => {
          if (e.touches.length === 0) {
            setAnimate(true);
            if (scale <= base * 1.02) {
              setScale(base);
              setPan(centerPan(base, dims.w, dims.h, dims.cw, dims.ch));
            } else {
              setPan((p) => clampPan(p.x, p.y, scale, dims.w, dims.h, dims.cw, dims.ch));
            }
            t.current = null;
          } else if (e.touches.length === 1) {
            // İki parmaktan tek parmağa düşünce baz çizgisini güncelle (zıplama önlenir).
            const { mx, my } = localPoint(e.touches[0].clientX, e.touches[0].clientY);
            t.current = { dist: 0, scale, px: pan.x, py: pan.y, cx: mx, cy: my };
          }
        }}
      >
        <div ref={innerRef} style={{ width: "max-content", transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "top left", transition: animate ? "transform 0.18s ease-out" : "none" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SiteChiefDashboard({ userId, userFirstName, userLastName }: Props) {
  // ── Wizard state ──
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<"personel" | "is" | "teslimat">("personel");
  const [wizardStep, setWizardStep] = useState(1); // 1=site, 2=block, 3=type, 4=table
  // Telefonda Kaba/Bina Genel/Belgeler 2B tablo yerine: kat dropdown + işler buton
  const { isMobile } = useDevice();
  const [mobileTableFloorId, setMobileTableFloorId] = useState<string>("");
  // Telefonda tüm 2B tabloyu önizleme (yeşil/turuncu durumlarla, genişliğe sığar + pinch-zoom)
  const [mobileTablePreview, setMobileTablePreview] = useState(false);

  // ── Depo Kontrol state ──
  type DepoMaterial = { id: string; name: string; unit: string };
  type DepoMedia = { id: string; url: string; mimeType: string; fileName: string | null };
  type DepoWarehouseMaterial = { id: string; warehouseId: string; materialId: string; quantity: number; minStock: number | null; notes: string | null; material: DepoMaterial; media: DepoMedia[] };
  type DepoWarehouse = { id: string; name: string; sortOrder: number; materials: DepoWarehouseMaterial[] };

  const [depoOpen, setDepoOpen] = useState(false);
  const [ariszaOpen, setAriszaOpen] = useState(false);
  const [ariszaModalMode, setAriszaModalMode] = useState<"menu" | "new" | "open" | "resolved">("menu");
  // Şantiye Arıza (siteId-scoped)
  const [santiyeAriszaOpen, setSantiyeAriszaOpen] = useState(false);
  const [santiyeAriszaSiteId, setSantiyeAriszaSiteId] = useState<string>("");
  const [santiyeAriszaMode, setSantiyeAriszaMode] = useState<"siteSelect" | "menu" | "tracker">("siteSelect");
  const [santiyeAriszaAction, setSantiyeAriszaAction] = useState<"new" | "open" | "resolved">("open");
  const [depoLoading, setDepoLoading] = useState(false);
  const [depoWarehouses, setDepoWarehouses] = useState<DepoWarehouse[]>([]);
  const [depoAllMaterials, setDepoAllMaterials] = useState<DepoMaterial[]>([]);
  const [depoActiveTab, setDepoActiveTab] = useState(0);
  const [depoSearch, setDepoSearch] = useState("");

  // Add modal
  const [depoAddOpen, setDepoAddOpen] = useState(false);
  const [depoAddMaterialId, setDepoAddMaterialId] = useState("");
  const [depoAddNewName, setDepoAddNewName] = useState("");
  const [depoAddNewUnit, setDepoAddNewUnit] = useState("adet");
  const [depoAddQty, setDepoAddQty] = useState("");

  // Withdraw modal
  const [depoWdOpen, setDepoWdOpen] = useState(false);
  const [depoWdMaterialId, setDepoWdMaterialId] = useState("");
  const [depoWdQty, setDepoWdQty] = useState("");

  const [depoSaving, setDepoSaving] = useState(false);
  const [depoNotice, setDepoNotice] = useState<{ title: string; message: string; type: "warning" | "error" | "info" | "success" } | null>(null);
  const showDepoNotice = (message: string, type: "warning" | "error" | "info" | "success" = "warning", title?: string) => {
    setDepoNotice({
      title: title ?? (type === "error" ? "Hata" : type === "info" ? "Bilgi" : type === "success" ? "Başarılı" : "Uyarı"),
      message,
      type,
    });
  };

  // ── Depo Media state ──
  const [depoAddPendingFiles, setDepoAddPendingFiles] = useState<File[]>([]);
  const [depoSelectedStock, setDepoSelectedStock] = useState<DepoWarehouseMaterial | null>(null);
  const [depoStockPendingFiles, setDepoStockPendingFiles] = useState<File[]>([]);
  const [depoViewerMedia, setDepoViewerMedia] = useState<{ list: DepoMedia[]; index: number } | null>(null);
  const [depoCameraActive, setDepoCameraActive] = useState(false);
  const [depoCameraType, setDepoCameraType] = useState<"photo" | "video">("photo");
  const [depoCameraTarget, setDepoCameraTarget] = useState<"add" | "stock">("add");
  const [depoIsRecording, setDepoIsRecording] = useState(false);
  const depoCameraVideoRef = useRef<HTMLVideoElement>(null);
  const depoCameraStreamRef = useRef<MediaStream | null>(null);
  const depoMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const depoRecordedChunksRef = useRef<Blob[]>([]);
  const depoAddFileInputRef = useRef<HTMLInputElement>(null);
  const depoAddPhotoCaptureRef = useRef<HTMLInputElement>(null);
  const depoAddVideoCaptureRef = useRef<HTMLInputElement>(null);
  const depoStockFileInputRef = useRef<HTMLInputElement>(null);
  const depoStockPhotoCaptureRef = useRef<HTMLInputElement>(null);
  const depoStockVideoCaptureRef = useRef<HTMLInputElement>(null);

  const fetchDepo = useCallback(async () => {
    setDepoLoading(true);
    try {
      const [whRes, matRes] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }),
        fetch("/api/warehouses/materials", { cache: "no-store" }),
      ]);
      if (whRes.ok) {
        const data = await whRes.json();
        const updatedWarehouses = data.warehouses || [];
        setDepoWarehouses(updatedWarehouses);
        setDepoSelectedStock((prev) => {
          if (!prev) return prev;
          for (const wh of updatedWarehouses) {
            const found = wh.materials.find((m: DepoWarehouseMaterial) => m.id === prev.id);
            if (found) return found;
          }
          return prev;
        });
      }
      if (matRes.ok) {
        const data = await matRes.json();
        setDepoAllMaterials(data.materials || []);
      }
    } catch (err) {
      console.error("Depo fetch error:", err);
    } finally {
      setDepoLoading(false);
    }
  }, []);

  const openDepo = () => {
    setDepoOpen(true);
    setDepoActiveTab(0);
    setDepoSearch("");
    fetchDepo();
  };

  const depoActiveWarehouse = depoWarehouses[depoActiveTab];

  const handleDepoAdd = async () => {
    if (!depoActiveWarehouse) return;
    setDepoSaving(true);
    try {
      let materialId = depoAddMaterialId;

      if (!materialId && depoAddNewName.trim()) {
        const res = await fetch("/api/warehouses/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: depoAddNewName.trim(), unit: depoAddNewUnit }),
        });
        const data = await res.json();
        if (!res.ok) {
          showDepoNotice(data.error || "Malzeme oluşturulamadı", "error");
          return;
        }
        materialId = data.material.id;
      }

      if (!materialId) {
        showDepoNotice("Malzeme seçin veya yeni malzeme adı girin", "warning");
        return;
      }

      const qty = parseFloat(depoAddQty) || 0;
      const existing = depoActiveWarehouse.materials.find(m => m.materialId === materialId);
      const newQty = (existing?.quantity || 0) + qty;

      const res = await fetch("/api/warehouses/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: depoActiveWarehouse.id,
          materialId,
          quantity: newQty,
          minStock: existing?.minStock ?? null,
          notes: existing?.notes ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showDepoNotice(data.error || "Hata oluştu", "error");
        return;
      }

      const stockData = await res.json();
      if (!depoAddMaterialId && depoAddPendingFiles.length > 0 && stockData.warehouseMaterial?.id) {
        try {
          await uploadDepoStockMedia(stockData.warehouseMaterial.id, depoAddPendingFiles);
        } catch (mediaError) {
          showDepoNotice(mediaError instanceof Error ? mediaError.message : "Medya yükleme hatası", "warning");
        }
      }

      setDepoAddOpen(false);
      setDepoAddMaterialId("");
      setDepoAddNewName("");
      setDepoAddNewUnit("adet");
      setDepoAddQty("");
      setDepoAddPendingFiles([]);
      fetchDepo();
    } catch (err) {
      console.error("Depo add error:", err);
      showDepoNotice("Bir hata oluştu", "error");
    } finally {
      setDepoSaving(false);
    }
  };

  const handleDepoWithdraw = async () => {
    if (!depoActiveWarehouse) return;
    if (!depoWdMaterialId) {
      showDepoNotice("Lütfen çıkartılacak malzemeyi seçin.", "warning");
      return;
    }
    const qty = parseFloat(depoWdQty);
    if (!qty || qty <= 0) {
      showDepoNotice("Lütfen geçerli bir miktar girin.", "warning");
      return;
    }
    const wm = depoActiveWarehouse.materials.find(m => m.id === depoWdMaterialId);
    if (!wm) return;
    if (qty > wm.quantity) {
      showDepoNotice(
        `Stokta yeterli miktar yok.\n\nMevcut: ${wm.quantity} ${wm.material.unit}\nÇıkartılmak istenen: ${qty} ${wm.material.unit}`,
        "warning",
        "Yetersiz Stok"
      );
      return;
    }

    setDepoSaving(true);
    try {
      const res = await fetch("/api/warehouses/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: depoActiveWarehouse.id,
          materialId: wm.materialId,
          quantity: wm.quantity - qty,
          minStock: wm.minStock,
          notes: wm.notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showDepoNotice(data.error || "Hata oluştu", "error");
        return;
      }
      setDepoWdOpen(false);
      setDepoWdMaterialId("");
      setDepoWdQty("");
      fetchDepo();
    } catch (err) {
      console.error("Depo withdraw error:", err);
      showDepoNotice("Bir hata oluştu", "error");
    } finally {
      setDepoSaving(false);
    }
  };

  // ── Depo Media handlers ──
  const depoMediaUrl = (mediaId: string) => `/api/warehouses/stock/media/${mediaId}`;

  const appendDepoFiles = useCallback((target: "add" | "stock", files: File[]) => {
    if (target === "add") setDepoAddPendingFiles((prev) => [...prev, ...files]);
    else setDepoStockPendingFiles((prev) => [...prev, ...files]);
  }, []);

  const handleDepoMediaFiles = useCallback((target: "add" | "stock", e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    appendDepoFiles(target, files);
    if (e.target) e.target.value = "";
  }, [appendDepoFiles]);

  const closeDepoCamera = useCallback(() => {
    if (depoCameraStreamRef.current) {
      depoCameraStreamRef.current.getTracks().forEach((t) => t.stop());
      depoCameraStreamRef.current = null;
    }
    if (depoMediaRecorderRef.current && depoMediaRecorderRef.current.state !== "inactive") {
      depoMediaRecorderRef.current.stop();
    }
    depoMediaRecorderRef.current = null;
    depoRecordedChunksRef.current = [];
    setDepoIsRecording(false);
    setDepoCameraActive(false);
  }, []);

  const startDepoCamera = useCallback(async (target: "add" | "stock", type: "photo" | "video") => {
    setDepoCameraTarget(target);
    setDepoCameraType(type);
    if (navigator.maxTouchPoints > 0) {
      if (target === "add") {
        if (type === "photo") depoAddPhotoCaptureRef.current?.click();
        else depoAddVideoCaptureRef.current?.click();
      } else {
        if (type === "photo") depoStockPhotoCaptureRef.current?.click();
        else depoStockVideoCaptureRef.current?.click();
      }
      return;
    }
    if (depoCameraStreamRef.current) {
      depoCameraStreamRef.current.getTracks().forEach((t) => t.stop());
      depoCameraStreamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: type === "video",
      });
      depoCameraStreamRef.current = stream;
      setDepoCameraActive(true);
      const tryAttach = () => {
        if (depoCameraVideoRef.current) {
          depoCameraVideoRef.current.srcObject = stream;
          depoCameraVideoRef.current.play().catch(() => {});
        } else {
          requestAnimationFrame(tryAttach);
        }
      };
      requestAnimationFrame(tryAttach);
    } catch {
      if (target === "add") {
        if (type === "photo") depoAddPhotoCaptureRef.current?.click();
        else depoAddVideoCaptureRef.current?.click();
      } else {
        if (type === "photo") depoStockPhotoCaptureRef.current?.click();
        else depoStockVideoCaptureRef.current?.click();
      }
    }
  }, []);

  const captureDepoPhoto = useCallback(() => {
    if (!depoCameraVideoRef.current) return;
    const video = depoCameraVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      appendDepoFiles(depoCameraTarget, [new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" })]);
      closeDepoCamera();
    }, "image/jpeg", 0.9);
  }, [appendDepoFiles, depoCameraTarget, closeDepoCamera]);

  const startDepoVideoRecording = useCallback(() => {
    if (!depoCameraStreamRef.current) return;
    depoRecordedChunksRef.current = [];
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
    const recorder = new MediaRecorder(depoCameraStreamRef.current, selectedMime ? { mimeType: selectedMime } : {});
    const actualMime = recorder.mimeType;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) depoRecordedChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(depoRecordedChunksRef.current, { type: actualMime });
      const ext = actualMime.includes("mp4") ? "mp4" : "webm";
      appendDepoFiles(depoCameraTarget, [new File([blob], `video_${Date.now()}.${ext}`, { type: actualMime })]);
      closeDepoCamera();
    };
    depoMediaRecorderRef.current = recorder;
    recorder.start(1000);
    setDepoIsRecording(true);
  }, [appendDepoFiles, depoCameraTarget, closeDepoCamera]);

  const stopDepoVideoRecording = useCallback(() => {
    if (depoMediaRecorderRef.current && depoMediaRecorderRef.current.state !== "inactive") {
      depoMediaRecorderRef.current.stop();
      setDepoIsRecording(false);
    }
  }, []);

  const uploadDepoStockMedia = async (stockId: string, files: File[]) => {
    if (files.length === 0) return [] as DepoMedia[];
    const fd = new FormData();
    for (const file of files) fd.append("files", file);
    const res = await fetch(`/api/warehouses/stock/${stockId}/media`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Medya yükleme hatası");
    return (data.media || []) as DepoMedia[];
  };

  const openDepoStockMedia = (wm: DepoWarehouseMaterial) => {
    setDepoSelectedStock(wm);
    setDepoStockPendingFiles([]);
  };

  const handleUploadDepoSelectedStockMedia = async () => {
    if (!depoSelectedStock || depoStockPendingFiles.length === 0) return;
    setDepoSaving(true);
    try {
      const created = await uploadDepoStockMedia(depoSelectedStock.id, depoStockPendingFiles);
      setDepoSelectedStock({ ...depoSelectedStock, media: [...(depoSelectedStock.media || []), ...created] });
      setDepoStockPendingFiles([]);
      fetchDepo();
    } catch (error) {
      showDepoNotice(error instanceof Error ? error.message : "Medya yükleme hatası", "error");
    } finally {
      setDepoSaving(false);
    }
  };

  const handleDeleteDepoStockMedia = async (mediaId: string) => {
    if (!depoSelectedStock) return;
    try {
      const res = await fetch(`/api/warehouses/stock/${depoSelectedStock.id}/media/${mediaId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showDepoNotice(data.error || "Medya silinemedi", "error");
        return;
      }
      const nextMedia = (depoSelectedStock.media || []).filter((m) => m.id !== mediaId);
      setDepoSelectedStock({ ...depoSelectedStock, media: nextMedia });
      setDepoViewerMedia((viewer) => {
        if (!viewer) return viewer;
        const nextList = viewer.list.filter((m) => m.id !== mediaId);
        if (nextList.length === 0) return null;
        return { list: nextList, index: Math.min(viewer.index, nextList.length - 1) };
      });
      fetchDepo();
    } catch (error) {
      console.error("Delete depo media error:", error);
      showDepoNotice("Medya silinemedi", "error");
    }
  };

  // ── Site data ──
  const [assignedSites, setAssignedSites] = useState<SiteOption[]>([]);
  const [allSites, setAllSites] = useState<SiteOption[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [dailyCheckLoading, setDailyCheckLoading] = useState(true);
  const [showDailyWelcome, setShowDailyWelcome] = useState(false);
  const [dailySelectedSiteIds, setDailySelectedSiteIds] = useState<string[]>([]);
  const [dailyOffsite, setDailyOffsite] = useState(false);
  const [dailyLeave, setDailyLeave] = useState(false);
  const [offsiteNoteOpen, setOffsiteNoteOpen] = useState(false);
  const [offsiteNote, setOffsiteNote] = useState("");
  const [dailySubmitting, setDailySubmitting] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [selectedSite, setSelectedSite] = useState<SiteOption | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [isPeyzaj, setIsPeyzaj] = useState(false);
  const [selectedType, setSelectedType] = useState<string>(""); // KABA_INSAAT | INCE_INSAAT | BINA_GENEL

  // ── Construction data ──
  const [constructionFloors, setConstructionFloors] = useState<ConstructionFloor[]>([]);
  const [constructionEntries, setConstructionEntries] = useState<Record<string, { id: string; status: string; mediaCount: number }>>({});
  const [constructionLoading, setConstructionLoading] = useState(false);

  // ── İnce İnşaat ──
  const [inceDaires, setInceDaires] = useState<{ id: string; name: string }[]>([]);
  const [inceEntries, setInceEntries] = useState<Record<string, { id: string; mediaCount: number; status: string }>>({});
  const [inceViewMode, setInceViewMode] = useState<"select" | "daire" | "is">("is");
  const [selectedInceDaire, setSelectedInceDaire] = useState<{ id: string; name: string } | null>(null);
  const [selectedInceWork, setSelectedInceWork] = useState<ConstructionWork | null>(null);
  const [inceUnitOverrides, setInceUnitOverrides] = useState<Record<string, { added: string[]; removed: string[] }>>({});

  // ── Custom works (kullanıcının + ile eklediği iş satırları) ──
  const [customWorkIds, setCustomWorkIds] = useState<Set<string>>(new Set());
  const [customInceNames, setCustomInceNames] = useState<Set<string>>(new Set());
  const [customWorkModal, setCustomWorkModal] = useState<{
    type: string;
    floorId?: string;
    floorName?: string;
    isInce?: boolean;
  } | null>(null);
  const [customWorkName, setCustomWorkName] = useState("");
  const [customWorkDaireMode, setCustomWorkDaireMode] = useState<"ALL" | "SELECT">("ALL");
  const [customWorkDaireIds, setCustomWorkDaireIds] = useState<string[]>([]);
  const [customWorkSaving, setCustomWorkSaving] = useState(false);

  // ── Custom delete confirm modal ──
  const [confirmDelete, setConfirmDelete] = useState<{
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmDeleteBusy, setConfirmDeleteBusy] = useState(false);

  // ── Media popup ──
  const [mediaPopup, setMediaPopup] = useState<{ workId: string; workName: string; floorName: string; floorId?: string } | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [entryStartDate, setEntryStartDate] = useState("");
  const [entryEndDate, setEntryEndDate] = useState("");
  const [entryStatus, setEntryStatus] = useState("NOT_STARTED");
  // True only AFTER openMediaPopup fetch resolves; prevents race writes overwriting historical dates.
  const [entryLoaded, setEntryLoaded] = useState(false);
  const [mediaTitle, setMediaTitle] = useState("");
  const [mediaDesc, setMediaDesc] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoFallbackRef = useRef<HTMLInputElement>(null);
  const videoFallbackRef = useRef<HTMLInputElement>(null);
  const mediaGroups = useMemo(() => {
    const groups = new Map<
      string,
      { dateKey: string; label: string; items: Array<{ media: MediaItem; index: number }> }
    >();

    mediaItems.forEach((media, index) => {
      const dateKey = mediaDateKey(media.createdAt);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, { dateKey, label: mediaDateLabel(dateKey), items: [] });
      }
      groups.get(dateKey)!.items.push({ media, index });
    });

    return Array.from(groups.values());
  }, [mediaItems]);

  // ── Camera stream ──
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraType, setCameraType] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // ── Personnel popup context (for personel mode without media popup) ──
  const [personnelContext, setPersonnelContext] = useState<{ workId: string; workName: string; floorName: string; floorId?: string } | null>(null);

  // ── Personnel popup ──
  const [personnelPopupOpen, setPersonnelPopupOpen] = useState(false);
  const [personnelRecords, setPersonnelRecords] = useState<PersonnelRecord[]>([]);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  // ── Bugün eklenen personel (şantiye seçim ekranında, kartların altında) ──
  const [dayPersonnel, setDayPersonnel] = useState<Record<string, DayPersonnelEntry[]>>({});
  const [dayPersonnelLoading, setDayPersonnelLoading] = useState(false);
  const [personnelFormName, setPersonnelFormName] = useState("");
  const [personnelFormCompany, setPersonnelFormCompany] = useState("");
  const [personnelFormDuration, setPersonnelFormDuration] = useState<"FULL_DAY" | "HALF_DAY">("FULL_DAY");
  const [personnelNameSuggestions, setPersonnelNameSuggestions] = useState<string[]>([]);
  const [personnelCompanySuggestions, setPersonnelCompanySuggestions] = useState<string[]>([]);
  const [personnelPairSuggestions, setPersonnelPairSuggestions] = useState<{ name: string; company: string | null }[]>([]);
  const [personnelShowNameSugg, setPersonnelShowNameSugg] = useState(false);
  const [personnelShowCompSugg, setPersonnelShowCompSugg] = useState(false);
  const [personnelFilteredNames, setPersonnelFilteredNames] = useState<string[]>([]);
  const [personnelFilteredComps, setPersonnelFilteredComps] = useState<string[]>([]);
  const [personnelHistoryOpen, setPersonnelHistoryOpen] = useState(false);
  const [personnelHistoryDate, setPersonnelHistoryDate] = useState("");
  const [personnelHistoryRecords, setPersonnelHistoryRecords] = useState<PersonnelRecord[]>([]);
  const [personnelHistoryLoading, setPersonnelHistoryLoading] = useState(false);

  // ── Bulk personel select (multi-select for personel mode) ──
  const [bulkSelected, setBulkSelected] = useState<{ workId: string; workName: string; floorName: string; floorId?: string }[]>([]);
  const [bulkPersonnelMode, setBulkPersonnelMode] = useState(false);
  const [bulkAddedPersonnel, setBulkAddedPersonnel] = useState<{ name: string; company: string | null; duration: "FULL_DAY" | "HALF_DAY" }[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // ── Teslimat form ──
  const [teslimatSiteId, setTeslimatSiteId] = useState("");
  const [teslimatIrsaliyeNo, setTeslimatIrsaliyeNo] = useState("");
  const [teslimatSupplier, setTeslimatSupplier] = useState("");
  const [teslimatReceivedBy, setTeslimatReceivedBy] = useState("");
  const [teslimatDate, setTeslimatDate] = useState("");
  const [teslimatNotes, setTeslimatNotes] = useState("");
  const [teslimatItems, setTeslimatItems] = useState<{ materialName: string; unit: string; quantity: string; unitPrice: string; taxRate: number }[]>([{ materialName: "", unit: "adet", quantity: "", unitPrice: "", taxRate: 0 }]);
  const [teslimatSubmitting, setTeslimatSubmitting] = useState(false);
  // Her kalem için bekleyen dosyalar (paralel dizi)
  const [teslimatItemFiles, setTeslimatItemFiles] = useState<File[][]>([[]]);
  const [teslimatActiveItemIdx, setTeslimatActiveItemIdx] = useState<number | null>(null);
  const teslimatGalleryRef = useRef<HTMLInputElement>(null);
  const teslimatPhotoCaptureRef = useRef<HTMLInputElement>(null);
  const teslimatVideoCaptureRef = useRef<HTMLInputElement>(null);
  const teslimatItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [justAddedTeslimatIdx, setJustAddedTeslimatIdx] = useState<number | null>(null);
  const [teslimatError, setTeslimatError] = useState("");
  const [teslimatMaterialSuggestions, setTeslimatMaterialSuggestions] = useState<string[]>([]);
  const [teslimatSupplierSuggestions, setTeslimatSupplierSuggestions] = useState<string[]>([]);

  // ── Medya Görüntüleme ──
  const [viewMediaMode, setViewMediaMode] = useState(false);
  const [viewMediaIndex, setViewMediaIndex] = useState(0);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [editMediaTitle, setEditMediaTitle] = useState("");
  const [editMediaDesc, setEditMediaDesc] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ mediaId: string; fileName: string; fromGallery?: boolean } | null>(null);
  const [imgZoom, setImgZoom] = useState(1);
  const [imgPan, setImgPan] = useState({ x: 0, y: 0 });
  const [imgFullscreen, setImgFullscreen] = useState(false);
  const imgTouchRef = useRef<{ dist: number; cx: number; cy: number; scale: number; px: number; py: number; moved: boolean; t: number; swipeDx?: number } | null>(null);
  const lastTapRef = useRef(0);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when any modal/popup is open
  useBodyScrollLock(!!(
    wizardOpen || depoOpen || ariszaOpen || santiyeAriszaOpen || depoAddOpen ||
    depoWdOpen || depoNotice || depoViewerMedia || depoCameraActive ||
    offsiteNoteOpen || customWorkModal || confirmDelete || mediaPopup ||
    cameraActive || personnelPopupOpen || editingMediaId || deleteConfirm ||
    viewMediaMode
  ));

  // Sekme gizlenip tekrar görünür olduğunda check-in durumunu yeniden kontrol et.
  // Sayfa gece boyunca açık kalırsa günaydın ekranı yeni gün için otomatik çıkar.
  const lastCheckinDateRef = useRef<string>("");

  useEffect(() => {
    fetchAssignedSites();
    fetchDailyCheckin();
    // Teslimat icin gecmis malzeme/firma onerileri
    fetch("/api/teslimat/suggestions")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setTeslimatMaterialSuggestions(d.materials || []);
          setTeslimatSupplierSuggestions(d.suppliers || []);
        }
      })
      .catch(() => {});

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      // Türkiye saatiyle bugünün tarih anahtarını hesapla
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      const todayKey = `${get("year")}-${get("month")}-${get("day")}`;
      // Tarih değiştiyse günaydın durumunu yeniden sorgula
      if (lastCheckinDateRef.current && lastCheckinDateRef.current !== todayKey) {
        fetchDailyCheckin();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const fetchAssignedSites = async () => {
    setLoadingSites(true);
    try {
      // Get assigned site IDs
      const assignRes = await fetch(`/api/users/${userId}/sites`);
      const assignData = await assignRes.json();
      const siteIds: string[] = assignData.siteIds || [];

      // Get all sites with full data
      const sitesRes = await fetch("/api/sites");
      const sitesData = await sitesRes.json();
      const all: SiteOption[] = (sitesData.sites || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        blocks: (s.blocks || []).map((b: any) => ({ id: b.id, name: b.name })),
      }));
      setAllSites(all);
      setAssignedSites(all.filter((s) => siteIds.includes(s.id)));
    } catch {
      setAssignedSites([]);
      setAllSites([]);
    } finally {
      setLoadingSites(false);
    }
  };

  const fetchDailyCheckin = async () => {
    setDailyCheckLoading(true);
    try {
      const res = await fetch("/api/site-chief/checkin");
      if (!res.ok) {
        setShowDailyWelcome(false);
        return;
      }

      const data = await res.json();
      if (data.date) lastCheckinDateRef.current = data.date;
      setShowDailyWelcome(Boolean(data.eligible && !data.checkedIn));
    } catch {
      setShowDailyWelcome(false);
    } finally {
      setDailyCheckLoading(false);
    }
  };

  const toggleDailySite = (siteId: string) => {
    if (dailyOffsite || dailyLeave) return;
    setDailyError("");
    setDailySelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  };

  const toggleDailyOffsite = () => {
    setDailyError("");
    setDailyOffsite((prev) => {
      const next = !prev;
      if (next) setDailySelectedSiteIds([]);
      if (next) setDailyLeave(false);
      return next;
    });
  };

  const toggleDailyLeave = () => {
    setDailyError("");
    setDailyLeave((prev) => {
      const next = !prev;
      if (next) {
        setDailySelectedSiteIds([]);
        setDailyOffsite(false);
      }
      return next;
    });
  };

  const handleSwitchUser = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const submitDailyCheckin = async (note = "") => {
    setDailyError("");

    if (!dailyOffsite && !dailyLeave && dailySelectedSiteIds.length === 0) {
      setDailyError("Lütfen en az bir şantiye seçin, şantiye harici çalışmayı veya izinli durumunu işaretleyin.");
      return;
    }

    if (dailyOffsite && !note.trim()) {
      setDailyError("Şantiye harici çalışma için not girmeniz gerekiyor.");
      return;
    }

    setDailySubmitting(true);
    try {
      const res = await fetch("/api/site-chief/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: dailyLeave ? "ON_LEAVE" : dailyOffsite ? "OFFSITE" : "SITES",
          siteIds: dailyOffsite || dailyLeave ? [] : dailySelectedSiteIds,
          note: dailyOffsite ? note.trim() : "",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setDailyError(data.error || "Günlük giriş kaydedilemedi.");
        return;
      }

      setOffsiteNoteOpen(false);
      setShowDailyWelcome(false);
    } catch {
      setDailyError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setDailySubmitting(false);
    }
  };

  const handleDailyContinue = () => {
    if (dailyOffsite) {
      setOffsiteNoteOpen(true);
      return;
    }
    submitDailyCheckin();
  };

  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  // Atanmış şantiyeler için bugün eklenen personeli getir (şantiye seçim ekranı)
  const fetchDayPersonnel = useCallback(async () => {
    if (assignedSites.length === 0) {
      setDayPersonnel({});
      return;
    }
    setDayPersonnelLoading(true);
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    try {
      const pairs = await Promise.all(
        assignedSites.map(async (s) => {
          try {
            const res = await fetch(`/api/personnel?siteId=${s.id}&date=${today}`, { cache: "no-store" });
            if (!res.ok) return [s.id, [] as DayPersonnelEntry[]] as const;
            const data = await res.json();
            return [s.id, (data.entries || []) as DayPersonnelEntry[]] as const;
          } catch {
            return [s.id, [] as DayPersonnelEntry[]] as const;
          }
        })
      );
      const map: Record<string, DayPersonnelEntry[]> = {};
      for (const [sid, entries] of pairs) map[sid] = entries;
      setDayPersonnel(map);
    } finally {
      setDayPersonnelLoading(false);
    }
  }, [assignedSites]);

  // Personel ekleme sihirbazı adım 1 (şantiye seçimi) açıldığında listeyi tazele
  useEffect(() => {
    if (wizardOpen && wizardMode === "personel" && wizardStep === 1) {
      fetchDayPersonnel();
    }
  }, [wizardOpen, wizardMode, wizardStep, fetchDayPersonnel]);

  // ── Wizard helpers ──
  const openWizard = (mode: "personel" | "is" | "teslimat") => {
    setWizardMode(mode);
    setWizardStep(1);
    setSelectedSite(null);
    setSelectedBlock(null);
    setIsPeyzaj(false);
    setSelectedType("");
    setConstructionFloors([]);
    setConstructionEntries({});
    setInceDaires([]);
    setInceEntries({});
    setInceViewMode("is");
    setSelectedInceDaire(null);
    setSelectedInceWork(null);

    if (mode === "teslimat") {
      setTeslimatIrsaliyeNo("");
      setTeslimatSupplier("");
      setTeslimatReceivedBy(`${userFirstName} ${userLastName}`);
      setTeslimatDate(todayStr());
      setTeslimatNotes("");
      setTeslimatItems([{ materialName: "", unit: "adet", quantity: "", unitPrice: "", taxRate: 0 }]);
      setTeslimatItemFiles([[]]);
      setTeslimatActiveItemIdx(null);
      setTeslimatSiteId(assignedSites.length === 1 ? assignedSites[0].id : "");
      setTeslimatError("");
    }

    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setMediaPopup(null);
    setPersonnelPopupOpen(false);
    setViewMediaMode(false);
    setPendingFile(null);
    setPendingFileName("");
    setMediaTitle("");
    setMediaDesc("");
    setBulkSelected([]);
    setBulkPersonnelMode(false);
    setBulkAddedPersonnel([]);
  };

  const selectSite = (site: SiteOption) => {
    setSelectedSite(site);
    setWizardStep(2);
  };

  const selectBlock = (block: Block | null, peyzaj: boolean) => {
    setSelectedBlock(block);
    setIsPeyzaj(peyzaj);
    if (peyzaj) {
      setSelectedType("PEYZAJ");
      fetchConstructionData(selectedSite!.id, selectedSite!.id, "PEYZAJ");
      setWizardStep(4);
    } else {
      setWizardStep(3);
    }
  };

  const selectType = (type: string) => {
    setSelectedType(type);
    setMobileTablePreview(false);
    if (type === "INCE_INSAAT") {
      setInceViewMode("is");
    }
    fetchConstructionData(selectedSite!.id, selectedBlock!.id, type);
    setWizardStep(4);
  };

  const fetchCustomWorksMeta = async (siteId: string, blockId: string, type: string) => {
    try {
      const r = await fetch(`/api/construction/custom-works?siteId=${siteId}&blockId=${blockId}&type=${type}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (type === "INCE_INSAAT") {
        setCustomInceNames(new Set<string>((d.customNames as string[]) || []));
      } else {
        setCustomWorkIds(new Set<string>((d.customWorkIds as string[]) || []));
      }
    } catch { /* ignore */ }
  };

  const fetchConstructionData = async (siteId: string, blockId: string | null, type: string) => {
    setConstructionLoading(true);
    setCustomWorkIds(new Set());
    setCustomInceNames(new Set());
    try {
      const url = blockId
        ? `/api/construction?siteId=${siteId}&blockId=${blockId}&type=${type}`
        : `/api/construction?siteId=${siteId}&type=${type}`;
      const res = await fetch(url, { cache: "no-store" });
      if (blockId) { void fetchCustomWorksMeta(siteId, blockId, type); }
      if (res.ok) {
        const data = await res.json();
        setConstructionFloors(data.floors || []);

        if (type === "INCE_INSAAT") {
          setInceUnitOverrides(data.unitOverrides || {});
          setInceDaires(data.daires || []);
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
    } catch {
      // ignore
    } finally {
      setConstructionLoading(false);
    }
  };

  // ── Media popup ──
  const openMediaPopup = async (workId: string, workName: string, floorName: string, floorId?: string) => {
    const blockId = isPeyzaj ? selectedSite!.id : selectedBlock!.id;
    setMediaPopup({ workId, workName, floorName, floorId });
    setMediaItems([]);
    setMediaLoading(true);
    setEntryLoaded(false);
    setEntryStartDate("");
    setEntryEndDate("");
    setEntryStatus("NOT_STARTED");
    setViewMediaMode(false);
    try {
      const fp = floorId ? `&floorId=${floorId}` : "";
      const res = await fetch(`/api/construction/${workId}?blockId=${blockId}${fp}`);
      if (res.ok) {
        const data = await res.json();
        setMediaItems(data.media || []);
        if (data.entry?.startDate) setEntryStartDate(data.entry.startDate.slice(0, 10));
        if (data.entry?.endDate) setEntryEndDate(data.entry.endDate.slice(0, 10));
        if (data.entry?.status) setEntryStatus(data.entry.status);
      }
    } catch { /* ignore */ } finally {
      setMediaLoading(false);
      setEntryLoaded(true);
    }
  };

  const handleMediaUpload = async (file: File, title?: string, desc?: string) => {
    if (!mediaPopup || !selectedSite) return;
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock!.id;
    setMediaUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("blockId", blockId);
      if (mediaPopup.floorId) formData.append("floorId", mediaPopup.floorId);
      if (title?.trim()) formData.append("title", title.trim());
      if (desc?.trim()) formData.append("description", desc.trim());

      const res = await fetch(`/api/construction/${mediaPopup.workId}`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setMediaItems((prev) => [...prev, data.media]);
        if (data.entryStatus) setEntryStatus(data.entryStatus);
        // Auto-set start date like the normal page
        if (data.entryStartDate && !entryStartDate) {
          setEntryStartDate(new Date(data.entryStartDate).toISOString().slice(0, 10));
        }
        // Update entry in the table
        const key = mediaPopup.floorId ? `${mediaPopup.workId}:${mediaPopup.floorId}` : mediaPopup.workId;
        if (selectedType === "INCE_INSAAT") {
          setInceEntries((prev) => ({
            ...prev,
            [key]: { id: key, mediaCount: (prev[key]?.mediaCount || 0) + 1, status: data.entryStatus || "IN_PROGRESS" },
          }));
        } else {
          setConstructionEntries((prev) => ({
            ...prev,
            [mediaPopup.workId]: {
              id: data.media.entryId,
              status: data.entryStatus || "IN_PROGRESS",
              mediaCount: (prev[mediaPopup.workId]?.mediaCount || 0) + 1,
            },
          }));
        }
      }
    } catch { /* ignore */ } finally {
      setMediaUploading(false);
    }
  };

  const handleMediaDelete = async (mediaId: string) => {
    if (!mediaPopup || !selectedSite) return;
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock!.id;
    try {
      const res = await fetch(`/api/construction/${mediaPopup.workId}?mediaId=${mediaId}&blockId=${blockId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMediaItems((prev) => prev.filter((m) => m.id !== mediaId));
        const key = mediaPopup.floorId ? `${mediaPopup.workId}:${mediaPopup.floorId}` : mediaPopup.workId;
        if (selectedType === "INCE_INSAAT") {
          setInceEntries((prev) => ({
            ...prev,
            [key]: { ...prev[key], mediaCount: Math.max(0, (prev[key]?.mediaCount || 1) - 1) },
          }));
        } else {
          setConstructionEntries((prev) => ({
            ...prev,
            [mediaPopup.workId]: { ...prev[mediaPopup.workId], mediaCount: Math.max(0, (prev[mediaPopup.workId]?.mediaCount || 1) - 1) },
          }));
        }
      }
    } catch { /* ignore */ }
  };

  const handleMediaUpdate = async (mediaId: string, title: string, description: string) => {
    if (!mediaPopup || !selectedSite) return;
    try {
      const res = await fetch(`/api/construction/${mediaPopup.workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, title: title.trim() || null, description: description.trim() || null }),
      });
      if (res.ok) {
        setMediaItems(prev => prev.map(m => m.id === mediaId ? { ...m, title: title.trim() || null, description: description.trim() || null } : m));
      }
    } catch { /* ignore */ }
    setEditingMediaId(null);
  };

  const handleDateChange = async (field: "startDate" | "endDate", value: string) => {
    if (!mediaPopup || !selectedSite) return;
    // RACE GUARD: don't write before the entry has loaded—avoids clobbering a historical date.
    if (!entryLoaded) return;
    // Validation: only accept date in the last 10 days. Reject silently to avoid wiping value.
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const tenDaysAgo = new Date(); tenDaysAgo.setDate(tenDaysAgo.getDate() - 10); tenDaysAgo.setHours(0, 0, 0, 0);
    if (value) {
      const d = new Date(value);
      if (isNaN(d.getTime()) || d < tenDaysAgo || d > today) return;
    } else {
      // Empty value would null the DB date; only allow if there is no existing date locally.
      const existing = field === "startDate" ? entryStartDate : entryEndDate;
      if (existing) return; // do not auto-clear an existing date via onChange
    }
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock!.id;
    if (field === "startDate") setEntryStartDate(value);
    else setEntryEndDate(value);
    try {
      const bodyKey = field === "startDate" ? "entryStartDate" : "entryEndDate";
      await fetch(`/api/construction/${mediaPopup.workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [bodyKey]: value || null, blockId, floorId: mediaPopup.floorId || null }),
      });
    } catch { /* ignore */ }
  };

  const handleMarkComplete = async () => {
    if (!mediaPopup || !selectedSite) return;
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock!.id;
    const newStatus = entryStatus === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";
    try {
      const res = await fetch(`/api/construction/${mediaPopup.workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryStatus: newStatus, blockId, floorId: mediaPopup.floorId || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntryStatus(newStatus);
        if (data.entry?.endDate) setEntryEndDate(new Date(data.entry.endDate).toISOString().slice(0, 10));
        else setEntryEndDate("");

        const key = mediaPopup.floorId ? `${mediaPopup.workId}:${mediaPopup.floorId}` : mediaPopup.workId;
        if (selectedType === "INCE_INSAAT") {
          setInceEntries((prev) => ({ ...prev, [key]: { ...prev[key], status: newStatus } }));
        } else {
          setConstructionEntries((prev) => ({ ...prev, [mediaPopup.workId]: { ...prev[mediaPopup.workId], status: newStatus } }));
        }
      }
    } catch { /* ignore */ }
  };

  // ── Personnel popup ──
  const applyConstructionEntryProgress = (
    ctx: { workId: string; floorId?: string },
    constructionEntry?: { id?: string; status?: string; startDate?: string | null; endDate?: string | null } | null
  ) => {
    if (!constructionEntry?.status) return;

    const key = ctx.floorId ? `${ctx.workId}:${ctx.floorId}` : ctx.workId;
    const activeCtx = mediaPopup || personnelContext;
    const isActivePopup =
      activeCtx?.workId === ctx.workId &&
      (activeCtx.floorId || "") === (ctx.floorId || "");

    if (isActivePopup) {
      setEntryStatus(constructionEntry.status);
      if (constructionEntry.startDate && !entryStartDate) {
        setEntryStartDate(new Date(constructionEntry.startDate).toISOString().slice(0, 10));
      }
      if (constructionEntry.endDate) {
        setEntryEndDate(new Date(constructionEntry.endDate).toISOString().slice(0, 10));
      }
    }

    if (selectedType === "INCE_INSAAT") {
      setInceEntries((prev) => ({
        ...prev,
        [key]: {
          id: prev[key]?.id || constructionEntry.id || key,
          mediaCount: prev[key]?.mediaCount || 0,
          status: constructionEntry.status,
        },
      }));
    } else {
      setConstructionEntries((prev) => ({
        ...prev,
        [ctx.workId]: {
          id: constructionEntry.id || prev[ctx.workId]?.id || ctx.workId,
          mediaCount: prev[ctx.workId]?.mediaCount || 0,
          status: constructionEntry.status,
        },
      }));
    }
  };

  const openPersonnelPopup = async () => {
    const ctx = mediaPopup || personnelContext;
    if (!ctx || !selectedSite) return;
    setPersonnelPopupOpen(true);
    setPersonnelFormName("");
    setPersonnelFormCompany("");
    setPersonnelFormDuration("FULL_DAY");
    setPersonnelHistoryOpen(false);
    setPersonnelShowNameSugg(false);
    setPersonnelShowCompSugg(false);
    setPersonnelLoading(true);

    const entryKey = ctx.floorId ? `${ctx.workId}:${ctx.floorId}` : ctx.workId;
    const cType = selectedType || "KABA_INSAAT";
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock?.id;

    try {
      const p = new URLSearchParams({
        siteId: selectedSite.id,
        constructionType: cType,
        entryKey,
        date: todayStr(),
      });
      if (blockId) p.set("blockId", blockId);
      const res = await fetch(`/api/personnel?${p}`);
      if (res.ok) {
        const data = await res.json();
        setPersonnelRecords(data.entries || []);
      }
    } catch { /* ignore */ } finally {
      setPersonnelLoading(false);
    }

    try {
      const res = await fetch(`/api/personnel?siteId=${selectedSite.id}&recentNames=1`);
      if (res.ok) {
        const data = await res.json();
        setPersonnelNameSuggestions(data.nameSuggestions || []);
        setPersonnelCompanySuggestions(data.companySuggestions || []);
        setPersonnelPairSuggestions(data.suggestions || []);
      }
    } catch { /* ignore */ }
  };

  const openPersonnelPopupDirect = async (workId: string, workName: string, floorName: string, floorId?: string) => {
    if (!selectedSite) return;
    const ctx = { workId, workName, floorName, floorId };
    setPersonnelContext(ctx);
    setPersonnelPopupOpen(true);
    setPersonnelFormName("");
    setPersonnelFormCompany("");
    setPersonnelFormDuration("FULL_DAY");
    setPersonnelHistoryOpen(false);
    setPersonnelShowNameSugg(false);
    setPersonnelShowCompSugg(false);
    setPersonnelLoading(true);

    const entryKey = floorId ? `${workId}:${floorId}` : workId;
    const cType = selectedType || "KABA_INSAAT";
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock?.id;

    try {
      const p = new URLSearchParams({
        siteId: selectedSite.id,
        constructionType: cType,
        entryKey,
        date: todayStr(),
      });
      if (blockId) p.set("blockId", blockId);
      const res = await fetch(`/api/personnel?${p}`);
      if (res.ok) {
        const data = await res.json();
        setPersonnelRecords(data.entries || []);
      }
    } catch { /* ignore */ } finally {
      setPersonnelLoading(false);
    }

    try {
      const res = await fetch(`/api/personnel?siteId=${selectedSite.id}&recentNames=1`);
      if (res.ok) {
        const data = await res.json();
        setPersonnelNameSuggestions(data.nameSuggestions || []);
        setPersonnelCompanySuggestions(data.companySuggestions || []);
        setPersonnelPairSuggestions(data.suggestions || []);
      }
    } catch { /* ignore */ }
  };

  const selectPersonnelName = (name: string) => {
    setPersonnelFormName(name);
    setPersonnelShowNameSugg(false);
    const pair = personnelPairSuggestions.find((p) => p.name === name);
    if (pair && pair.company) {
      setPersonnelFormCompany(pair.company);
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

  const handleAddPersonnel = async () => {
    const ctx = mediaPopup || personnelContext;
    if (!personnelFormName.trim() || !ctx || !selectedSite) return;
    setPersonnelShowNameSugg(false);
    setPersonnelShowCompSugg(false);
    const entryKey = ctx.floorId ? `${ctx.workId}:${ctx.floorId}` : ctx.workId;
    const cType = selectedType || "KABA_INSAAT";
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock?.id;
    try {
      const res = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSite.id,
          blockId,
          constructionType: cType,
          workName: ctx.workName,
          floorName: ctx.floorName,
          entryKey,
          date: todayStr(),
          personnelName: personnelFormName.trim(),
          company: personnelFormCompany.trim() || null,
          workDuration: personnelFormDuration,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPersonnelRecords((prev) => [...prev, data.entry]);
        applyConstructionEntryProgress(ctx, data.constructionEntry);
        setPersonnelFormName("");
        setPersonnelFormCompany("");
        setPersonnelFormDuration("FULL_DAY");
        if (!personnelNameSuggestions.includes(personnelFormName.trim())) {
          setPersonnelNameSuggestions((prev) => [personnelFormName.trim(), ...prev]);
        }
      }
    } catch { /* ignore */ }
  };

  const closePersonnelPopup = async () => {
    setPersonnelPopupOpen(false);
    const ctx = mediaPopup || personnelContext;
    if (ctx && selectedSite) {
      const blockId = isPeyzaj ? selectedSite.id : selectedBlock?.id;
      try {
        const floorParam = ctx.floorId ? `&floorId=${ctx.floorId}` : "";
        const res = await fetch(`/api/construction/${ctx.workId}?blockId=${blockId}${floorParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.entry?.startDate) setEntryStartDate(data.entry.startDate.slice(0, 10));
          if (data.entry?.endDate) setEntryEndDate(data.entry.endDate.slice(0, 10));
          if (data.entry?.status) setEntryStatus(data.entry.status);
        }
      } catch { /* ignore */ }
    }
  };

  const handleDeletePersonnel = async (id: string) => {
    try {
      const res = await fetch(`/api/personnel/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPersonnelRecords((prev) => prev.filter((r) => r.id !== id));
      }
    } catch { /* ignore */ }
  };

  const openPersonnelHistory = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");
    setPersonnelHistoryDate(y);
    setPersonnelHistoryOpen(true);
    fetchPersonnelHistory(y);
  };

  const fetchPersonnelHistory = async (date: string) => {
    const ctx = mediaPopup || personnelContext;
    if (!ctx || !selectedSite) return;
    setPersonnelHistoryLoading(true);
    const entryKey = ctx.floorId ? `${ctx.workId}:${ctx.floorId}` : ctx.workId;
    const cType = selectedType || "KABA_INSAAT";
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock?.id;
    try {
      const p = new URLSearchParams({ siteId: selectedSite.id, constructionType: cType, entryKey, date });
      if (blockId) p.set("blockId", blockId);
      const res = await fetch(`/api/personnel?${p}`);
      if (res.ok) {
        const data = await res.json();
        setPersonnelHistoryRecords(data.entries || []);
      }
    } catch { /* ignore */ } finally {
      setPersonnelHistoryLoading(false);
    }
  };

  const changePersonnelHistoryDate = (delta: number) => {
    const d = new Date(personnelHistoryDate);
    d.setDate(d.getDate() + delta);
    const ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    setPersonnelHistoryDate(ds);
    fetchPersonnelHistory(ds);
  };

  // ── Teslimat submit ──
  const handleTeslimatSubmit = async () => {
    setTeslimatError("");
    if (!teslimatReceivedBy.trim() || !teslimatDate) {
      setTeslimatError("Teslim alan ve tarih zorunludur");
      return;
    }
    const validItems = teslimatItems.filter((i) => i.materialName.trim());
    if (validItems.length === 0) {
      setTeslimatError("En az bir malzeme kalemi ekleyin");
      return;
    }
    for (const item of validItems) {
      if (!item.unit || !item.quantity || Number(item.quantity) <= 0) {
        setTeslimatError("Tüm kalemlerde birim ve miktar gerekli");
        return;
      }
    }

    setTeslimatSubmitting(true);
    try {
      // valid item index → original index eşlemesi (medya yükleme için)
      const validIndexMap: number[] = [];
      teslimatItems.forEach((it, originalIdx) => {
        if (it.materialName.trim()) validIndexMap.push(originalIdx);
      });

      const res = await fetch("/api/teslimat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          irsaliyeNo: teslimatIrsaliyeNo.trim() || null,
          supplier: teslimatSupplier.trim() || null,
          siteId: teslimatSiteId || null,
          receivedBy: teslimatReceivedBy.trim(),
          date: teslimatDate,
          notes: teslimatNotes.trim() || null,
          items: validItems.map((i) => ({
            materialName: i.materialName.trim(),
            unit: i.unit,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice) || 0,
            taxRate: Number(i.taxRate) || 0,
          })),
        }),
      });
      if (res.ok) {
        // Sunucudan dönen kalemlere medya yükle (her validIdx için)
        const data = await res.json().catch(() => null);
        const createdItems = (data?.teslimat?.items || []) as { id: string }[];
        const uploads: Promise<unknown>[] = [];
        for (let vi = 0; vi < validIndexMap.length && vi < createdItems.length; vi++) {
          const originalIdx = validIndexMap[vi];
          const files = teslimatItemFiles[originalIdx] || [];
          if (files.length === 0) continue;
          const fd = new FormData();
          for (const f of files) fd.append("files", f);
          uploads.push(
            fetch(`/api/teslimat-items/${createdItems[vi].id}/media`, {
              method: "POST",
              body: fd,
            })
          );
        }
        if (uploads.length > 0) {
          await Promise.all(uploads).catch(() => {});
        }
        closeWizard();
      } else {
        const data = await res.json();
        setTeslimatError(data.error || "Hata oluştu");
      }
    } catch {
      setTeslimatError("Bağlantı hatası");
    } finally {
      setTeslimatSubmitting(false);
    }
  };

  // ── Teslimat kalemine fotoğraf/video ekleme ──
  const teslimatHandleItemFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (teslimatActiveItemIdx === null) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      setTeslimatActiveItemIdx(null);
      return;
    }
    const idx = teslimatActiveItemIdx;
    setTeslimatItemFiles((prev) => {
      const n = [...prev];
      while (n.length <= idx) n.push([]);
      n[idx] = [...(n[idx] || []), ...files];
      return n;
    });
    setTeslimatActiveItemIdx(null);
    if (e.target) e.target.value = "";
  };
  const teslimatTriggerCapture = (idx: number, type: "photo" | "video" | "gallery") => {
    setTeslimatActiveItemIdx(idx);
    setTimeout(() => {
      if (type === "photo") teslimatPhotoCaptureRef.current?.click();
      else if (type === "video") teslimatVideoCaptureRef.current?.click();
      else teslimatGalleryRef.current?.click();
    }, 0);
  };
  const teslimatRemoveItemFile = (itemIdx: number, fileIdx: number) => {
    setTeslimatItemFiles((prev) => {
      const n = [...prev];
      if (!n[itemIdx]) return n;
      n[itemIdx] = n[itemIdx].filter((_, i) => i !== fileIdx);
      return n;
    });
  };

  // ── Pending file state (for camera capture / video record) ──
  const [pendingFile, setPendingFile] = useState<Blob | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");

  // ── Camera functions ──
  const startCamera = useCallback(async (type: "photo" | "video") => {
    // Mobil/tablet cihazlarda doğrudan native kameraya yönlendir
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) {
      if (type === "photo") photoFallbackRef.current?.click();
      else videoFallbackRef.current?.click();
      return;
    }
    setCameraType(type);
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
      if (type === "photo") photoFallbackRef.current?.click();
      else videoFallbackRef.current?.click();
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

  const capturePhoto = useCallback(() => {
    if (!cameraVideoRef.current || !mediaPopup) return;
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
      setPendingFile(blob);
      setPendingFileName(`foto_${Date.now()}.jpg`);
    }, "image/jpeg", 0.9);
  }, [mediaPopup, closeCamera]);

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
      closeCamera();
      const ext = actualMime.includes("mp4") ? "mp4" : "webm";
      setPendingFile(blob);
      setPendingFileName(`video_${Date.now()}.${ext}`);
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

  const handlePendingUpload = async () => {
    if (!pendingFile || !mediaPopup) return;
    const file = new File([pendingFile], pendingFileName, { type: pendingFile.type });
    await handleMediaUpload(file, mediaTitle, mediaDesc);
    setPendingFile(null);
    setPendingFileName("");
    setMediaTitle("");
    setMediaDesc("");
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    if (files.length === 1) {
      // Single file: show pending form with title/desc like normal page
      setPendingFile(files[0]);
      setPendingFileName(files[0].name);
      setMediaTitle("");
      setMediaDesc("");
      return;
    }
    // Multiple files: upload all directly without title/desc
    setMediaUploading(true);
    for (const file of files) {
      await handleMediaUpload(file);
    }
    setMediaUploading(false);
  };

  // ── Custom work helpers ──
  const openCustomWorkModal = (type: string, floorId?: string, floorName?: string, isInce?: boolean) => {
    setCustomWorkName("");
    setCustomWorkDaireMode("ALL");
    setCustomWorkDaireIds([]);
    setCustomWorkModal({ type, floorId, floorName, isInce });
  };

  const submitCustomWork = async () => {
    if (!customWorkModal || !selectedSite) return;
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock?.id;
    if (!blockId) return;
    const name = customWorkName.trim();
    if (!name) return;
    setCustomWorkSaving(true);
    try {
      const body: any = { siteId: selectedSite.id, blockId, type: customWorkModal.type, name };
      if (customWorkModal.isInce) {
        body.daireIds = customWorkDaireMode === "ALL" ? "ALL" : customWorkDaireIds;
        if (customWorkDaireMode === "SELECT" && customWorkDaireIds.length === 0) {
          alert("En az bir daire seçin");
          setCustomWorkSaving(false);
          return;
        }
      } else {
        if (!customWorkModal.floorId) { setCustomWorkSaving(false); return; }
        body.floorId = customWorkModal.floorId;
      }
      const res = await fetch("/api/construction/custom-works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setCustomWorkModal(null);
        await fetchConstructionData(selectedSite.id, blockId, customWorkModal.type);
      } else {
        const e = await res.json().catch(() => ({}));
        alert("Eklenemedi: " + (e.error || res.status));
      }
    } catch {
      alert("Eklenemedi");
    } finally {
      setCustomWorkSaving(false);
    }
  };

  const deleteCustomNonInceWork = async (workId: string, type: string) => {
    if (!selectedSite) return;
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock?.id;
    if (!blockId) return;
    try {
      const r = await fetch(`/api/construction/custom-works?siteId=${selectedSite.id}&blockId=${blockId}&type=${type}&workId=${workId}`, { method: "DELETE" });
      if (r.ok) {
        await fetchConstructionData(selectedSite.id, blockId, type);
      } else {
        alert("Silinemedi");
      }
    } catch { alert("Silinemedi"); }
  };

  const deleteCustomInceWork = async (name: string) => {
    if (!selectedSite || !selectedBlock) return;
    try {
      const r = await fetch(`/api/construction/custom-works?siteId=${selectedSite.id}&blockId=${selectedBlock.id}&type=INCE_INSAAT&name=${encodeURIComponent(name)}&all=1`, { method: "DELETE" });
      if (r.ok) {
        await fetchConstructionData(selectedSite.id, selectedBlock.id, "INCE_INSAAT");
      } else {
        alert("Silinemedi");
      }
    } catch { alert("Silinemedi"); }
  };

  // Modern onay modali ile sarmalayan yardımcılar
  const askDeleteNonInce = (workId: string, workName: string, type: string) => {
    setConfirmDelete({
      title: "Özel İşi Sil",
      message: `"${workName}" silinecek. Bu işe ait tüm medyalar ve kayıtlar da silinecek. Onaylıyor musunuz?`,
      onConfirm: async () => {
        await deleteCustomNonInceWork(workId, type);
      },
    });
  };

  const askDeleteInce = (name: string) => {
    setConfirmDelete({
      title: "Özel İşi Sil",
      message: `"${name}" tüm dairelerden silinecek. Bu işe ait tüm medyalar ve kayıtlar da silinecek. Onaylıyor musunuz?`,
      onConfirm: async () => {
        await deleteCustomInceWork(name);
      },
    });
  };

  // ── Bulk select helpers (personel mode multi-select) ──
  const toggleBulkSelect = (item: { workId: string; workName: string; floorName: string; floorId?: string }) => {
    setBulkSelected((prev) => {
      const idx = prev.findIndex((x) => x.workId === item.workId && (x.floorId || "") === (item.floorId || ""));
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, item];
    });
  };
  const isBulkSelected = (workId: string, floorId?: string) =>
    bulkSelected.some((x) => x.workId === workId && (x.floorId || "") === (floorId || ""));

  const openBulkPersonnel = () => {
    if (bulkSelected.length === 0 || !selectedSite) return;
    setBulkPersonnelMode(true);
    setBulkAddedPersonnel([]);
    setMediaPopup(null);
    setPersonnelContext(null);
    setPersonnelRecords([]);
    setPersonnelPopupOpen(true);
    setPersonnelFormName("");
    setPersonnelFormCompany("");
    setPersonnelFormDuration("FULL_DAY");
    setPersonnelHistoryOpen(false);
    setPersonnelShowNameSugg(false);
    setPersonnelShowCompSugg(false);
    fetch(`/api/personnel?siteId=${selectedSite.id}&recentNames=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setPersonnelNameSuggestions(d.nameSuggestions || []);
          setPersonnelCompanySuggestions(d.companySuggestions || []);
          setPersonnelPairSuggestions(d.suggestions || []);
        }
      })
      .catch(() => {});
  };

  const handleAddBulkPersonnel = async () => {
    if (!personnelFormName.trim() || !selectedSite || bulkSelected.length === 0 || bulkSubmitting) return;
    setPersonnelShowNameSugg(false);
    setPersonnelShowCompSugg(false);
    const cType = selectedType || "KABA_INSAAT";
    const blockId = isPeyzaj ? selectedSite.id : selectedBlock?.id;
    const today = todayStr();
    const name = personnelFormName.trim();
    const company = personnelFormCompany.trim() || null;
    const duration = personnelFormDuration;
    setBulkSubmitting(true);
    for (const ctx of bulkSelected) {
      const entryKey = ctx.floorId ? `${ctx.workId}:${ctx.floorId}` : ctx.workId;
      try {
        const res = await fetch("/api/personnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: selectedSite.id,
            blockId,
            constructionType: cType,
            workName: ctx.workName,
            floorName: ctx.floorName,
            entryKey,
            date: today,
            personnelName: name,
            company,
            workDuration: duration,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyConstructionEntryProgress(ctx, data.constructionEntry);
        }
      } catch { /* ignore */ }
    }
    if (!personnelNameSuggestions.includes(name)) {
      setPersonnelNameSuggestions((prev) => [name, ...prev]);
    }
    if (company && !personnelCompanySuggestions.includes(company)) {
      setPersonnelCompanySuggestions((prev) => [company, ...prev]);
    }
    setBulkAddedPersonnel((prev) => [...prev, { name, company, duration }]);
    setPersonnelFormName("");
    setPersonnelFormCompany("");
    setPersonnelFormDuration("FULL_DAY");
    setBulkSubmitting(false);
  };

  const closePersonnelPopupAuto = () => {
    if (bulkPersonnelMode) {
      setPersonnelPopupOpen(false);
      setBulkPersonnelMode(false);
      setBulkSelected([]);
      setBulkAddedPersonnel([]);
    } else {
      closePersonnelPopup();
    }
  };

  // ── Cell click handler ──
  const handleCellClick = (workId: string, workName: string, floorName: string, floorId?: string) => {
    if (wizardMode === "personel") {
      // Multi-select toggle; user clicks 'Ekle' in header to open personnel popup
      toggleBulkSelect({ workId, workName, floorName, floorId });
    } else {
      // İş Ekle → open media popup
      openMediaPopup(workId, workName, floorName, floorId);
    }
  };

  // ── Wizard title ──
  const getWizardTitle = () => {
    if (wizardMode === "teslimat") return "Teslimat Ekle";
    if (wizardMode === "personel") return "Personel Ekle";
    return "Fotoğraf/Video Ekle";
  };

  const getBreadcrumb = () => {
    const parts: string[] = [];
    if (selectedSite) parts.push(selectedSite.name);
    if (selectedBlock) parts.push(selectedBlock.name);
    if (isPeyzaj) parts.push("Peyzaj");
    if (selectedType && selectedType !== "PEYZAJ") {
      const labels: Record<string, string> = { KABA_INSAAT: "Kaba İnşaat", INCE_INSAAT: "İnce İnşaat", BINA_GENEL: "Bina Genel", RUHSAT_ISKAN: "Belgeler" };
      parts.push(labels[selectedType] || selectedType);
    }
    return parts.join(" › ");
  };

  // ── RENDER ──
  if (loadingSites || dailyCheckLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
      </div>
    );
  }

  const dailyContinueDisabled = dailySubmitting || (!dailyOffsite && !dailyLeave && dailySelectedSiteIds.length === 0);

  if (showDailyWelcome) {
    return (
      <div className="min-h-[calc(100vh-9rem)] flex items-center justify-center py-4">
        <div className="w-full max-w-5xl bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-[#1a1a2e] text-white px-5 sm:px-8 py-7">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
              <div>
                <p className="text-sm uppercase tracking-wide text-white/60 font-semibold">Günaydın</p>
                <h1 className="text-3xl sm:text-4xl font-bold mt-2">
                  {userFirstName} {userLastName}
                </h1>
              </div>
              <button
                onClick={handleSwitchUser}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
              >
                <LogOut size={17} />
                Kullanıcı Değiştir
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Bugün nerede çalışacaksınız?</h2>
              <p className="text-sm text-gray-500 mt-1">Bir veya birden fazla şantiye seçebilirsiniz.</p>
            </div>

            {assignedSites.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-xl py-10 px-5 text-center text-gray-500">
                <Building2 className="mx-auto mb-3 text-gray-300" size={44} />
                Size atanmış aktif şantiye bulunmuyor.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {assignedSites.map((site) => {
                  const selected = dailySelectedSiteIds.includes(site.id);
                  return (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => toggleDailySite(site.id)}
                      disabled={dailyOffsite || dailyLeave}
                      aria-pressed={selected}
                      className={`relative min-h-28 rounded-xl border-2 px-5 py-4 text-left transition-all ${
                        selected
                          ? "border-[#c0392b] bg-red-50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-[#1e3a5f] hover:shadow-sm"
                      } ${dailyOffsite || dailyLeave ? "opacity-45 cursor-not-allowed hover:border-gray-200 hover:shadow-none" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-lg p-2 ${selected ? "bg-[#c0392b] text-white" : "bg-gray-100 text-gray-500"}`}>
                          <Building2 size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 break-words">{site.name}</p>
                          <p className="text-xs text-gray-400 mt-1">{site.status === "ACTIVE" ? "Aktif" : site.status}</p>
                        </div>
                      </div>
                      {selected && (
                        <span className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#c0392b] text-white">
                          <Check size={16} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={toggleDailyOffsite}
              aria-pressed={dailyOffsite}
              className={`w-full rounded-xl border-2 px-5 py-4 text-left transition-all ${
                dailyOffsite
                  ? "border-amber-500 bg-amber-50 text-amber-900 shadow-sm"
                  : "border-gray-200 bg-white text-gray-800 hover:border-amber-400 hover:bg-amber-50"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`rounded-lg p-2 ${dailyOffsite ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    <Flag size={20} />
                  </div>
                  <div>
                    <p className="font-bold">Şantiye Harici Çalışma</p>
                    <p className="text-sm opacity-70 mt-0.5">Bugün şantiye dışında görev alacağım.</p>
                  </div>
                </div>
                {dailyOffsite && (
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                    <Check size={16} />
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={toggleDailyLeave}
              aria-pressed={dailyLeave}
              className={`w-full rounded-xl border-2 px-5 py-4 text-left transition-all ${
                dailyLeave
                  ? "border-sky-500 bg-sky-50 text-sky-900 shadow-sm"
                  : "border-gray-200 bg-white text-gray-800 hover:border-sky-400 hover:bg-sky-50"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`rounded-lg p-2 ${dailyLeave ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    <CalendarOff size={20} />
                  </div>
                  <div>
                    <p className="font-bold">İzinli</p>
                    <p className="text-sm opacity-70 mt-0.5">Bugün şantiyede veya görevde çalışmayacağım.</p>
                  </div>
                </div>
                {dailyLeave && (
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white">
                    <Check size={16} />
                  </span>
                )}
              </div>
            </button>

            {dailyError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {dailyError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-gray-100 pt-5">
              <p className="text-sm text-gray-500">
                {dailyLeave
                  ? "İzinli seçildi."
                  : dailyOffsite
                  ? "Şantiye harici çalışma seçildi."
                  : dailySelectedSiteIds.length > 0
                    ? `${dailySelectedSiteIds.length} şantiye seçildi.`
                    : "Devam etmek için seçim yapın."}
              </p>
              <button
                type="button"
                onClick={handleDailyContinue}
                disabled={dailyContinueDisabled}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c0392b] px-6 py-3 text-white font-semibold hover:bg-[#922b21] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {dailySubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                Devam Et
              </button>
            </div>
          </div>
        </div>

        {offsiteNoteOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={() => !dailySubmitting && setOffsiteNoteOpen(false)}
          >
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between bg-amber-50 border-b border-amber-100 px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Şantiye Harici Çalışma Notu</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Bugünkü çalışma konumunuzu veya görevinizi yazın.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOffsiteNoteOpen(false)}
                  disabled={dailySubmitting}
                  className="rounded-lg p-2 text-gray-500 hover:bg-white disabled:opacity-50"
                  aria-label="Kapat"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <textarea
                  value={offsiteNote}
                  onChange={(e) => {
                    setOffsiteNote(e.target.value);
                    setDailyError("");
                  }}
                  autoFocus
                  rows={5}
                  maxLength={1000}
                  placeholder="Örn: Merkez ofiste toplantı, malzeme tedariki, belediye görüşmesi..."
                  className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
                {dailyError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {dailyError}
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOffsiteNoteOpen(false)}
                    disabled={dailySubmitting}
                    className="rounded-lg bg-gray-100 px-5 py-2.5 font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={() => submitDailyCheckin(offsiteNote)}
                    disabled={dailySubmitting || !offsiteNote.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c0392b] px-5 py-2.5 font-semibold text-white hover:bg-[#922b21] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {dailySubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    Kaydet ve Devam Et
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sm:space-y-8 flex flex-col h-full sm:h-auto sm:block p-3 sm:p-0">
      {/* 8 Aksiyon Kartı — telefonda dikeyde banner ile alt menü arasını doldurur */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-2.5 sm:gap-6 auto-rows-fr flex-1 min-h-0">
        {/* Personel Ekle */}
        <button
          onClick={() => openWizard("personel")}
          className="pressable pressable-dark bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-[#1e3a5f] hover:shadow-lg transition-all p-3 sm:p-8 flex flex-col items-center justify-center gap-2 sm:gap-4 group"
        >
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-blue-50 group-hover:bg-[#1e3a5f] rounded-2xl flex items-center justify-center transition-colors">
            <HardHat className="w-6 h-6 sm:w-10 sm:h-10 text-[#1e3a5f] group-hover:text-white transition-colors" />
          </div>
          <span className="text-[13px] sm:text-lg font-bold text-gray-800 text-center leading-tight group-hover:text-[#1e3a5f]">Personel Ekle</span>
          <span className="hidden sm:block text-sm text-gray-400 text-center">Şantiyeye personel kaydı girin</span>
        </button>

        {/* İş Ekle */}
        <button
          onClick={() => openWizard("is")}
          className="pressable pressable-dark bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-[#c0392b] hover:shadow-lg transition-all p-3 sm:p-8 flex flex-col items-center justify-center gap-2 sm:gap-4 group"
        >
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-red-50 group-hover:bg-[#c0392b] rounded-2xl flex items-center justify-center transition-colors">
            <Camera className="w-6 h-6 sm:w-10 sm:h-10 text-[#c0392b] group-hover:text-white transition-colors" />
          </div>
          <span className="text-[13px] sm:text-lg font-bold text-gray-800 text-center leading-tight group-hover:text-[#c0392b]">Fotoğraf/Video Ekle</span>
          <span className="hidden sm:block text-sm text-gray-400 text-center">Fotoğraf ve medya yükleyin</span>
        </button>

        {/* Teslimat Ekle */}
        <button
          onClick={() => openWizard("teslimat")}
          className="pressable pressable-dark bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-green-600 hover:shadow-lg transition-all p-3 sm:p-8 flex flex-col items-center justify-center gap-2 sm:gap-4 group"
        >
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-green-50 group-hover:bg-green-600 rounded-2xl flex items-center justify-center transition-colors">
            <Truck className="w-6 h-6 sm:w-10 sm:h-10 text-green-600 group-hover:text-white transition-colors" />
          </div>
          <span className="text-[13px] sm:text-lg font-bold text-gray-800 text-center leading-tight group-hover:text-green-600">Teslimat Ekle</span>
          <span className="hidden sm:block text-sm text-gray-400 text-center">Malzeme teslimatı kaydedin</span>
        </button>

        {/* Depo Kontrol */}
        <button
          onClick={openDepo}
          className="pressable pressable-dark bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-orange-600 hover:shadow-lg transition-all p-3 sm:p-8 flex flex-col items-center justify-center gap-2 sm:gap-4 group"
        >
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-orange-50 group-hover:bg-orange-600 rounded-2xl flex items-center justify-center transition-colors">
            <Warehouse className="w-6 h-6 sm:w-10 sm:h-10 text-orange-600 group-hover:text-white transition-colors" />
          </div>
          <span className="text-[13px] sm:text-lg font-bold text-gray-800 text-center leading-tight group-hover:text-orange-600">Depo Kontrol</span>
          <span className="hidden sm:block text-sm text-gray-400 text-center">Depo stoklarını yönetin</span>
        </button>

        {/* Arıza Takip */}
        <button
          onClick={() => {
            setAriszaModalMode("menu");
            setAriszaOpen(true);
          }}
          className="pressable pressable-dark bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-amber-500 hover:shadow-lg transition-all p-3 sm:p-8 flex flex-col items-center justify-center gap-2 sm:gap-4 group"
        >
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-amber-50 group-hover:bg-amber-500 rounded-2xl flex items-center justify-center transition-colors">
            <AlertTriangle className="w-6 h-6 sm:w-10 sm:h-10 text-amber-500 group-hover:text-white transition-colors" />
          </div>
          <span className="text-[13px] sm:text-lg font-bold text-gray-800 text-center leading-tight group-hover:text-amber-600">Arıza Takip</span>
          <span className="hidden sm:block text-sm text-gray-400 text-center">Açık ve çözülen arızaları yönetin</span>
        </button>

        {/* Şantiye İlerleme Kontrol */}
        <Link
          href="/dashboard/sites?observe=1"
          className="pressable pressable-dark bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-purple-600 hover:shadow-lg transition-all p-3 sm:p-8 flex flex-col items-center justify-center gap-2 sm:gap-4 group text-center"
        >
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-purple-50 group-hover:bg-purple-600 rounded-2xl flex items-center justify-center transition-colors">
            <ClipboardList className="w-6 h-6 sm:w-10 sm:h-10 text-purple-600 group-hover:text-white transition-colors" />
          </div>
          <span className="text-[13px] sm:text-lg font-bold text-gray-800 text-center leading-tight group-hover:text-purple-600">Şantiye İlerleme Kontrol</span>
          <span className="hidden sm:block text-sm text-gray-400 text-center">Şantiye tablolarını gözlemleyin</span>
        </Link>

        {/* Şantiye Arıza */}
        <button
          onClick={() => {
            setSantiyeAriszaSiteId("");
            setSantiyeAriszaMode("siteSelect");
            setSantiyeAriszaOpen(true);
          }}
          className="pressable pressable-dark bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-rose-600 hover:shadow-lg transition-all p-3 sm:p-8 flex flex-col items-center justify-center gap-2 sm:gap-4 group text-center"
        >
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-rose-50 group-hover:bg-rose-600 rounded-2xl flex items-center justify-center transition-colors">
            <AlertTriangle className="w-6 h-6 sm:w-10 sm:h-10 text-rose-600 group-hover:text-white transition-colors" />
          </div>
          <span className="text-[13px] sm:text-lg font-bold text-gray-800 text-center leading-tight group-hover:text-rose-600">Şantiye Arıza</span>
          <span className="hidden sm:block text-sm text-gray-400 text-center">Şantiyeye özel arıza kayıtları</span>
        </button>

        {/* Not Defteri */}
        <Link
          href="/dashboard/not-defteri"
          className="pressable pressable-dark bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-cyan-600 hover:shadow-lg transition-all p-3 sm:p-8 flex flex-col items-center justify-center gap-2 sm:gap-4 group text-center"
        >
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-cyan-50 group-hover:bg-cyan-600 rounded-2xl flex items-center justify-center transition-colors">
            <BookOpen className="w-6 h-6 sm:w-10 sm:h-10 text-cyan-600 group-hover:text-white transition-colors" />
          </div>
          <span className="text-[13px] sm:text-lg font-bold text-gray-800 text-center leading-tight group-hover:text-cyan-600">Not Defteri</span>
          <span className="hidden sm:block text-sm text-gray-400 text-center">Kişisel notlarınızı tutun</span>
        </Link>
      </div>

      {/* ─── WIZARD POPUP ─── */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
          <div className="bg-white flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0 modal-safe-top">
              <div className="flex items-center gap-3">
                {wizardStep > 1 && wizardMode !== "teslimat" && (
                  <button onClick={() => {
                    if (wizardStep === 4 && selectedType === "INCE_INSAAT" && (selectedInceDaire || selectedInceWork)) {
                      setSelectedInceDaire(null);
                      setSelectedInceWork(null);
                      setInceViewMode("is");
                      return;
                    }
                    if (wizardStep === 4 && isPeyzaj) { setIsPeyzaj(false); setSelectedType(""); setWizardStep(2); return; }
                    setWizardStep(wizardStep - 1);
                  }} className="p-1 hover:bg-white/20 rounded">
                    <ArrowLeft size={20} />
                  </button>
                )}
                <div>
                  <h2 className="font-bold text-lg">{getWizardTitle()}</h2>
                  {getBreadcrumb() && <p className="text-xs opacity-75">{getBreadcrumb()}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {wizardMode === "personel" && bulkSelected.length > 0 && (
                  <button
                    onClick={openBulkPersonnel}
                    className="px-4 py-1.5 bg-white text-[#1e3a5f] rounded-lg font-bold text-sm hover:bg-gray-100 active:scale-95 transition-all flex items-center gap-1.5 shadow"
                  >
                    <Plus size={16} /> Ekle ({bulkSelected.length})
                  </button>
                )}
                <button onClick={closeWizard} className="p-1.5 hover:bg-white/20 rounded">
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* ── TESLIMAT FORMU ── */}
              {wizardMode === "teslimat" && (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">İrsaliye No <span className="text-gray-400 font-normal">(opsiyonel)</span></label>
                      <input type="text" value={teslimatIrsaliyeNo} onChange={(e) => setTeslimatIrsaliyeNo(e.target.value)} placeholder="opsiyonel"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tedarikçi</label>
                      <input type="text" list="sc-teslimat-supplier-list" value={teslimatSupplier} onChange={(e) => setTeslimatSupplier(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                      <datalist id="sc-teslimat-supplier-list">
                        {teslimatSupplierSuggestions.map((s) => (<option key={s} value={s} />))}
                      </datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Şantiye</label>
                      <select value={teslimatSiteId} onChange={(e) => setTeslimatSiteId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]">
                        <option value="">Seçiniz</option>
                        {assignedSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tarih *</label>
                      <input type="date" value={teslimatDate} onChange={(e) => setTeslimatDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teslim Alan *</label>
                    <input type="text" value={teslimatReceivedBy} onChange={(e) => setTeslimatReceivedBy(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f] bg-gray-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Not</label>
                    <textarea value={teslimatNotes} onChange={(e) => setTeslimatNotes(e.target.value)} rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                  </div>

                  {/* Malzeme kalemleri */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-gray-700">Malzeme Kalemleri</label>
                      <button onClick={() => {
                          const newIdx = teslimatItems.length;
                          setTeslimatItems((prev) => [...prev, { materialName: "", unit: "adet", quantity: "", unitPrice: "", taxRate: 0 }]);
                          setTeslimatItemFiles((prev) => [...prev, []]);
                          setJustAddedTeslimatIdx(newIdx);
                          // Yeni kalem alta eklenince kullanıcı görsün: ona kaydır + kısa vurgu animasyonu
                          setTimeout(() => { teslimatItemRefs.current[newIdx]?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
                          setTimeout(() => setJustAddedTeslimatIdx((cur) => (cur === newIdx ? null : cur)), 1100);
                        }}
                        className="flex items-center gap-1 text-sm text-[#1e3a5f] hover:bg-[#1e3a5f]/5 font-medium border border-dashed border-[#1e3a5f]/40 rounded-full px-4 py-1.5">
                        <Plus size={14} /> Kalem Ekle
                      </button>
                    </div>
                    {/* Hidden file inputs (paylaşılır, aktif kalem indeksi state'te tutulur) */}
                    <input ref={teslimatGalleryRef} type="file" multiple accept="image/*,video/*"
                      onChange={teslimatHandleItemFiles} className="hidden" />
                    <input ref={teslimatPhotoCaptureRef} type="file" accept="image/*" capture="environment"
                      onChange={teslimatHandleItemFiles} className="hidden" />
                    <input ref={teslimatVideoCaptureRef} type="file" accept="video/*" capture="environment"
                      onChange={teslimatHandleItemFiles} className="hidden" />
                    <div className="space-y-3">
                      {teslimatItems.map((item, idx) => (
                        <div key={idx}
                          ref={(el) => { teslimatItemRefs.current[idx] = el; }}
                          className={`border-2 border-[#1e3a5f] rounded-lg p-3 bg-white ${justAddedTeslimatIdx === idx ? "teslimat-item-new" : ""}`}>
                          {/* Row 1: full width material name */}
                          <div className="flex items-center gap-2 mb-2">
                            <input type="text" placeholder="Malzeme adı" list="sc-teslimat-material-list" value={item.materialName}
                              onChange={(e) => { const n = [...teslimatItems]; n[idx].materialName = e.target.value; setTeslimatItems(n); }}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm outline-none bg-white" />
                            {teslimatItems.length > 1 && (
                              <button onClick={() => {
                                  setTeslimatItems((prev) => prev.filter((_, i) => i !== idx));
                                  setTeslimatItemFiles((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0" title="Kalemi sil">
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                          {/* Row 2: unit / qty / price / kdv */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                            <div className="flex flex-col">
                              <label className="block text-[11px] text-gray-500 mb-0.5 min-h-[2.4em] leading-tight">Birim</label>
                              <select value={item.unit}
                                onChange={(e) => { const n = [...teslimatItems]; n[idx].unit = e.target.value; setTeslimatItems(n); }}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none bg-white">
                                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                            <div className="flex flex-col">
                              <label className="block text-[11px] text-gray-500 mb-0.5 min-h-[2.4em] leading-tight">Miktar</label>
                              <input type="number" placeholder="0" value={item.quantity}
                                onChange={(e) => { const n = [...teslimatItems]; n[idx].quantity = e.target.value; setTeslimatItems(n); }}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none text-right bg-white" />
                            </div>
                            <div className="flex flex-col">
                              <label className="block text-[11px] text-gray-500 mb-0.5 min-h-[2.4em] leading-tight">Birim Fiyat (KDV Dahil ₺)</label>
                              <input type="number" placeholder="0" value={item.unitPrice}
                                onChange={(e) => { const n = [...teslimatItems]; n[idx].unitPrice = e.target.value; setTeslimatItems(n); }}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none text-right bg-white" />
                            </div>
                            <div className="flex flex-col">
                              <label className="block text-[11px] text-gray-500 mb-0.5 min-h-[2.4em] leading-tight">KDV (%)</label>
                              <select value={item.taxRate ?? 0}
                                onChange={(e) => { const n = [...teslimatItems]; n[idx].taxRate = parseFloat(e.target.value) || 0; setTeslimatItems(n); }}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none bg-white">
                                <option value={0}>%0</option>
                                <option value={1}>%1</option>
                                <option value={10}>%10</option>
                                <option value={20}>%20</option>
                              </select>
                            </div>
                          </div>
                          {(parseFloat(item.quantity) > 0 && parseFloat(item.unitPrice) > 0) && (() => {
                            const lineGross = parseFloat(item.quantity) * parseFloat(item.unitPrice);
                            const lineNet = lineGross / (1 + ((item.taxRate ?? 0) / 100));
                            const lineKdv = lineGross - lineNet;
                            const fmt = (v: number) => "₺" + v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            return (
                              <div className="mt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-gray-600">
                                <span>KDV-siz: <strong className="text-gray-800">{fmt(lineNet)}</strong></span>
                                <span>KDV: <strong className="text-gray-800">{fmt(lineKdv)}</strong></span>
                                <span>Toplam: <strong className="text-[#1e3a5f]">{fmt(lineGross)}</strong></span>
                              </div>
                            );
                          })()}

                          {/* Fotoğraf / Video / Galeri butonları (kalem bazında) */}
                          <div className="mt-3 pt-3 border-t border-[#1e3a5f]/20">
                            {isMobile ? (
                              /* MOBİL: medya pop-up ile aynı modern butonlar (flex, tek satır) */
                              <div className="flex gap-2">
                                <button type="button" onClick={() => teslimatTriggerCapture(idx, "photo")}
                                  className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                                  <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Camera size={18} /></span>
                                  <span className="text-xs">Fotoğraf</span>
                                </button>
                                <button type="button" onClick={() => teslimatTriggerCapture(idx, "video")}
                                  className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                                  <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Video size={18} /></span>
                                  <span className="text-xs">Video</span>
                                </button>
                                <button type="button" onClick={() => teslimatTriggerCapture(idx, "gallery")}
                                  className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-[#c0392b] text-white font-semibold shadow-md active:scale-95 transition-all">
                                  <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><FolderOpen size={18} /></span>
                                  <span className="text-xs">Galeri</span>
                                </button>
                              </div>
                            ) : (
                              <div className="grid grid-cols-3 gap-2">
                                <button type="button" onClick={() => teslimatTriggerCapture(idx, "photo")}
                                  className="flex items-center justify-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-2 text-sm shadow-sm">
                                  <Camera size={16} />
                                  <span className="hidden sm:inline">Fotoğraf Çek</span>
                                  <span className="sm:hidden">Fotoğraf</span>
                                </button>
                                <button type="button" onClick={() => teslimatTriggerCapture(idx, "video")}
                                  className="flex items-center justify-center gap-1.5 rounded-full bg-purple-600 hover:bg-purple-700 text-white font-medium px-3 py-2 text-sm shadow-sm">
                                  <Video size={16} />
                                  <span className="hidden sm:inline">Video Çek</span>
                                  <span className="sm:hidden">Video</span>
                                </button>
                                <button type="button" onClick={() => teslimatTriggerCapture(idx, "gallery")}
                                  className="flex items-center justify-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-medium px-3 py-2 text-sm shadow-sm">
                                  <FolderOpen size={16} />
                                  <span className="hidden sm:inline">Galeriden Seç</span>
                                  <span className="sm:hidden">Galeri</span>
                                </button>
                              </div>
                            )}
                            {(teslimatItemFiles[idx] || []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(teslimatItemFiles[idx] || []).map((f, fi) => (
                                  <div key={fi} className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs">
                                    {f.type.startsWith("video/") ? <Video size={12} className="text-purple-600" /> : <ImageIcon size={12} className="text-blue-600" />}
                                    <span className="max-w-[140px] truncate">{f.name}</span>
                                    <button type="button" onClick={() => teslimatRemoveItemFile(idx, fi)}
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
                      <datalist id="sc-teslimat-material-list">
                        {teslimatMaterialSuggestions.map((m) => (<option key={m} value={m} />))}
                      </datalist>
                    </div>
                    {(() => {
                      const grossSum = teslimatItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0)), 0);
                      const netSum = teslimatItems.reduce((s, it) => s + (((parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0)) / (1 + ((it.taxRate ?? 0) / 100))), 0);
                      const kdvSum = grossSum - netSum;
                      const fmt = (v: number) => "₺" + v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      return (
                        <div className="mt-3 px-3 py-3 bg-gray-100 rounded-lg space-y-1">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">KDV-siz Toplam:</span>
                            <span className="font-semibold text-gray-800">{fmt(netSum)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Toplam KDV:</span>
                            <span className="font-semibold text-gray-800">{fmt(kdvSum)}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-gray-300">
                            <span className="text-sm font-bold text-gray-700">Toplam Tutar (KDV Dahil):</span>
                            <span className="text-base font-bold text-[#1e3a5f]">{fmt(grossSum)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {teslimatError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{teslimatError}</div>
                  )}

                  <div className="flex justify-end gap-3 pt-4">
                    <button onClick={closeWizard} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
                    <button onClick={handleTeslimatSubmit} disabled={teslimatSubmitting}
                      className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                      {teslimatSubmitting ? "Kaydediliyor..." : "Kaydet"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 1: Site Selection ── */}
              {wizardMode !== "teslimat" && wizardStep === 1 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">Şantiye Seçin</h3>
                  {assignedSites.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <Building2 className="mx-auto mb-3 text-gray-300" size={48} />
                      <p>Henüz size atanmış şantiye yok</p>
                      <p className="text-sm mt-1">Yöneticinizden şantiye ataması isteyin</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:gap-5 max-w-2xl mx-auto">
                      {assignedSites.map((site) => (
                        <button key={site.id} onClick={() => selectSite(site)}
                          className="bg-white border-2 sm:border-3 border-gray-200 hover:border-[#1e3a5f] rounded-2xl p-3 sm:p-10 text-center transition-all hover:shadow-lg aspect-square overflow-hidden flex flex-col items-center justify-center">
                          <Building2 className="w-9 h-9 sm:w-14 sm:h-14 text-[#1e3a5f] mb-2 sm:mb-4 shrink-0" />
                          <p className="font-bold text-sm sm:text-xl text-gray-800 leading-tight line-clamp-2 break-words w-full">{site.name}</p>
                          <p className="text-xs sm:text-sm text-gray-400 mt-1 sm:mt-2 shrink-0">{site.blocks.length} blok</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Bugün eklenen personel — sadece personel modunda, kartların altında */}
                  {wizardMode === "personel" && assignedSites.length > 0 && (() => {
                    const allEntries = assignedSites.flatMap((s) => dayPersonnel[s.id] || []);
                    return (
                      <div className="mt-8 max-w-2xl mx-auto">
                        <div className="flex items-center gap-2 mb-3">
                          <ClipboardList size={18} className="text-[#1e3a5f]" />
                          <h4 className="text-base font-semibold text-gray-700">Bugün Eklenen Personel</h4>
                          {dayPersonnelLoading && <Loader2 size={15} className="animate-spin text-gray-400" />}
                        </div>
                        {allEntries.length === 0 ? (
                          <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-sm">
                            {dayPersonnelLoading ? "Yükleniyor..." : "Bugün henüz personel eklenmemiş."}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {assignedSites.map((site) => {
                              const entries = dayPersonnel[site.id] || [];
                              if (entries.length === 0) return null;
                              const uniqueCount = new Set(
                                entries.map((e) => e.personnelName.trim().toLocaleLowerCase("tr-TR"))
                              ).size;
                              return (
                                <div key={site.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                                  <div className="flex items-center justify-between gap-2 mb-2 px-1">
                                    <span className="font-bold text-gray-800">{site.name}</span>
                                    <span className="text-xs font-semibold text-[#1e3a5f] bg-[#1e3a5f]/10 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                      {uniqueCount} kişi · {entries.length} kayıt
                                    </span>
                                  </div>
                                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                                    {groupSitePersonnel(entries).map((g, gi) => {
                                      const half = g.workDuration === "HALF_DAY";
                                      const sub = [g.company, g.workName].filter(Boolean).join(" · ");
                                      return (
                                        <div key={gi} className="flex items-start justify-between gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                          <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-gray-900 text-sm leading-snug">{g.personnelName}</div>
                                            {sub && <div className="text-xs text-gray-600 mt-0.5 leading-snug">{sub}</div>}
                                            {g.floors.length > 0 && (
                                              <div className="text-xs text-gray-500 mt-0.5 leading-snug">{g.floors.join(", ")}</div>
                                            )}
                                          </div>
                                          <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-md ${half ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                            {half ? "Yarım Gün" : "Tam Gün"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── STEP 2: Block Selection ── */}
              {wizardMode !== "teslimat" && wizardStep === 2 && selectedSite && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">Blok Seçin</h3>
                  <div className="grid grid-cols-2 gap-5 max-w-2xl mx-auto">
                    {selectedSite.blocks.map((block) => (
                      <button key={block.id} onClick={() => selectBlock(block, false)}
                        className="tap mob-fade-up bg-white border-3 border-gray-200 hover:border-[#1e3a5f] rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center">
                        <Layers size={52} className="text-[#1e3a5f] mb-4" />
                        <p className="font-bold text-xl text-gray-800">{block.name}</p>
                      </button>
                    ))}
                    {/* Peyzaj card */}
                    <button onClick={() => selectBlock(null, true)}
                      className="tap mob-fade-up bg-white border-3 border-gray-200 hover:border-green-600 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center">
                      <Trees size={56} className="text-green-600 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Peyzaj</p>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Type Selection ── */}
              {wizardMode !== "teslimat" && wizardStep === 3 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">İnşaat Türü Seçin</h3>
                  <div className="grid grid-cols-2 gap-5 max-w-2xl mx-auto">
                    <button onClick={() => selectType("KABA_INSAAT")}
                      className="tap bg-white border-3 border-gray-200 hover:border-amber-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center">
                      <Hammer size={56} className="text-amber-600 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Kaba İnşaat</p>
                    </button>
                    <button onClick={() => selectType("INCE_INSAAT")}
                      className="bg-white border-3 border-gray-200 hover:border-blue-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center">
                      <Paintbrush size={56} className="text-blue-600 mb-4" />
                      <p className="font-bold text-xl text-gray-800">İnce İnşaat</p>
                    </button>
                    <button onClick={() => selectType("BINA_GENEL")}
                      className="bg-white border-3 border-gray-200 hover:border-purple-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center">
                      <Building2 size={56} className="text-purple-600 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Bina Genel</p>
                    </button>
                    <button onClick={() => selectType("RUHSAT_ISKAN")}
                      className="bg-white border-3 border-gray-200 hover:border-emerald-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center">
                      <FileText size={56} className="text-emerald-600 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Belgeler</p>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 4: Construction Table ── */}
              {wizardMode !== "teslimat" && wizardStep === 4 && (
                <div>
                  {constructionLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
                    </div>
                  ) : selectedType === "INCE_INSAAT" ? (
                    /* İnce İnşaat */
                    <div>
                      {inceViewMode === "select" ? (
                        <div className="grid grid-cols-2 gap-5 max-w-2xl mx-auto">
                          <button onClick={() => setInceViewMode("daire")}
                            className="bg-white border-3 border-gray-200 hover:border-blue-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center">
                            <Layers size={56} className="text-blue-500 mb-4" />
                            <p className="font-bold text-xl text-gray-800">Daire Bazında</p>
                            <p className="text-sm text-gray-400 mt-2">Bir daire seçip tüm işleri görün</p>
                          </button>
                          <button onClick={() => setInceViewMode("is")}
                            className="bg-white border-3 border-gray-200 hover:border-blue-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center">
                            <Hammer size={56} className="text-blue-500 mb-4" />
                            <p className="font-bold text-xl text-gray-800">İş Bazında</p>
                            <p className="text-sm text-gray-400 mt-2">Bir iş seçip tüm daireleri görün</p>
                          </button>
                        </div>
                      ) : inceViewMode === "daire" && !selectedInceDaire ? (
                        <div>
                          <h4 className="text-md font-medium text-gray-600 mb-3">Daire Seçin</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {inceDaires.map((daire) => {
                              const allWorks = constructionFloors.flatMap((f: any) => f.works || []);
                              const perDaireNames = new Set<string>();
                              for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
                              const baseWorks = allWorks.filter((w: any) => !perDaireNames.has(w.name));
                              const ov = inceUnitOverrides[daire.id] || { added: [], removed: [] };
                              const filtered = baseWorks.filter((w: any) => !(ov.removed || []).includes(w.name));
                              const added = allWorks.filter((w: any) => (ov.added || []).includes(w.name));
                              const daireWorks = [...filtered, ...added];
                              const total = daireWorks.length;
                              const done = daireWorks.filter((w: any) => {
                                const key = `${w.id}:${daire.id}`;
                                return inceEntries[key]?.status === "COMPLETED";
                              }).length;
                              return (
                                <button key={daire.id} onClick={() => setSelectedInceDaire(daire)}
                                  className="bg-white border-2 border-gray-200 hover:border-blue-500 rounded-xl p-5 text-center transition-all hover:shadow-md">
                                  <p className="font-semibold text-base text-gray-800">{daire.name}</p>
                                  <p className="text-sm text-gray-400 mt-1">{done}/{total}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : inceViewMode === "daire" && selectedInceDaire ? (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <button onClick={() => setSelectedInceDaire(null)} className="p-1 hover:bg-gray-100 rounded">
                              <ArrowLeft size={18} />
                            </button>
                            <h4 className="text-md font-medium text-gray-600">{selectedInceDaire.name} - İşler</h4>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {(() => {
                              const allWorks = constructionFloors.flatMap((f: any) => f.works || []);
                              const perDaireNames = new Set<string>();
                              for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
                              const baseWorks = allWorks.filter((w: any) => !perDaireNames.has(w.name));
                              const ov = inceUnitOverrides[selectedInceDaire.id] || { added: [], removed: [] };
                              const filtered = baseWorks.filter((w: any) => !(ov.removed || []).includes(w.name));
                              const added = allWorks.filter((w: any) => (ov.added || []).includes(w.name));
                              const daireWorks = [...filtered, ...added];
                              return daireWorks.map((work: any) => {
                                const key = `${work.id}:${selectedInceDaire.id}`;
                                const entry = inceEntries[key];
                                const st = entry?.status || "NOT_STARTED";
                                const mc = entry?.mediaCount || 0;
                                const hasStarted = st !== "NOT_STARTED" || mc > 0;
                                const color = st === "COMPLETED" ? "bg-green-500 text-white" : hasStarted ? "bg-yellow-500 text-white" : "bg-gray-100 text-gray-700 border border-gray-200";
                                const selected = wizardMode === "personel" && isBulkSelected(work.id, selectedInceDaire.id);
                                const finalColor = selected ? "bg-yellow-300 text-gray-900 ring-4 ring-yellow-500" : color;
                                return (
                                  <button key={work.id} onClick={() => handleCellClick(work.id, work.name, selectedInceDaire.name, selectedInceDaire.id)}
                                    className={`rounded-lg p-3 text-sm font-medium transition-all ${finalColor}`}>
                                    {work.name}
                                    {mc > 0 && <span className="block text-xs opacity-80">({mc})</span>}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      ) : inceViewMode === "is" && !selectedInceWork ? (
                        <div>
                          <h4 className="text-md font-medium text-gray-600 mb-3">İş Seçin</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {constructionFloors.flatMap((f: any) => f.works || []).map((work: any) => {
                              const relevantDaires = inceDaires.filter((d) => {
                                const perDaireNames = new Set<string>();
                                for (const dd of inceDaires) for (const a of (inceUnitOverrides[dd.id]?.added || [])) perDaireNames.add(a);
                                const isPerDaire = perDaireNames.has(work.name);
                                if (isPerDaire) return (inceUnitOverrides[d.id]?.added || []).includes(work.name);
                                return !(inceUnitOverrides[d.id]?.removed || []).includes(work.name);
                              });
                              const total = relevantDaires.length;
                              const done = relevantDaires.filter((d) => {
                                const key = `${work.id}:${d.id}`;
                                return inceEntries[key]?.status === "COMPLETED";
                              }).length;
                              const isCustom = customInceNames.has(work.name);
                              return (
                                <button key={work.id} onClick={() => setSelectedInceWork(work)}
                                  className={`w-full bg-white border-2 ${isCustom ? "border-emerald-300" : "border-gray-200"} hover:border-blue-500 rounded-xl p-5 text-center transition-all hover:shadow-md`}>
                                  <p className="font-semibold text-base text-gray-800">{work.name}</p>
                                  <p className="text-sm text-gray-400 mt-1">{done}/{total}</p>
                                </button>
                              );
                            })}
                            <button
                              onClick={() => openCustomWorkModal("INCE_INSAAT", undefined, undefined, true)}
                              title="Özel iş ekle"
                              className="bg-emerald-50 hover:bg-emerald-100 border-2 border-dashed border-emerald-400 rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center"
                            >
                              <Plus size={36} className="text-emerald-600" />
                              <p className="font-bold text-base text-emerald-700 mt-2">Özel İş Ekle</p>
                            </button>
                          </div>
                        </div>
                      ) : inceViewMode === "is" && selectedInceWork ? (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <button onClick={() => setSelectedInceWork(null)} className="p-1 hover:bg-gray-100 rounded">
                              <ArrowLeft size={18} />
                            </button>
                            <h4 className="text-md font-medium text-gray-600">{selectedInceWork.name} - Daireler</h4>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {(() => {
                              const perDaireNames = new Set<string>();
                              for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
                              const isPerDaire = perDaireNames.has(selectedInceWork.name);
                              const relevantDaires = inceDaires.filter((d) => {
                                if (isPerDaire) return (inceUnitOverrides[d.id]?.added || []).includes(selectedInceWork.name);
                                return !(inceUnitOverrides[d.id]?.removed || []).includes(selectedInceWork.name);
                              });
                              return relevantDaires.map((daire) => {
                                const key = `${selectedInceWork.id}:${daire.id}`;
                                const entry = inceEntries[key];
                                const st = entry?.status || "NOT_STARTED";
                                const mc = entry?.mediaCount || 0;
                                const hasStarted = st !== "NOT_STARTED" || mc > 0;
                                const color = st === "COMPLETED" ? "bg-green-500 text-white" : hasStarted ? "bg-yellow-500 text-white" : "bg-gray-100 text-gray-700 border-2 border-gray-200";
                                const selected = wizardMode === "personel" && isBulkSelected(selectedInceWork.id, daire.id);
                                const finalColor = selected ? "bg-yellow-300 text-gray-900 ring-4 ring-yellow-500" : color;
                                return (
                                  <button key={daire.id} onClick={() => handleCellClick(selectedInceWork.id, selectedInceWork.name, daire.name, daire.id)}
                                    className={`construction-cell-btn rounded-xl p-5 text-base font-semibold transition-all ${finalColor}`}>
                                    {daire.name}
                                    {mc > 0 && <span className="block text-sm opacity-80 mt-1">({mc})</span>}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : constructionFloors.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <Hammer className="mx-auto mb-3 text-gray-300" size={48} />
                      <p>Henüz inşaat maddesi eklenmemiş</p>
                    </div>
                  ) : isPeyzaj ? (
                    /* Peyzaj - dikey grid layout */
                    <div className="space-y-4">
                      {(() => {
                        let globalNum = 0;
                        return constructionFloors.map((floor) => (
                          <div key={floor.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 auto-rows-fr gap-2 p-3">
                              {floor.works.map((work) => {
                                globalNum++;
                                const num = globalNum;
                                const entry = constructionEntries[work.id];
                                const hasMedia = entry && entry.mediaCount > 0;
                                const status = entry?.status || "NOT_STARTED";
                                const hasStarted = status !== "NOT_STARTED" || hasMedia;
                                const floorPrefix = floor.name + " - ";
                                const displayName = work.name.startsWith(floorPrefix) ? work.name.slice(floorPrefix.length) : work.name;
                                const btnColor = status === "COMPLETED" ? "bg-green-500 text-white hover:bg-green-600" : hasStarted ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                                const isHot = status === "COMPLETED" || hasStarted;
                                const selected = wizardMode === "personel" && isBulkSelected(work.id);
                                const finalBtnColor = selected ? "bg-yellow-300 text-gray-900 hover:bg-yellow-400 ring-4 ring-yellow-500" : btnColor;
                                return (
                                  <button key={work.id} onClick={() => handleCellClick(work.id, work.name, floor.name)}
                                    className={`construction-cell-btn w-full h-full min-h-[5.5rem] px-3 py-4 rounded-lg text-lg font-semibold leading-snug transition-all text-center flex flex-col items-center justify-center ${finalBtnColor}`}>
                                    <span className={`inline-block text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center mb-1 ${selected ? "bg-[#1e3a5f] text-white" : (isHot ? "bg-white/30 text-white" : "bg-[#1e3a5f] text-white")}`}>{num}</span>
                                    <span className="block leading-snug">{displayName}</span>
                                    {hasMedia && <span className="block text-xs opacity-80 mt-0.5">({entry.mediaCount})</span>}
                                  </button>
                                );
                              })}
                              <button
                                onClick={() => openCustomWorkModal("PEYZAJ", floor.id, floor.name, false)}
                                title="Özel iş ekle"
                                className="w-full h-full min-h-[5.5rem] rounded-lg bg-emerald-50 hover:bg-emerald-100 border-2 border-dashed border-emerald-400 text-emerald-700 flex flex-col items-center justify-center transition-all"
                              >
                                <Plus size={32} />
                                <span className="text-xs mt-1 font-semibold">Özel ekle</span>
                              </button>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  ) : isMobile ? (
                    /* MOBİL: Kaba/Bina Genel/Belgeler — 2B tablo yerine kat dropdown + işler buton */
                    (() => {
                      const selFloor = constructionFloors.find((f) => f.id === mobileTableFloorId) || constructionFloors[0];
                      const typeLabel = selectedType === "KABA_INSAAT" ? "Kaba İnşaat" : selectedType === "BINA_GENEL" ? "Bina Genel" : selectedType === "RUHSAT_ISKAN" ? "Belgeler" : "Tablo";
                      return (
                        <>
                        <div className="space-y-3">
                          <button onClick={() => setMobileTablePreview(true)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1e3a5f]/5 border border-[#1e3a5f]/30 text-[#1e3a5f] font-semibold text-sm active:scale-95 transition-all">
                            <Eye size={18} /> Tabloyu Önizle
                          </button>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1 px-1">Kat / Bölüm seçin</label>
                            <select
                              value={selFloor?.id || ""}
                              onChange={(e) => setMobileTableFloorId(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-base font-semibold text-gray-800 focus:border-[#1e3a5f] outline-none"
                            >
                              {constructionFloors.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                          {selFloor && (
                            <div className="grid grid-cols-2 gap-2">
                              {selFloor.works.map((work, wi) => {
                                const entry = constructionEntries[work.id];
                                const hasMedia = entry && entry.mediaCount > 0;
                                const status = entry?.status || "NOT_STARTED";
                                const hasStarted = status !== "NOT_STARTED" || hasMedia;
                                const floorPrefix = selFloor.name + " - ";
                                const displayName = work.name.startsWith(floorPrefix) ? work.name.slice(floorPrefix.length) : work.name;
                                const btnColor = status === "COMPLETED" ? "bg-green-500 text-white hover:bg-green-600" : hasStarted ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200";
                                const isHot = status === "COMPLETED" || hasStarted;
                                const selected = wizardMode === "personel" && isBulkSelected(work.id);
                                const finalBtnColor = selected ? "bg-yellow-300 text-gray-900 hover:bg-yellow-400 ring-4 ring-yellow-500" : btnColor;
                                return (
                                  <button key={work.id} onClick={() => handleCellClick(work.id, work.name, selFloor.name)}
                                    className={`construction-cell-btn w-full min-h-[5.5rem] px-3 py-4 rounded-lg text-base font-semibold leading-snug transition-all text-center flex flex-col items-center justify-center ${finalBtnColor}`}>
                                    <span className={`inline-block text-[10px] font-bold rounded-full w-5 h-5 leading-5 text-center mb-1 ${selected ? "bg-[#1e3a5f] text-white" : (isHot ? "bg-white/30 text-white" : "bg-[#1e3a5f] text-white")}`}>{wi + 1}</span>
                                    <span className="block leading-snug">{displayName}</span>
                                    {hasMedia && <span className="block text-xs opacity-80 mt-0.5">({entry.mediaCount})</span>}
                                  </button>
                                );
                              })}
                              <button
                                onClick={() => openCustomWorkModal(selectedType, selFloor.id, selFloor.name, false)}
                                title="Özel iş ekle"
                                className="w-full min-h-[5.5rem] rounded-lg bg-emerald-50 hover:bg-emerald-100 border-2 border-dashed border-emerald-400 text-emerald-700 flex flex-col items-center justify-center transition-all"
                              >
                                <Plus size={30} />
                                <span className="text-xs mt-1 font-semibold">Özel ekle</span>
                              </button>
                            </div>
                          )}
                        </div>
                        {mobileTablePreview && (
                          <MobileTablePreview title={`${typeLabel} — Tablo Önizleme`} onBack={() => setMobileTablePreview(false)}>
                            <ConstructionTable
                              floors={constructionFloors}
                              entries={constructionEntries}
                              wizardMode={wizardMode}
                              isBulkSelected={isBulkSelected}
                              handleCellClick={handleCellClick}
                              openCustomWorkModal={openCustomWorkModal}
                              selectedType={selectedType}
                              interactive={false}
                            />
                          </MobileTablePreview>
                        )}
                        </>
                      );
                    })()
                  ) : (
                    /* Kaba / Bina Genel / Belgeler tablosu (masaüstü/tablet) */
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <ConstructionTable
                          floors={constructionFloors}
                          entries={constructionEntries}
                          wizardMode={wizardMode}
                          isBulkSelected={isBulkSelected}
                          handleCellClick={handleCellClick}
                          openCustomWorkModal={openCustomWorkModal}
                          selectedType={selectedType}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ─── CONFIRM DELETE MODAL ─── */}
          {confirmDelete && (
            <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={() => !confirmDeleteBusy && setConfirmDelete(null)}>
              <div className="bg-white rounded-2xl w-full max-w-md flex flex-col border-[5px] border-red-500 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-3 shrink-0 bg-red-50">
                  <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shrink-0">
                    <AlertTriangle size={26} className="text-white" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">{confirmDelete.title}</h3>
                </div>
                <div className="p-5">
                  <p className="text-base text-gray-700 leading-relaxed">{confirmDelete.message}</p>
                </div>
                <div className="p-4 border-t border-gray-200 flex gap-3 shrink-0">
                  <button
                    onClick={() => !confirmDeleteBusy && setConfirmDelete(null)}
                    disabled={confirmDeleteBusy}
                    className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold disabled:opacity-50 text-base"
                  >
                    İptal
                  </button>
                  <button
                    onClick={async () => {
                      setConfirmDeleteBusy(true);
                      try { await confirmDelete.onConfirm(); } finally {
                        setConfirmDeleteBusy(false);
                        setConfirmDelete(null);
                      }
                    }}
                    disabled={confirmDeleteBusy}
                    className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                  >
                    {confirmDeleteBusy ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    Sil
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── CUSTOM WORK MODAL (özel iş ekle) ─── */}
          {customWorkModal && (
            <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => !customWorkSaving && setCustomWorkModal(null)}>
              <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col border-[5px] border-emerald-500 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 bg-emerald-50">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">Özel İş Ekle</h3>
                    <p className="text-xs text-gray-500">
                      {customWorkModal.isInce
                        ? "İnce İnşaat – yeni iş kalemi"
                        : `${customWorkModal.floorName ?? ""}`}
                    </p>
                  </div>
                  <button onClick={() => !customWorkSaving && setCustomWorkModal(null)} className="p-2 hover:bg-gray-200 rounded-lg">
                    <X size={22} />
                  </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">İş Adı</label>
                    <input
                      type="text"
                      value={customWorkName}
                      onChange={(e) => setCustomWorkName(e.target.value)}
                      placeholder="Örn: Cam montajı"
                      autoFocus
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-base outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>

                  {customWorkModal.isInce && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Hangi Daireler İçin?</label>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => setCustomWorkDaireMode("ALL")}
                          className={`py-3 px-3 rounded-xl border-2 text-base font-semibold transition-all ${customWorkDaireMode === "ALL" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-700 border-gray-300"}`}
                        >
                          Tüm Daireler
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomWorkDaireMode("SELECT")}
                          className={`py-3 px-3 rounded-xl border-2 text-base font-semibold transition-all ${customWorkDaireMode === "SELECT" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-700 border-gray-300"}`}
                        >
                          Seçili Daireler
                        </button>
                      </div>
                      {customWorkDaireMode === "SELECT" && (
                        <div className="border-2 border-gray-200 rounded-xl p-3 max-h-64 overflow-y-auto">
                          <div className="flex items-center justify-between mb-2 pb-2 border-b">
                            <span className="text-xs text-gray-500">{customWorkDaireIds.length}/{inceDaires.length} seçili</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (customWorkDaireIds.length === inceDaires.length) setCustomWorkDaireIds([]);
                                else setCustomWorkDaireIds(inceDaires.map((d) => d.id));
                              }}
                              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                            >
                              {customWorkDaireIds.length === inceDaires.length ? "Hepsini Kaldır" : "Hepsini Seç"}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {inceDaires.map((d) => {
                              const checked = customWorkDaireIds.includes(d.id);
                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => {
                                    setCustomWorkDaireIds((prev) => checked ? prev.filter((x) => x !== d.id) : [...prev, d.id]);
                                  }}
                                  className={`py-3 px-3 rounded-lg text-sm font-medium text-left flex items-center gap-2 ${checked ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                                >
                                  <span className={`w-5 h-5 rounded border-2 flex items-center justify-center ${checked ? "bg-white border-white" : "border-gray-400"}`}>
                                    {checked && <Check size={14} className="text-emerald-600" />}
                                  </span>
                                  {d.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-200 flex gap-3 shrink-0">
                  <button
                    onClick={() => !customWorkSaving && setCustomWorkModal(null)}
                    disabled={customWorkSaving}
                    className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold disabled:opacity-50"
                  >
                    İptal
                  </button>
                  <button
                    onClick={submitCustomWork}
                    disabled={customWorkSaving || !customWorkName.trim()}
                    className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {customWorkSaving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    Ekle
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── MEDIA POPUP ─── */}
          {mediaPopup && !viewMediaMode && (
            <div className="fixed inset-0 bg-black/60 z-[55] flex items-center justify-center p-4" onClick={() => { setMediaPopup(null); setPersonnelPopupOpen(false); setPendingFile(null); setPendingFileName(""); setMediaTitle(""); setMediaDesc(""); }}>
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="font-bold text-gray-900">{mediaPopup.workName}</h3>
                    <p className="text-xs text-gray-400">{mediaPopup.floorName} — {selectedBlock?.name || "Peyzaj"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const isCustomNonInce = selectedType !== "INCE_INSAAT" && customWorkIds.has(mediaPopup.workId);
                      const isCustomInce = selectedType === "INCE_INSAAT" && customInceNames.has(mediaPopup.workName);
                      if (!isCustomNonInce && !isCustomInce) return null;
                      return (
                        <button
                          onClick={() => {
                            const closePopup = () => { setMediaPopup(null); setPersonnelPopupOpen(false); setPendingFile(null); setPendingFileName(""); setMediaTitle(""); setMediaDesc(""); };
                            if (isCustomInce) {
                              setConfirmDelete({
                                title: "Özel İşi Sil",
                                message: `"${mediaPopup.workName}" tüm dairelerden silinecek. Bu işe ait tüm medyalar ve kayıtlar da silinecek. Onaylıyor musunuz?`,
                                onConfirm: async () => {
                                  await deleteCustomInceWork(mediaPopup.workName);
                                  closePopup();
                                },
                              });
                            } else {
                              setConfirmDelete({
                                title: "Özel İşi Sil",
                                message: `"${mediaPopup.workName}" silinecek. Bu işe ait tüm medyalar ve kayıtlar da silinecek. Onaylıyor musunuz?`,
                                onConfirm: async () => {
                                  await deleteCustomNonInceWork(mediaPopup.workId, selectedType);
                                  closePopup();
                                },
                              });
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                          title="Özel işi sil"
                        >
                          <Trash2 size={14} className="inline mr-1" />
                          Butonu Sil
                        </button>
                      );
                    })()}
                    {entryStatus === "IN_PROGRESS" && (
                      <button onClick={handleMarkComplete}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-green-50">
                        <CheckCircle size={14} className="inline mr-1" />
                        İş Bitir
                      </button>
                    )}
                    {entryStatus === "COMPLETED" && (
                      <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 inline-flex items-center" title="Bu iş tamamlandı">
                        <CheckCircle size={14} className="inline mr-1" />
                        Tamamlandı
                      </span>
                    )}
                    <button onClick={() => { setMediaPopup(null); setPersonnelPopupOpen(false); setPendingFile(null); setPendingFileName(""); setMediaTitle(""); setMediaDesc(""); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Tarihler */}
                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 flex gap-4 shrink-0">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase text-gray-400 font-semibold">Başlangıç</label>
                    <input type="date" value={entryStartDate} onChange={(e) => handleDateChange("startDate", e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded mt-0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] uppercase text-gray-400 font-semibold">Bitiş</label>
                    <input type="date" value={entryEndDate} onChange={(e) => handleDateChange("endDate", e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded mt-0.5" />
                  </div>
                </div>

                {/* Media grid */}
                <div className="flex-1 overflow-y-auto p-4 media-grid-container">
                  {mediaLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="animate-spin text-gray-400" size={24} />
                    </div>
                  ) : mediaItems.length === 0 ? (
                    <div className="text-center py-12">
                      <ImageIcon size={48} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500 text-sm">Henüz medya yüklenmemiş</p>
                      <p className="text-gray-400 text-xs mt-1">Aşağıdaki butonlardan yükleyebilirsiniz</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {mediaGroups.map((group) => (
                        <section key={group.dateKey} className="space-y-3 pt-1">
                          <div className="flex items-center gap-2 py-1">
                            <h4 className="shrink-0 inline-flex items-center rounded-full bg-[#1e3a5f] px-3 py-1.5 text-xs font-bold text-white shadow-sm">
                              {group.label}
                            </h4>
                            <div className="h-0.5 flex-1 rounded-full bg-[#1e3a5f]/70" aria-hidden="true" />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 media-thumb-grid">
                            {group.items.map(({ media, index }) => (
                              <div key={media.id} className="relative group rounded-xl overflow-hidden border-2 border-gray-200 hover:border-[#c0392b] cursor-pointer aspect-square shadow-sm hover:shadow-md transition-all"
                                onClick={() => { setViewMediaIndex(index); setViewMediaMode(true); }}>
                                {media.mimeType.startsWith("video/") ? (
                                  <video src={media.fileUrl} className="w-full h-full object-cover bg-black pointer-events-none" />
                                ) : (
                                  <img src={media.fileUrl + (media.fileUrl.includes("?") ? "&" : "?") + "size=thumb"} alt={media.fileName} loading="lazy" decoding="async" className="w-full h-full object-cover bg-gray-100 pointer-events-none" />
                                )}
                                {entryStatus !== "COMPLETED" && (
                                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingMediaId(media.id); setEditMediaTitle(media.title || ""); setEditMediaDesc(media.description || ""); }}
                                      className="bg-blue-600 text-white p-1.5 rounded-full hover:bg-blue-700 transition-all shadow"
                                      title="Düzenle"
                                    >
                                      <Edit3 size={12} />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ mediaId: media.id, fileName: media.fileName }); }}
                                      className="bg-red-600 text-white p-1.5 rounded-full hover:bg-red-700 transition-all shadow"
                                      title="Sil"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                                <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow">
                                  {index + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>

                {/* Upload buttons */}
                <div className="px-4 py-3 border-t border-gray-200 shrink-0 space-y-2">
                  <input ref={photoFallbackRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) handleMediaUpload(e.target.files[0]); e.target.value = ""; }} />
                  <input ref={videoFallbackRef} type="file" accept="video/*" capture="environment" className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) handleMediaUpload(e.target.files[0]); e.target.value = ""; }} />
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
                    onChange={handleGalleryUpload} />

                  {isMobile ? (
                    /* MOBİL: modern yakala/seç butonları (ikon balonu + etiket) */
                    <div className="flex gap-2.5">
                      <button onClick={() => startCamera("photo")} disabled={mediaUploading}
                        className="pressable flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-semibold shadow-md active:scale-95 transition-all disabled:opacity-50">
                        <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Camera size={18} /></span>
                        <span className="text-xs">Fotoğraf</span>
                      </button>
                      <button onClick={() => startCamera("video")} disabled={mediaUploading}
                        className="pressable flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold shadow-md active:scale-95 transition-all disabled:opacity-50">
                        <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Video size={18} /></span>
                        <span className="text-xs">Video</span>
                      </button>
                      <label className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-[#c0392b] text-white font-semibold shadow-md active:scale-95 transition-all cursor-pointer">
                        <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><FolderOpen size={18} /></span>
                        <span className="text-xs">Galeri</span>
                        <input type="file" onChange={handleGalleryUpload} className="hidden" accept="image/*,video/*" multiple />
                      </label>
                    </div>
                  ) : (
                    <>
                      <div className="media-upload-btn-wrap grid grid-cols-2 gap-2">
                        <button onClick={() => startCamera("photo")} disabled={mediaUploading}
                          className="media-upload-btn flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-blue-600 text-white font-semibold text-sm cursor-pointer hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 shadow hover:shadow-md">
                          <Camera size={16} /> Fotoğraf Çek
                        </button>
                        <button onClick={() => startCamera("video")} disabled={mediaUploading}
                          className="media-upload-btn flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-purple-600 text-white font-semibold text-sm cursor-pointer hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-50 shadow hover:shadow-md">
                          <Video size={16} /> Video Çek
                        </button>
                      </div>
                      <label className="media-upload-btn flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-full bg-[#c0392b] text-white font-semibold text-sm cursor-pointer hover:bg-[#922b21] active:scale-95 transition-all shadow hover:shadow-md">
                        <FolderOpen size={16} /> Galeriden Fotoğraf / Video Seç
                        <input type="file" onChange={handleGalleryUpload} className="hidden" accept="image/*,video/*" multiple />
                      </label>
                    </>
                  )}
                  {mediaItems.length > 4 && (
                    <p className="ipad-scroll-hint text-center text-sm text-gray-500 mt-2">Diğer fotoğrafları görmek için aşağıya kaydır</p>
                  )}
                </div>

                {mediaUploading && (
                  <div className="px-4 pb-3">
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="animate-spin" size={14} /> Yükleniyor...
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── CAMERA STREAM OVERLAY ─── */}
          {cameraActive && (
            <div className="fixed inset-0 bg-black z-[60]" style={{ touchAction: "none" }}>
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

          {/* ─── PENDING FILE UPLOAD DIALOG ─── */}
          {pendingFile && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
              <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
                <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload size={28} className="text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Medya Yükle</h3>
                <p className="text-xs text-gray-400 text-center mb-4">{pendingFileName || "Dosya seçildi"}</p>
                <div className="mb-4 flex justify-center">
                  {pendingFile.type?.startsWith("video/") ? (
                    <video src={URL.createObjectURL(pendingFile)} className="max-h-40 rounded-lg" controls playsInline />
                  ) : (
                    <img src={URL.createObjectURL(pendingFile)} alt="Önizleme" className="max-h-40 rounded-lg object-contain" />
                  )}
                </div>
                <div className="mb-3">
                  <input type="text" placeholder="Başlık (isteğe bağlı)" value={mediaTitle} onChange={(e) => setMediaTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                </div>
                <div className="mb-4">
                  <textarea placeholder="Açıklama (isteğe bağlı)" value={mediaDesc} onChange={(e) => setMediaDesc(e.target.value)} rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setPendingFile(null); setPendingFileName(""); setMediaTitle(""); setMediaDesc(""); }}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
                    İptal
                  </button>
                  <button onClick={handlePendingUpload} disabled={mediaUploading}
                    className="pressable flex-1 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium hover:bg-[#16304f] disabled:opacity-50 flex items-center justify-center gap-2">
                    {mediaUploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                    Yükle
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── MEDIA VIEWER ─── */}
          {viewMediaMode && mediaItems.length > 0 && (
            <div className="fixed inset-0 bg-black/90 flex flex-col z-[70] select-none" onMouseDown={(e) => e.preventDefault()}>
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/50 modal-safe-top">
                <div className="text-white min-w-0">
                  <h3 className="text-sm font-semibold truncate">{mediaPopup?.workName}</h3>
                  <p className="text-xs text-white/60">{mediaPopup?.floorName} — {viewMediaIndex + 1} / {mediaItems.length}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const m = mediaItems[viewMediaIndex];
                      if (!m) return;
                      window.open(`/api/download?url=${encodeURIComponent(m.fileUrl)}&name=${encodeURIComponent(m.fileName || 'medya')}`, '_self');
                    }}
                    className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="İndir">
                    <Download size={24} />
                  </button>
                  <button
                    onClick={() => {
                      const m = mediaItems[viewMediaIndex];
                      if (m) {
                        const url = window.location.origin + m.fileUrl;
                        navigator.clipboard.writeText(url).then(() => alert("Link kopyalandı!"));
                      }
                    }}
                    className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center" title="Link Kopyala">
                    <Share2 size={24} />
                  </button>
                  {entryStatus !== "COMPLETED" && (
                    <button
                      onClick={() => {
                        const m = mediaItems[viewMediaIndex];
                        if (m) setDeleteConfirm({ mediaId: m.id, fileName: m.fileName, fromGallery: true });
                      }}
                      className="p-3.5 hover:bg-white/20 rounded-xl text-red-400 min-w-[48px] min-h-[48px] flex items-center justify-center" title="Sil">
                      <Trash2 size={24} />
                    </button>
                  )}
                  <button onClick={() => { setViewMediaMode(false); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false); }} className="p-3.5 hover:bg-white/20 rounded-xl text-white min-w-[48px] min-h-[48px] flex items-center justify-center">
                    <X size={26} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative" onClick={(e) => { if (e.target === e.currentTarget) { setViewMediaMode(false); setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgFullscreen(false); } }}>
                <button onClick={(e) => { e.stopPropagation(); if (viewMediaIndex > 0) { setViewMediaIndex(viewMediaIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); } }} className={`hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all ${viewMediaIndex <= 0 ? "invisible" : ""}`}>
                  <ArrowLeftIcon size={24} />
                </button>

                <div className="w-full flex-1 flex items-center justify-center p-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  {mediaItems[viewMediaIndex]?.mimeType.startsWith("video/") ? (
                    <video
                      key={mediaItems[viewMediaIndex].id}
                      src={mediaItems[viewMediaIndex].fileUrl}
                      controls
                      playsInline
                      preload="auto"
                      className="w-full max-h-[85vh] rounded-lg cursor-pointer"
                      onPlay={(e) => {
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
                      className={`relative w-full h-full flex items-center justify-center ${imgFullscreen ? 'bg-black' : ''}`}
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
                            if (dx < -50 && viewMediaIndex < mediaItems.length - 1) {
                              setViewMediaIndex(viewMediaIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
                            } else if (dx > 50 && viewMediaIndex > 0) {
                              setViewMediaIndex(viewMediaIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 });
                            } else { setImgPan({ x: 0, y: 0 }); }
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
                        key={mediaItems[viewMediaIndex].id}
                        src={mediaItems[viewMediaIndex].fileUrl}
                        alt={mediaItems[viewMediaIndex].fileName}
                        className={`object-contain rounded-lg select-none cursor-pointer ${imgFullscreen ? 'w-full h-full' : 'w-full max-h-[85vh]'}`}
                        draggable={false}
                        style={{ transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px)`, transition: imgTouchRef.current ? 'none' : 'transform 0.2s ease-out' }}
                      />
                      {/* Büyüt göstergesi (tam ekran değilken) — pointer-events-none: dokunuş alttaki konteynıra geçer,
                          resme dokunmakla AYNI güvenilir yoldan tam ekrana girer (yarış yok). */}
                      {!imgFullscreen && (
                        <div className="absolute bottom-4 right-4 z-20 p-2 bg-black/55 rounded-full text-white/85 pointer-events-none">
                          <Maximize2 size={18} />
                        </div>
                      )}
                      {/* Küçült (tam ekranda) — gerçek buton, tam ekrandan çıkar. Zoom durumundan bağımsız hep görünür. */}
                      {imgFullscreen && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (document.exitFullscreen) document.exitFullscreen();
                            else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                            setImgFullscreen(false);
                            setImgZoom(1); setImgPan({ x: 0, y: 0 });
                          }}
                          className="absolute bottom-4 right-4 z-30 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-all">
                          <Minimize2 size={18} />
                        </button>
                      )}
                      {/* Yakınlaştırma sıfırlama — yalnızca zoom'dayken */}
                      {imgFullscreen && imgZoom > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }}
                          className="absolute top-4 right-4 z-20 px-3 py-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white text-xs font-medium flex items-center gap-1.5 transition-all">
                          <X size={14} /> {Math.round(imgZoom * 100)}%
                        </button>
                      )}
                      {imgFullscreen && imgZoom <= 1 && viewMediaIndex > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); setViewMediaIndex(viewMediaIndex - 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }} className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 rounded-full text-white">
                          <ArrowLeftIcon size={24} />
                        </button>
                      )}
                      {imgFullscreen && imgZoom <= 1 && viewMediaIndex < mediaItems.length - 1 && (
                        <button onClick={(e) => { e.stopPropagation(); setViewMediaIndex(viewMediaIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); }} className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 rounded-full text-white">
                          <ArrowRightIcon size={24} />
                        </button>
                      )}
                      {imgFullscreen && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-black/50 rounded-full text-white text-xs">
                          {viewMediaIndex + 1} / {mediaItems.length}
                        </div>
                      )}
                      {imgFullscreen && (mediaItems[viewMediaIndex]?.title || mediaItems[viewMediaIndex]?.description) && (
                        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 max-w-[90%] px-4 py-2 bg-black/55 rounded-lg text-center pointer-events-none">
                          {mediaItems[viewMediaIndex]?.title && (
                            <p className="text-white text-sm font-semibold">{mediaItems[viewMediaIndex].title}</p>
                          )}
                          {mediaItems[viewMediaIndex]?.description && (
                            <p className="text-white/80 text-xs mt-0.5 line-clamp-2">{mediaItems[viewMediaIndex].description}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button onClick={(e) => { e.stopPropagation(); if (viewMediaIndex < mediaItems.length - 1) { setViewMediaIndex(viewMediaIndex + 1); setImgZoom(1); setImgPan({ x: 0, y: 0 }); } }} className={`hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all ${viewMediaIndex >= mediaItems.length - 1 ? "invisible" : ""}`}>
                  <ArrowRightIcon size={24} />
                </button>
              </div>

              {/* Title & Description (non-fullscreen) */}
              {(mediaItems[viewMediaIndex]?.title || mediaItems[viewMediaIndex]?.description) && (
                <div className="flex-shrink-0 w-full max-w-2xl mx-auto px-6 pb-4 text-center">
                  {mediaItems[viewMediaIndex]?.title && (
                    <h4 className="text-white text-sm font-semibold">{mediaItems[viewMediaIndex].title}</h4>
                  )}
                  {mediaItems[viewMediaIndex]?.description && (
                    <p className="text-white/70 text-xs mt-1">{mediaItems[viewMediaIndex].description}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── EDIT MEDIA POPUP ─── */}
          {editingMediaId && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={() => setEditingMediaId(null)}>
              <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
                <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Edit3 size={28} className="text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 text-center mb-4">Medya Bilgilerini Düzenle</h3>
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Başlık</label>
                    <input type="text" value={editMediaTitle} onChange={(e) => setEditMediaTitle(e.target.value)} placeholder="Medya başlığı..."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f]" autoFocus />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
                    <textarea value={editMediaDesc} onChange={(e) => setEditMediaDesc(e.target.value)} placeholder="Medya açıklaması..." rows={3}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none" />
                  </div>
                </div>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => setEditingMediaId(null)} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
                  <button onClick={() => handleMediaUpdate(editingMediaId, editMediaTitle, editMediaDesc)} className="px-5 py-2.5 bg-[#1e3a5f] hover:bg-[#16304f] text-white rounded-lg text-sm font-medium">Kaydet</button>
                </div>
              </div>
            </div>
          )}

          {/* ─── DELETE CONFIRM POPUP ─── */}
          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
              <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]" onClick={(e) => e.stopPropagation()}>
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={28} className="text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Medya Silinecek</h3>
                <p className="text-sm text-gray-500 text-center mb-5">
                  <span className="font-medium text-gray-700">&ldquo;{deleteConfirm.fileName}&rdquo;</span> medyasını silmek istediğinize emin misiniz?
                </p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => setDeleteConfirm(null)} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
                  <button
                    onClick={async () => {
                      const { mediaId, fromGallery } = deleteConfirm;
                      setDeleteConfirm(null);
                      await handleMediaDelete(mediaId);
                      if (fromGallery) {
                        if (mediaItems.length <= 1) {
                          setViewMediaMode(false);
                        } else if (viewMediaIndex >= mediaItems.length - 1) {
                          setViewMediaIndex(Math.max(0, viewMediaIndex - 1));
                        }
                      }
                    }}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Sil</button>
                </div>
              </div>
            </div>
          )}

          {/* ─── PERSONNEL POPUP ─── */}
          {personnelPopupOpen && (
            <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => closePersonnelPopupAuto()}>
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                  <div>
                    <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                      <HardHat size={20} className="text-[#c0392b]" />
                      {bulkPersonnelMode ? `Personel Ekle (${bulkSelected.length})` : "Personel Takip"}
                    </h2>
                    {bulkPersonnelMode ? (
                      <p className="text-sm text-gray-500 mt-0.5">Seçili {bulkSelected.length} kayda aynı personel eklenecek</p>
                    ) : (
                      <p className="text-sm text-gray-500 mt-0.5">{(mediaPopup || personnelContext)?.floorName} — {(mediaPopup || personnelContext)?.workName}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!bulkPersonnelMode && (
                      <button onClick={openPersonnelHistory} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
                        <History size={16} /> Geçmiş
                      </button>
                    )}
                    <button onClick={() => closePersonnelPopupAuto()} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* History panel */}
                {personnelHistoryOpen && (
                  <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800">Geçmiş Kayıtlar</span>
                      <button onClick={() => setPersonnelHistoryOpen(false)} className="text-blue-600 hover:text-blue-800 text-xs">Kapat</button>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <button onClick={() => changePersonnelHistoryDate(-1)} className="p-1 hover:bg-blue-100 rounded"><ArrowLeftIcon size={16} /></button>
                      <input type="date" value={personnelHistoryDate}
                        onChange={(e) => { setPersonnelHistoryDate(e.target.value); fetchPersonnelHistory(e.target.value); }}
                        className="px-2 py-1 text-sm border border-blue-200 rounded bg-white" />
                      <button onClick={() => changePersonnelHistoryDate(1)} className="p-1 hover:bg-blue-100 rounded"><ArrowRightIcon size={16} /></button>
                    </div>
                    {personnelHistoryLoading ? (
                      <div className="text-center py-2"><Loader2 className="animate-spin text-blue-400 mx-auto" size={20} /></div>
                    ) : personnelHistoryRecords.length === 0 ? (
                      <p className="text-sm text-blue-600 text-center py-2">Bu tarihte kayıt yok</p>
                    ) : (
                      <div className="space-y-1">
                        {personnelHistoryRecords.map((r) => (
                          <div key={r.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg text-sm">
                            <div>
                              <span className="font-medium text-gray-800">{r.personnelName}</span>
                              {r.company && <span className="text-gray-400 ml-2">({r.company})</span>}
                            </div>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.workDuration === "FULL_DAY" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                              {r.workDuration === "FULL_DAY" ? "Tam" : "Yarım"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Today's records (or bulk selection summary) */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {bulkPersonnelMode ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Seçili Kayıtlar ({bulkSelected.length})</p>
                        <div className="space-y-1.5">
                          {bulkSelected.map((b, i) => (
                            <div key={`${b.workId}-${b.floorId || ""}-${i}`} className="flex items-center justify-between bg-[#1e3a5f]/5 border border-[#1e3a5f]/20 px-3 py-2 rounded-lg">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#1e3a5f] truncate">{b.workName}</p>
                                <p className="text-xs text-gray-500 truncate">{b.floorName}</p>
                              </div>
                              <button
                                onClick={() => setBulkSelected((prev) => prev.filter((x) => !(x.workId === b.workId && (x.floorId || "") === (b.floorId || ""))))}
                                className="shrink-0 ml-2 w-9 h-9 flex items-center justify-center text-red-500 hover:text-white hover:bg-red-500 rounded-lg border border-red-200 hover:border-red-500 transition-colors"
                                title="Kaldır"
                              >
                                <X size={22} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      {bulkAddedPersonnel.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-green-700 font-semibold mb-2">Eklenen Personel ({bulkAddedPersonnel.length})</p>
                          <div className="space-y-1.5">
                            {bulkAddedPersonnel.map((p, i) => (
                              <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-green-800 truncate">{p.name}{p.company ? <span className="text-xs text-green-600 ml-2">({p.company})</span> : null}</p>
                                  <p className="text-xs text-gray-500">{p.duration === "FULL_DAY" ? "Tam Gün" : "Yarım Gün"} — {bulkSelected.length} kayıt</p>
                                </div>
                                <span className="shrink-0 text-green-600"><Check size={20} /></span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : personnelLoading ? (
                    <div className="text-center py-6"><Loader2 className="animate-spin text-gray-400 mx-auto" size={24} /></div>
                  ) : personnelRecords.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">Bugün henüz kayıt yok</div>
                  ) : (
                    <div className="space-y-2">
                      {personnelRecords.map((r) => (
                        <div key={r.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{r.personnelName}</span>
                            {r.company && <span className="text-xs text-gray-400 ml-2">({r.company})</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.workDuration === "FULL_DAY" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                              {r.workDuration === "FULL_DAY" ? "Tam" : "Yarım"}
                            </span>
                            <button onClick={() => handleDeletePersonnel(r.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add form */}
                <div className="px-6 py-4 border-t border-gray-200 shrink-0">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input type="text" placeholder="İsim" value={personnelFormName}
                        onChange={(e) => handlePersonnelNameChange(e.target.value)}
                        onFocus={() => { setPersonnelFilteredNames(personnelNameSuggestions); setPersonnelShowNameSugg(true); }}
                        onBlur={() => setTimeout(() => setPersonnelShowNameSugg(false), 200)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base outline-none focus:ring-2 focus:ring-[#c0392b]" />
                      {personnelShowNameSugg && personnelFilteredNames.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto z-10">
                          {personnelFilteredNames.slice(0, 10).map((n, i) => (
                            <button key={i} onMouseDown={() => selectPersonnelName(n)}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100">{n}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 relative">
                      <input type="text" placeholder="Firma" value={personnelFormCompany}
                        onChange={(e) => handlePersonnelCompanyChange(e.target.value)}
                        onFocus={() => { setPersonnelFilteredComps(personnelCompanySuggestions); setPersonnelShowCompSugg(true); }}
                        onBlur={() => setTimeout(() => setPersonnelShowCompSugg(false), 200)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base outline-none focus:ring-2 focus:ring-[#c0392b]" />
                      {personnelShowCompSugg && personnelFilteredComps.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto z-10">
                          {personnelFilteredComps.slice(0, 10).map((c, i) => (
                            <button key={i} onMouseDown={() => { setPersonnelFormCompany(c); setPersonnelShowCompSugg(false); }}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100">{c}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex bg-gray-100 rounded-xl p-1 flex-1">
                      <button onClick={() => setPersonnelFormDuration("FULL_DAY")}
                        className={`flex-1 px-4 py-4 rounded-lg text-base font-semibold transition-colors ${personnelFormDuration === "FULL_DAY" ? "bg-green-500 text-white" : "text-gray-600 hover:bg-gray-200"}`}>
                        Tam Gün
                      </button>
                      <button onClick={() => setPersonnelFormDuration("HALF_DAY")}
                        className={`flex-1 px-4 py-4 rounded-lg text-base font-semibold transition-colors ${personnelFormDuration === "HALF_DAY" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-200"}`}>
                        Yarım Gün
                      </button>
                    </div>
                    <button onClick={bulkPersonnelMode ? handleAddBulkPersonnel : handleAddPersonnel} disabled={!personnelFormName.trim() || bulkSubmitting}
                      className="px-5 py-4 bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg text-base font-semibold disabled:opacity-50 flex items-center gap-1.5">
                      {bulkSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />} Ekle
                    </button>
                  </div>
                  {bulkPersonnelMode && bulkAddedPersonnel.length > 0 && (
                    <button onClick={() => closePersonnelPopupAuto()}
                      className="w-full mt-2 px-5 py-3 bg-[#1e3a5f] hover:bg-[#16304f] text-white rounded-lg text-base font-semibold flex items-center justify-center gap-1.5">
                      <Check size={20} /> Tamamla ({bulkAddedPersonnel.length} personel eklendi)
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── DEPO KONTROL POPUP ─── */}
      {depoOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
          <div className="bg-white flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-orange-600 text-white shrink-0 modal-safe-top">
              <div className="flex items-center gap-3">
                <Warehouse size={22} />
                <h2 className="text-lg font-semibold">Depo Kontrol</h2>
              </div>
              <button onClick={() => setDepoOpen(false)} className="p-2 hover:bg-white/10 rounded-lg" aria-label="Kapat">
                <X size={22} />
              </button>
            </div>

            {/* Depo seçimi — mobilde dropdown (enumerated), masaüstü/tablet sekmeler */}
            {depoWarehouses.length > 0 && (
              isMobile ? (
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-3 shrink-0">
                  <label className="block text-xs font-semibold text-gray-500 mb-1 px-1">Depo seçin</label>
                  <select
                    value={depoActiveTab}
                    onChange={(e) => setDepoActiveTab(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-base font-semibold text-gray-800 focus:border-orange-500 outline-none"
                  >
                    {depoWarehouses.map((w, i) => (
                      <option key={w.id} value={i}>{w.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-3 overflow-x-auto shrink-0">
                  <div className="flex gap-3">
                    {depoWarehouses.map((w, i) => (
                      <button
                        key={w.id}
                        onClick={() => setDepoActiveTab(i)}
                        className={`px-8 py-4 rounded-full text-base font-semibold whitespace-nowrap transition-colors ${
                          depoActiveTab === i
                            ? "bg-orange-600 text-white shadow-lg"
                            : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {depoLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-10 h-10 animate-spin text-orange-600" />
                </div>
              ) : depoWarehouses.length === 0 ? (
                <div className="text-center text-gray-500 py-20">Henüz depo bulunmuyor.</div>
              ) : depoActiveWarehouse ? (
                <div className="max-w-5xl mx-auto">
                  {/* Action bar */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Malzeme ara..."
                        value={depoSearch}
                        onChange={(e) => setDepoSearch(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-400 focus:outline-none text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setDepoAddOpen(true); setDepoAddMaterialId(""); setDepoAddNewName(""); setDepoAddNewUnit("adet"); setDepoAddQty(""); }}
                        className="flex-1 sm:flex-none justify-center px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                      >
                        <Plus size={18} /> Malzeme Ekle
                      </button>
                      <button
                        onClick={() => { setDepoWdOpen(true); setDepoWdMaterialId(""); setDepoWdQty(""); }}
                        className="flex-1 sm:flex-none justify-center px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                      >
                        <Minus size={18} /> Malzeme Çıkart
                      </button>
                    </div>
                  </div>

                  {/* Materials table */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Malzeme</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Miktar</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Birim</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {depoActiveWarehouse.materials
                          .filter(wm => !depoSearch.trim() || wm.material.name.toLowerCase().includes(depoSearch.toLowerCase()))
                          .map(wm => (
                          <tr key={wm.id} onClick={() => openDepoStockMedia(wm)} className="hover:bg-orange-50 cursor-pointer transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                              <div className="flex items-center gap-2">
                                {wm.material.name}
                                {(wm.media?.length ?? 0) > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                    <ImageIcon size={12} />
                                    {wm.media.length}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`px-4 py-3 text-sm text-right font-bold ${wm.quantity <= 0 ? "text-red-600" : "text-gray-800"}`}>{wm.quantity}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{wm.material.unit}</td>
                          </tr>
                        ))}
                        {depoActiveWarehouse.materials.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-500">Bu depoda henüz malzeme yok.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Add material sub-modal */}
          {depoAddOpen && (
            <div className="fixed inset-0 bg-black/60 z-[55] flex items-center justify-center p-4" onClick={() => setDepoAddOpen(false)}>
              <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-7 py-5 bg-green-600 text-white">
                  <h3 className="font-semibold text-2xl">Malzeme Ekle{depoActiveWarehouse ? ` – ${depoActiveWarehouse.name}` : ""}</h3>
                  <button onClick={() => setDepoAddOpen(false)} className="p-2 hover:bg-white/10 rounded-full">
                    <X size={24} />
                  </button>
                </div>
                <div className="p-7 space-y-5">
                  <div>
                    <label className="block text-base font-medium text-gray-700 mb-2">Mevcut Malzeme</label>
                    <select
                      value={depoAddMaterialId}
                      onChange={(e) => { setDepoAddMaterialId(e.target.value); if (e.target.value) { setDepoAddNewName(""); } }}
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-200 focus:border-green-400 focus:outline-none text-base"
                    >
                      <option value="">-- Yeni malzeme oluştur --</option>
                      {depoAllMaterials.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                  </div>
                  {!depoAddMaterialId && (
                    <>
                      <div>
                        <label className="block text-base font-medium text-gray-700 mb-2">Yeni Malzeme Adı</label>
                        <input
                          type="text"
                          value={depoAddNewName}
                          onChange={(e) => setDepoAddNewName(e.target.value)}
                          placeholder="örn: Çimento"
                          className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-200 focus:border-green-400 focus:outline-none text-base"
                        />
                      </div>
                      <div>
                        <label className="block text-base font-medium text-gray-700 mb-2">Birim</label>
                        <select
                          value={depoAddNewUnit}
                          onChange={(e) => setDepoAddNewUnit(e.target.value)}
                          className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-200 focus:border-green-400 focus:outline-none text-base"
                        >
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-base font-medium text-gray-700 mb-2">Eklenecek Miktar</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={depoAddQty}
                      onChange={(e) => setDepoAddQty(e.target.value)}
                      placeholder="0"
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-200 focus:border-green-400 focus:outline-none text-base"
                    />
                  </div>
                  {!depoAddMaterialId && (
                    <div>
                      <label className="block text-base font-medium text-gray-700 mb-2">Fotoğraf / Video</label>
                      <input ref={depoAddFileInputRef} type="file" multiple accept="image/*,video/*" onChange={(e) => handleDepoMediaFiles("add", e)} className="hidden" />
                      <input ref={depoAddPhotoCaptureRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleDepoMediaFiles("add", e)} className="hidden" />
                      <input ref={depoAddVideoCaptureRef} type="file" accept="video/*" capture="environment" onChange={(e) => handleDepoMediaFiles("add", e)} className="hidden" />
                      {isMobile ? (
                        /* MOBİL: medya pop-up / teslimat / stok ile aynı modern butonlar (flex, tek satır) */
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startDepoCamera("add", "photo")}
                            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Camera size={18} /></span>
                            <span className="text-xs">Fotoğraf</span>
                          </button>
                          <button type="button" onClick={() => startDepoCamera("add", "video")}
                            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Video size={18} /></span>
                            <span className="text-xs">Video</span>
                          </button>
                          <button type="button" onClick={() => depoAddFileInputRef.current?.click()}
                            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-[#c0392b] text-white font-semibold shadow-md active:scale-95 transition-all">
                            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><FolderOpen size={18} /></span>
                            <span className="text-xs">Galeri</span>
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <button type="button" onClick={() => startDepoCamera("add", "photo")} className="flex items-center justify-center gap-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-95 transition-all px-3 py-3 text-sm">
                            <Camera size={18} /> Fotoğraf
                          </button>
                          <button type="button" onClick={() => startDepoCamera("add", "video")} className="flex items-center justify-center gap-2 rounded-full bg-purple-600 text-white font-semibold hover:bg-purple-700 active:scale-95 transition-all px-3 py-3 text-sm">
                            <Video size={18} /> Video
                          </button>
                          <button type="button" onClick={() => depoAddFileInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 active:scale-95 transition-all px-3 py-3 text-sm">
                            <FolderOpen size={18} /> Galeri
                          </button>
                        </div>
                      )}
                      {depoAddPendingFiles.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {depoAddPendingFiles.map((file, idx) => (
                            <div key={`${file.name}-${idx}`} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                              <ImageIcon size={14} className="text-gray-500" />
                              <span className="max-w-[180px] truncate">{file.name}</span>
                              <button onClick={() => setDepoAddPendingFiles((prev) => prev.filter((_, i) => i !== idx))} className="text-gray-500 hover:text-red-600">
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="px-7 pb-7 flex justify-end gap-3">
                  <button onClick={() => setDepoAddOpen(false)} className="px-8 py-3.5 rounded-full font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 text-base">İptal</button>
                  <button
                    onClick={handleDepoAdd}
                    disabled={depoSaving || !depoAddQty}
                    className="px-8 py-3.5 rounded-full text-white font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-base shadow-md"
                  >
                    {depoSaving ? "Kaydediliyor..." : "Ekle"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Withdraw material sub-modal */}
          {depoWdOpen && depoActiveWarehouse && (
            <div className="fixed inset-0 bg-black/60 z-[55] flex items-center justify-center p-4" onClick={() => setDepoWdOpen(false)}>
              <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-7 py-5 bg-orange-600 text-white">
                  <h3 className="font-semibold text-2xl">Malzeme Çıkart{depoActiveWarehouse ? ` – ${depoActiveWarehouse.name}` : ""}</h3>
                  <button onClick={() => setDepoWdOpen(false)} className="p-2 hover:bg-white/10 rounded-full">
                    <X size={24} />
                  </button>
                </div>
                <div className="p-7 space-y-5">
                  <div>
                    <label className="block text-base font-medium text-gray-700 mb-2">Malzeme Seç</label>
                    <select
                      value={depoWdMaterialId}
                      onChange={(e) => setDepoWdMaterialId(e.target.value)}
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 focus:outline-none text-base"
                    >
                      <option value="">-- Malzeme seçin --</option>
                      {depoActiveWarehouse.materials.filter(wm => wm.quantity > 0).map(wm => (
                        <option key={wm.id} value={wm.id}>
                          {wm.material.name} - Stok: {wm.quantity} {wm.material.unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  {depoWdMaterialId && (() => {
                    const sel = depoActiveWarehouse.materials.find(m => m.id === depoWdMaterialId);
                    if (!sel) return null;
                    return (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-orange-800 font-medium text-base">{sel.material.name}</span>
                          <span className="font-bold text-orange-700 text-base">Mevcut: {sel.quantity} {sel.material.unit}</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div>
                    <label className="block text-base font-medium text-gray-700 mb-2">Çıkartılacak Miktar</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={depoWdQty}
                      onChange={(e) => setDepoWdQty(e.target.value)}
                      placeholder="0"
                      className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 focus:outline-none text-base"
                    />
                  </div>
                </div>
                <div className="px-7 pb-7 flex justify-end gap-3">
                  <button onClick={() => setDepoWdOpen(false)} className="px-8 py-3.5 rounded-full font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 text-base">İptal</button>
                  <button
                    onClick={handleDepoWithdraw}
                    disabled={depoSaving || !depoWdMaterialId || !depoWdQty}
                    className="px-8 py-3.5 rounded-full text-white font-semibold bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-base shadow-md"
                  >
                    {depoSaving ? "İşleniyor..." : "Çıkart"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notice modal */}
          {depoNotice && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setDepoNotice(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className={`px-5 py-4 flex items-center gap-3 border-b ${
                  depoNotice.type === "error" ? "bg-red-50 border-red-200" :
                  depoNotice.type === "info" ? "bg-blue-50 border-blue-200" :
                  depoNotice.type === "success" ? "bg-green-50 border-green-200" :
                  "bg-amber-50 border-amber-200"
                }`}>
                  <h3 className={`font-semibold text-lg ${
                    depoNotice.type === "error" ? "text-red-800" :
                    depoNotice.type === "info" ? "text-blue-800" :
                    depoNotice.type === "success" ? "text-green-800" :
                    "text-amber-800"
                  }`}>{depoNotice.title}</h3>
                </div>
                <div className="px-5 py-5">
                  <p className="text-gray-700 whitespace-pre-line">{depoNotice.message}</p>
                </div>
                <div className="px-5 pb-5 flex justify-end">
                  <button
                    onClick={() => setDepoNotice(null)}
                    className={`px-5 py-2.5 rounded-lg text-white font-medium transition-colors ${
                      depoNotice.type === "error" ? "bg-red-600 hover:bg-red-700" :
                      depoNotice.type === "info" ? "bg-blue-600 hover:bg-blue-700" :
                      depoNotice.type === "success" ? "bg-green-600 hover:bg-green-700" :
                      "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    Tamam
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stock media sub-modal */}
          {depoSelectedStock && (
            <div className="fixed inset-0 bg-black/60 z-[55] flex items-center justify-center p-4" onClick={() => { setDepoSelectedStock(null); setDepoViewerMedia(null); }}>
              <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-7 py-5 bg-orange-600 text-white shrink-0">
                  <div>
                    <h3 className="font-semibold text-2xl">{depoSelectedStock.material.name}</h3>
                    <p className="text-sm opacity-80">{depoActiveWarehouse?.name} – Medya Arşivi</p>
                  </div>
                  <button onClick={() => { setDepoSelectedStock(null); setDepoViewerMedia(null); }} className="p-2 hover:bg-white/10 rounded-full">
                    <X size={24} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-7 space-y-5">
                  <div>
                    <label className="block text-base font-medium text-gray-700 mb-2">Yeni Fotoğraf / Video Ekle</label>
                    <input ref={depoStockFileInputRef} type="file" multiple accept="image/*,video/*" onChange={(e) => handleDepoMediaFiles("stock", e)} className="hidden" />
                    <input ref={depoStockPhotoCaptureRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleDepoMediaFiles("stock", e)} className="hidden" />
                    <input ref={depoStockVideoCaptureRef} type="file" accept="video/*" capture="environment" onChange={(e) => handleDepoMediaFiles("stock", e)} className="hidden" />
                    {isMobile ? (
                      /* MOBİL: medya pop-up / teslimat ile aynı modern butonlar (flex, tek satır) */
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startDepoCamera("stock", "photo")}
                          className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                          <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Camera size={18} /></span>
                          <span className="text-xs">Fotoğraf</span>
                        </button>
                        <button type="button" onClick={() => startDepoCamera("stock", "video")}
                          className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold shadow-md active:scale-95 transition-all">
                          <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><Video size={18} /></span>
                          <span className="text-xs">Video</span>
                        </button>
                        <button type="button" onClick={() => depoStockFileInputRef.current?.click()}
                          className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-[#c0392b] text-white font-semibold shadow-md active:scale-95 transition-all">
                          <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><FolderOpen size={18} /></span>
                          <span className="text-xs">Galeri</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => startDepoCamera("stock", "photo")} className="flex items-center justify-center gap-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-95 transition-all px-3 py-4 text-base">
                          <Camera size={20} /> Fotoğraf
                        </button>
                        <button type="button" onClick={() => startDepoCamera("stock", "video")} className="flex items-center justify-center gap-2 rounded-full bg-purple-600 text-white font-semibold hover:bg-purple-700 active:scale-95 transition-all px-3 py-4 text-base">
                          <Video size={20} /> Video
                        </button>
                        <button type="button" onClick={() => depoStockFileInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 active:scale-95 transition-all px-3 py-4 text-base">
                          <FolderOpen size={20} /> Galeri
                        </button>
                      </div>
                    )}
                    {depoStockPendingFiles.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {depoStockPendingFiles.map((file, idx) => (
                          <div key={`${file.name}-${idx}`} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                            <ImageIcon size={14} className="text-gray-500" />
                            <span className="max-w-[180px] truncate">{file.name}</span>
                            <button onClick={() => setDepoStockPendingFiles((prev) => prev.filter((_, i) => i !== idx))} className="text-gray-500 hover:text-red-600">
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
                      <span className="text-sm text-gray-500">{depoSelectedStock.media?.length || 0} medya</span>
                    </div>
                    {!depoSelectedStock.media || depoSelectedStock.media.length === 0 ? (
                      <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400">
                        <ImageIcon className="mx-auto mb-2 text-gray-300" size={36} />
                        Henüz fotoğraf veya video yok
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {depoSelectedStock.media.map((media, idx) => (
                          <button
                            key={media.id}
                            type="button"
                            onClick={() => setDepoViewerMedia({ list: depoSelectedStock.media, index: idx })}
                            className="aspect-video bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center w-full"
                          >
                            {media.mimeType.startsWith("image/") ? (
                              <img src={depoMediaUrl(media.id)} alt={media.fileName || "Depo medyası"} className="w-full h-full object-cover" />
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
                <div className="px-7 pb-7 flex justify-end gap-3 shrink-0 border-t border-gray-100 pt-5">
                  <button onClick={() => { setDepoSelectedStock(null); setDepoViewerMedia(null); }} className="px-8 py-3.5 rounded-full font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 text-base">Kapat</button>
                  <button
                    onClick={handleUploadDepoSelectedStockMedia}
                    disabled={depoSaving || depoStockPendingFiles.length === 0}
                    className="px-8 py-3.5 rounded-full text-white font-semibold bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-base shadow-md"
                  >
                    {depoSaving ? "Yükleniyor..." : "Medya Yükle"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Kamera modal */}
          {depoCameraActive && (
            <div className="fixed inset-0 z-[80] bg-black flex flex-col select-none">
              <div className="flex items-center justify-between px-4 py-2 bg-black/80 flex-shrink-0 modal-safe-top">
                <span className="text-white text-sm font-medium">
                  {depoCameraType === "photo" ? "Fotoğraf Çek" : depoIsRecording ? "Kayıt yapılıyor..." : "Video Çek"}
                </span>
                <button onClick={closeDepoCamera} className="text-white p-1.5 hover:bg-white/10 rounded-lg">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <video
                  ref={depoCameraVideoRef}
                  autoPlay
                  playsInline
                  muted={depoCameraType === "photo"}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="flex items-center justify-center py-6 bg-black/80">
                {depoCameraType === "photo" ? (
                  <button
                    onClick={captureDepoPhoto}
                    className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-all active:scale-90"
                  />
                ) : !depoIsRecording ? (
                  <button
                    onClick={startDepoVideoRecording}
                    className="w-16 h-16 rounded-full border-4 border-white bg-red-500 hover:bg-red-600 transition-all active:scale-90"
                  />
                ) : (
                  <button
                    onClick={stopDepoVideoRecording}
                    className="w-16 h-16 rounded-full border-4 border-white bg-red-500 flex items-center justify-center active:scale-90"
                  >
                    <div className="w-6 h-6 bg-white rounded-sm" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Medya görüntüleyici */}
          <MediaViewer
            open={depoViewerMedia !== null && (depoViewerMedia?.list?.length ?? 0) > 0}
            items={(depoViewerMedia?.list ?? []).map((m) => ({
              id: m.id,
              fileName: m.fileName || "Depo Medyası",
              fileUrl: depoMediaUrl(m.id),
              mimeType: m.mimeType,
            }))}
            index={depoViewerMedia?.index ?? 0}
            onIndexChange={(i) => setDepoViewerMedia((v) => v ? { ...v, index: i } : v)}
            onClose={() => setDepoViewerMedia(null)}
            onDelete={(item) => handleDeleteDepoStockMedia(item.id)}
          />
        </div>
      )}

      {/* Arıza Takip Modal */}
      {ariszaOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
          {ariszaModalMode === "menu" ? (
            <div className="bg-white flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0 modal-safe-top">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-amber-300" size={22} />
                  <div>
                    <h2 className="font-bold text-lg">Arıza Takip</h2>
                    <p className="text-xs opacity-75">Arıza işlemi seçin</p>
                  </div>
                </div>
                <button onClick={() => setAriszaOpen(false)} className="p-1.5 hover:bg-white/20 rounded">
                  <X size={22} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {isMobile ? (
                  /* MOBİL: kompakt yatay satırlar (büyük kare kartlar yerine) */
                  <div className="space-y-3 max-w-md mx-auto">
                    <button onClick={() => setAriszaModalMode("new")}
                      className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-4 text-left active:scale-[0.98] transition-all">
                      <span className="shrink-0 w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center"><Plus size={26} className="text-amber-500" /></span>
                      <div className="min-w-0">
                        <p className="font-bold text-base text-gray-800">Arıza Ekle</p>
                        <p className="text-xs text-gray-400 mt-0.5">Yeni arıza kaydı oluşturun</p>
                      </div>
                    </button>
                    <button onClick={() => setAriszaModalMode("open")}
                      className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-4 text-left active:scale-[0.98] transition-all">
                      <span className="shrink-0 w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center"><AlertTriangle size={26} className="text-orange-500" /></span>
                      <div className="min-w-0">
                        <p className="font-bold text-base text-gray-800">Açık Arızalar</p>
                        <p className="text-xs text-gray-400 mt-0.5">Devam eden arızaları görüntüleyin</p>
                      </div>
                    </button>
                    <button onClick={() => setAriszaModalMode("resolved")}
                      className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-4 text-left active:scale-[0.98] transition-all">
                      <span className="shrink-0 w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center"><CheckCircle size={26} className="text-green-600" /></span>
                      <div className="min-w-0">
                        <p className="font-bold text-base text-gray-800">Çözülen Arızalar</p>
                        <p className="text-xs text-gray-400 mt-0.5">Tamamlanan arızaları görüntüleyin</p>
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
                    <button
                      onClick={() => setAriszaModalMode("new")}
                      className="bg-white border-2 border-gray-200 hover:border-amber-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center"
                    >
                      <Plus size={56} className="text-amber-500 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Arıza Ekle</p>
                      <p className="text-sm text-gray-400 mt-2">Yeni arıza kaydı oluşturun</p>
                    </button>
                    <button
                      onClick={() => setAriszaModalMode("open")}
                      className="bg-white border-2 border-gray-200 hover:border-orange-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center"
                    >
                      <AlertTriangle size={56} className="text-orange-500 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Açık Arızalar</p>
                      <p className="text-sm text-gray-400 mt-2">Devam eden arızaları görüntüleyin</p>
                    </button>
                    <button
                      onClick={() => setAriszaModalMode("resolved")}
                      className="bg-white border-2 border-gray-200 hover:border-green-600 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center"
                    >
                      <CheckCircle size={56} className="text-green-600 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Çözülen Arızalar</p>
                      <p className="text-sm text-gray-400 mt-2">Tamamlanan arızaları görüntüleyin</p>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white flex-1 flex flex-col overflow-hidden">
              {/* Geri + kapat header'ı (status bar güvenli). Tracker kendi header'ını gizler (hideHeader). */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0 modal-safe-top">
                <div className="flex items-center gap-3">
                  <button onClick={() => setAriszaModalMode("menu")} className="p-1 hover:bg-white/20 rounded" aria-label="Geri">
                    <ArrowLeft size={20} />
                  </button>
                  <AlertTriangle className="text-amber-300" size={22} />
                  <div>
                    <h2 className="font-bold text-lg">Arıza Takip</h2>
                    <p className="text-xs opacity-75">
                      {ariszaModalMode === "new" ? "Yeni arıza" : ariszaModalMode === "open" ? "Açık arızalar" : ariszaModalMode === "resolved" ? "Çözülen arızalar" : "Tüm arızalar"}
                    </p>
                  </div>
                </div>
                <button onClick={() => setAriszaOpen(false)} className="p-1.5 hover:bg-white/20 rounded" aria-label="Kapat">
                  <X size={22} />
                </button>
              </div>
              <AriszaTracker
                key={ariszaModalMode}
                mode="modal"
                onClose={() => setAriszaOpen(false)}
                hideHeader
                initialAction={ariszaModalMode === "new" ? "new" : undefined}
                initialFilter={ariszaModalMode === "resolved" ? "RESOLVED" : ariszaModalMode === "open" ? "OPEN" : "ALL"}
              />
            </div>
          )}
        </div>
      )}

      {/* Şantiye Arıza Modal (siteId-scoped) */}
      {santiyeAriszaOpen && (() => {
        const selectedSite = assignedSites.find((s) => s.id === santiyeAriszaSiteId) || null;

        const closeAll = () => {
          setSantiyeAriszaOpen(false);
          setSantiyeAriszaSiteId("");
          setSantiyeAriszaMode("siteSelect");
        };

        // Ortak header bileşeni
        const Header = ({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) => (
          <div className="flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0 modal-safe-top">
            <div className="flex items-center gap-3">
              {onBack && (
                <button onClick={onBack} className="p-1 hover:bg-white/20 rounded">
                  <ArrowLeft size={20} />
                </button>
              )}
              <AlertTriangle className="text-rose-300" size={22} />
              <div>
                <h2 className="font-bold text-lg">{title}</h2>
                <p className="text-xs opacity-75">{subtitle}</p>
              </div>
            </div>
            <button onClick={closeAll} className="p-1.5 hover:bg-white/20 rounded">
              <X size={22} />
            </button>
          </div>
        );

        // ADIM 1: Şantiye seçimi
        if (santiyeAriszaMode === "siteSelect") return (
          <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
            <div className="bg-white flex-1 flex flex-col overflow-hidden">
              <Header title="Şantiye Arıza" subtitle="Şantiye seçin" />
              <div className="flex-1 overflow-y-auto p-6">
                {assignedSites.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Building2 className="mx-auto mb-3 text-gray-300" size={48} />
                    <p>Henüz size atanmış şantiye yok</p>
                    <p className="text-sm mt-1">Yöneticinizden şantiye ataması isteyin</p>
                  </div>
                ) : (
                  isMobile ? (
                    /* MOBİL: kompakt yatay satırlar */
                    <div className="space-y-3 max-w-md mx-auto">
                      {assignedSites.map((site) => (
                        <button
                          key={site.id}
                          onClick={() => { setSantiyeAriszaSiteId(site.id); setSantiyeAriszaMode("menu"); }}
                          className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-4 text-left active:scale-[0.98] transition-all"
                        >
                          <span className="shrink-0 w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center"><Building2 size={26} className="text-rose-600" /></span>
                          <p className="font-bold text-base text-gray-800 min-w-0 truncate">{site.name}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-5 max-w-2xl mx-auto">
                      {assignedSites.map((site) => (
                        <button
                          key={site.id}
                          onClick={() => { setSantiyeAriszaSiteId(site.id); setSantiyeAriszaMode("menu"); }}
                          className="bg-white border-2 border-gray-200 hover:border-rose-600 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center"
                        >
                          <Building2 size={56} className="text-rose-600 mb-4" />
                          <p className="font-bold text-xl text-gray-800">{site.name}</p>
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        );

        // ADIM 2: İşlem menüsü
        if (santiyeAriszaMode === "menu" && selectedSite) return (
          <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
            <div className="bg-white flex-1 flex flex-col overflow-hidden">
              <Header
                title={`Şantiye Arıza — ${selectedSite.name}`}
                subtitle="İşlem seçin"
                onBack={() => { setSantiyeAriszaSiteId(""); setSantiyeAriszaMode("siteSelect"); }}
              />
              <div className="flex-1 overflow-y-auto p-6">
                {isMobile ? (
                  /* MOBİL: kompakt yatay satırlar */
                  <div className="space-y-3 max-w-md mx-auto">
                    <button onClick={() => { setSantiyeAriszaAction("new"); setSantiyeAriszaMode("tracker"); }}
                      className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-4 text-left active:scale-[0.98] transition-all">
                      <span className="shrink-0 w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center"><Plus size={26} className="text-amber-500" /></span>
                      <div className="min-w-0">
                        <p className="font-bold text-base text-gray-800">Yeni Arıza</p>
                        <p className="text-xs text-gray-400 mt-0.5">Yeni arıza kaydı oluşturun</p>
                      </div>
                    </button>
                    <button onClick={() => { setSantiyeAriszaAction("open"); setSantiyeAriszaMode("tracker"); }}
                      className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-4 text-left active:scale-[0.98] transition-all">
                      <span className="shrink-0 w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center"><AlertTriangle size={26} className="text-orange-500" /></span>
                      <div className="min-w-0">
                        <p className="font-bold text-base text-gray-800">Açık Arızalar</p>
                        <p className="text-xs text-gray-400 mt-0.5">Devam eden arızaları görüntüleyin</p>
                      </div>
                    </button>
                    <button onClick={() => { setSantiyeAriszaAction("resolved"); setSantiyeAriszaMode("tracker"); }}
                      className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl p-4 text-left active:scale-[0.98] transition-all">
                      <span className="shrink-0 w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center"><CheckCircle size={26} className="text-green-600" /></span>
                      <div className="min-w-0">
                        <p className="font-bold text-base text-gray-800">Çözülen Arızalar</p>
                        <p className="text-xs text-gray-400 mt-0.5">Tamamlanan arızaları görüntüleyin</p>
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
                    <button
                      onClick={() => { setSantiyeAriszaAction("new"); setSantiyeAriszaMode("tracker"); }}
                      className="bg-white border-2 border-gray-200 hover:border-amber-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center"
                    >
                      <Plus size={56} className="text-amber-500 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Yeni Arıza</p>
                      <p className="text-sm text-gray-400 mt-2">Yeni arıza kaydı oluşturun</p>
                    </button>
                    <button
                      onClick={() => { setSantiyeAriszaAction("open"); setSantiyeAriszaMode("tracker"); }}
                      className="bg-white border-2 border-gray-200 hover:border-orange-500 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center"
                    >
                      <AlertTriangle size={56} className="text-orange-500 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Açık Arızalar</p>
                      <p className="text-sm text-gray-400 mt-2">Devam eden arızaları görüntüleyin</p>
                    </button>
                    <button
                      onClick={() => { setSantiyeAriszaAction("resolved"); setSantiyeAriszaMode("tracker"); }}
                      className="bg-white border-2 border-gray-200 hover:border-green-600 rounded-2xl p-10 text-center transition-all hover:shadow-lg aspect-square flex flex-col items-center justify-center"
                    >
                      <CheckCircle size={56} className="text-green-600 mb-4" />
                      <p className="font-bold text-xl text-gray-800">Çözülen Arızalar</p>
                      <p className="text-sm text-gray-400 mt-2">Tamamlanan arızaları görüntüleyin</p>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

        // ADIM 3: Tracker (filtrelenmiş)
        if (santiyeAriszaMode === "tracker" && selectedSite) return (
          <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
            <div className="bg-white flex-1 flex flex-col overflow-hidden">
              <Header
                title={`Şantiye Arıza — ${selectedSite.name}`}
                subtitle={
                  santiyeAriszaAction === "new" ? "Yeni arıza" :
                  santiyeAriszaAction === "open" ? "Açık arızalar" : "Çözülen arızalar"
                }
                onBack={() => setSantiyeAriszaMode("menu")}
              />
              <div className="flex-1 overflow-hidden">
                <AriszaTracker
                  key={`${selectedSite.id}-${santiyeAriszaAction}`}
                  mode="modal"
                  onClose={closeAll}
                  scopedSiteId={selectedSite.id}
                  scopedSiteName={selectedSite.name}
                  kind="SANTIYE"
                  hideHeader
                  initialAction={santiyeAriszaAction === "new" ? "new" : undefined}
                  initialFilter={santiyeAriszaAction === "resolved" ? "RESOLVED" : santiyeAriszaAction === "open" ? "OPEN" : "ALL"}
                />
              </div>
            </div>
          </div>
        );

        return null;
      })()}
    </div>
  );
}
