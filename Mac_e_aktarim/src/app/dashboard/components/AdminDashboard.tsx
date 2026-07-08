"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  Coffee,
  DoorOpen,
  Users,
  Wifi,
  WifiOff,
  HardHat,
  Hammer,
  Warehouse,
  Truck,
  Wrench,
  X,
  ExternalLink,
  Camera,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Building2,
  Activity,
  TrendingUp,
} from "lucide-react";
import MediaViewer, { type MediaItem } from "@/app/dashboard/satis/_components/MediaViewer";
import { requestPageFullscreen } from "@/app/dashboard/satis/_components/openFullscreen";
import { useIsTablet } from "@/app/dashboard/layout";
import { useDevice } from "@/hooks/useDevice";

/* ============================================================
   TİPLER
   ============================================================ */

interface RoomStatus {
  key: string;
  active: boolean;
  type: string;
  baslangic: string;
}
interface Summary {
  totalUsed?: number;
  totalRevenue?: number;
  totalHours?: number;
  kabinUsedToday?: number;
  toplantiUsedToday?: number;
}
interface StudyankaStatus {
  rooms: RoomStatus[];
  summary: Summary;
  online: boolean;
  syncedAt: string | null;
}

interface PersonnelRecord {
  id: string;
  siteId: string;
  siteName: string;
  blockId: string | null;
  blockName: string;
  workName: string;
  floorName: string | null;
  constructionType: string;
  personnelName: string;
  company: string | null;
  workDuration: string;
}
interface PersonnelDay {
  date: string;
  total: number;
  uniqueCount: number;
  records: PersonnelRecord[];
}

interface WorkPersonnelEntry {
  id: string;
  date: string;
  personnelName: string;
  company: string | null;
  workDuration: string;
  workName?: string;
}
interface WorkPhoto {
  id: string;
  url: string;
  mimeType: string;
  fileName: string | null;
  createdAt: string;
  workName?: string;
}
interface WorkAgg {
  key: string;
  siteId: string;
  siteName: string;
  workName: string;
  workNames?: string[];
  workIds?: string[];
  contextName: string;
  blockName: string;
  blockId?: string;
  workId?: string;
  constructionType: string | null;
  personnelCount: number;
  personnelEntries: WorkPersonnelEntry[];
  photoCount: number;
  photos: WorkPhoto[];
  lastActivity: string;
  daireNames?: string[];
}
interface RecentWorksResp {
  total: number;
  withPhotoCount: number;
  personnelNoPhotoCount: number;
  photoWithPersonnelCount: number;
  works: WorkAgg[];
  categories: {
    photos: WorkAgg[];
    personnelNoPhoto: WorkAgg[];
    personnelWithPhoto: WorkAgg[];
    photosOnly: WorkAgg[];
  };
}

interface WarehouseMaterial {
  material: { id: string; name: string; unit: string };
  quantity: number;
  unit?: string;
  minStock?: number | null;
  notes?: string | null;
  media?: { id: string; mimeType: string; fileName?: string | null }[];
}
interface WarehouseItem {
  id: string;
  name: string;
  sortOrder: number;
  materials: WarehouseMaterial[];
}

interface TeslimatItemMedia {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
}
interface TeslimatItem {
  id: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  media?: TeslimatItemMedia[];
}
interface TeslimatRecord {
  id: string;
  irsaliyeNo: string;
  supplier: string | null;
  date: string;
  receivedBy: string;
  notes: string | null;
  site: { id: string; name: string } | null;
  items: TeslimatItem[];
}

interface ArizaRecord {
  id: string;
  status: "OPEN" | "RESOLVED";
  customSiteName: string | null;
  site: { id: string; name: string } | null;
  description: string;
  startDate: string;
  endDate: string | null;
  assignedPersonnel: string | null;
  createdByName: string | null;
  block: { name: string } | null;
  floor: { name: string } | null;
  unit: { name: string } | null;
  media?: { id: string; fileName: string; mimeType: string }[];
}

interface SiteProgress {
  id: string;
  name: string;
  status: string;
  blockCount: number;
  completed: number;
  total: number;
  percent: number;
}

/* ============================================================
   YARDIMCI
   ============================================================ */

const TR_DATE = (iso: string) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const TR_DATE_SHORT = (iso: string) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
  });

const dayLabel = (iso: string, idx: number) => {
  if (idx === 0) return `Bugün — ${TR_DATE(iso)}`;
  if (idx === 1) return `Dün — ${TR_DATE(iso)}`;
  if (idx === 2) return `Önceki Gün — ${TR_DATE(iso)}`;
  return TR_DATE(iso);
};

const MIN_PERSONNEL_DATE = "2026-01-01";

const getTurkeyTodayIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const shiftIsoDate = (iso: string, amount: number) => {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

const clampPersonnelDate = (iso: string, todayIso: string) => {
  if (iso < MIN_PERSONNEL_DATE) return MIN_PERSONNEL_DATE;
  if (iso > todayIso) return todayIso;
  return iso;
};

const SITE_COLORS = [
  "text-amber-600",
  "text-blue-900",
  "text-emerald-600",
  "text-rose-600",
  "text-purple-700",
  "text-teal-600",
  "text-orange-600",
  "text-cyan-700",
];
function siteColor(siteId: string) {
  let h = 0;
  for (let i = 0; i < siteId.length; i++) h = (h * 31 + siteId.charCodeAt(i)) & 0xffff;
  return SITE_COLORS[h % SITE_COLORS.length];
}

const emptyPersonnelDay = (date: string): PersonnelDay => ({
  date,
  total: 0,
  uniqueCount: 0,
  records: [],
});

/* ============================================================
   SCALE-TO-FIT SARMALAYICI
   PC'de panoyu — taşma/kaydırma olmadan — tek ekrana sığdırır.
   Sabit bir "tasarım yüksekliği" üzerinden transform: scale() uygular;
   genişlik akışkan kalır (kolonlar zaten esnek). Büyük monitörde
   aşırı büyümeyi maxScale sınırlar + dikey ortalar.
   SADECE masaüstünde kullanılır — mobil ve iPad'e dokunmaz.
   ============================================================ */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function FitToScreen({
  designHeight,
  className,
  children,
}: {
  designHeight: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Gerçek kullanılabilir yükseklik: elemanın üstünden viewport altına kadar
      // (sihirli "128px" tahmini yok → alt beyaz bant kalmaz)
      const top = el.getBoundingClientRect().top;
      const w = el.clientWidth;
      const h = Math.max(0, window.innerHeight - top - 3);
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const ready = box.w > 0 && box.h > 0;
  // Cap yok → ölçek mevcut alanı tam doldurur (taşma da boşluk da olmaz)
  const scale = ready ? box.h / designHeight : 1;
  const innerW = ready ? box.w / scale : 0;

  return (
    <div
      ref={ref}
      className={className}
      style={{ height: ready ? box.h : "calc(100dvh - 132px)", overflow: "hidden" }}
    >
      {ready && (
        <div
          style={{
            width: innerW,
            height: designHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ANA DASHBOARD
   ============================================================ */

export default function AdminDashboard({ firstName }: { firstName?: string }) {
  void firstName;
  const isTablet = useIsTablet();
  // StudyAnka
  const [study, setStudy] = useState<StudyankaStatus | null>(null);
  const [studyLoading, setStudyLoading] = useState(true);
  const [studyAccess, setStudyAccess] = useState(true);

  // Personel (3 gün)
  const [personnelDays, setPersonnelDays] = useState<PersonnelDay[]>([]);
  // Yapılan işler
  const [worksData, setWorksData] = useState<RecentWorksResp | null>(null);
  // Bugünün işleri (birleşik kart için)
  const [todayWorks, setTodayWorks] = useState<RecentWorksResp | null>(null);
  // Depo
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  // Teslimat
  const [teslimatlar, setTeslimatlar] = useState<TeslimatRecord[]>([]);
  // Arıza
  const [arizalar, setArizalar] = useState<ArizaRecord[]>([]);
  const [sitesProgress, setSitesProgress] = useState<SiteProgress[]>([]);
  const [sitesProgressLoading, setSitesProgressLoading] = useState(true);
  // Satis summary
  const [salesSummary, setSalesSummary] = useState<{
    totals: { totalUnits: number; totalSold: number; totalReserved: number; totalAvailable: number; totalLandOwner?: number };
    blocks: { kind: "project" | "site"; ownerName: string; blockName: string; total: number; sold: number; reserved: number; available: number }[];
  } | null>(null);

  // Modal state
  const [openModal, setOpenModal] = useState<
    null | "personnel" | "works" | "worksAndPersonnel" | "depo" | "teslimat" | "ariza"
  >(null);
  const [autoOpenDate, setAutoOpenDate] = useState<string | null>(null);
  useBodyScrollLock(!!openModal);

  // Auto-open works modal when returnDate param is present (back-navigation from sites page)
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const returnDate = searchParams.get("returnDate");
    if (returnDate) {
      setAutoOpenDate(returnDate);
      setOpenModal("worksAndPersonnel");
      router.replace("/dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // StudyAnka polling
  const fetchStudy = useCallback(async () => {
    try {
      const res = await fetch("/api/studyanka/status");
      if (res.status === 403) {
        setStudyAccess(false);
        return;
      }
      if (!res.ok) return;
      const json = await res.json();
      setStudy({
        rooms: json.rooms || [],
        summary: json.summary || {},
        online: json.online || false,
        syncedAt: json.syncedAt || null,
      });
    } catch {
      /* yoksay */
    } finally {
      setStudyLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudy();
    const i = setInterval(fetchStudy, 5000);
    return () => clearInterval(i);
  }, [fetchStudy]);

  // Diğer veriler — açılışta + 60sn'de bir
  const fetchAll = useCallback(async () => {
    try {
      const todayIso = getTurkeyTodayIso();
      const [p, w, wToday, d, t, a, s, ss] = await Promise.all([
        fetch("/api/dashboard/recent-personnel?days=3"),
        fetch("/api/dashboard/recent-works?days=3"),
        fetch(`/api/dashboard/recent-works?date=${todayIso}`),
        fetch("/api/warehouses"),
        fetch("/api/teslimat"),
        fetch("/api/ariza?status=ALL"),
        fetch("/api/dashboard/sites-progress"),
        fetch("/api/dashboard/sales-summary"),
      ]);
      if (p.ok) {
        const j = await p.json();
        setPersonnelDays(j.days || []);
      }
      if (w.ok) setWorksData(await w.json());
      if (wToday.ok) setTodayWorks(await wToday.json());
      if (d.ok) {
        const j = await d.json();
        setWarehouses(j.warehouses || []);
      }
      if (t.ok) {
        const j = await t.json();
        setTeslimatlar(j.teslimatlar || []);
      }
      if (a.ok) {
        const j = await a.json();
        setArizalar(j.arizalar || []);
      }
      if (s.ok) {
        const j = await s.json();
        setSitesProgress(j.sites || []);
      }
      if (ss.ok) {
        const j = await ss.json();
        setSalesSummary({ totals: j.totals, blocks: j.blocks });
      }
    } catch {
      /* yoksay */
    } finally {
      setSitesProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const i = setInterval(fetchAll, 60000);
    return () => clearInterval(i);
  }, [fetchAll]);

  // Hesaplamalar
  const activeCount = study?.rooms.filter((r) => r.active).length ?? 0;
  const totalRooms = study?.rooms.length ?? 0;
  const online = study?.online ?? false;
  const todayKabinCount = study?.summary.kabinUsedToday ?? 0;
  const todayToplantiCount = study?.summary.toplantiUsedToday ?? 0;

  const todayPersonnel = personnelDays[0]?.uniqueCount ?? 0;

  // Bugünün birleşik metrikleri (Yapılan İşler ve Personel kartı)
  const todayWorksCount = todayWorks?.total ?? 0;
  const todayPersonnelUnique = useMemo(() => {
    if (!todayWorks?.works) return 0;
    const names = new Set<string>();
    for (const w of todayWorks.works) {
      for (const p of w.personnelEntries) {
        const k = (p.personnelName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
        if (k) names.add(k);
      }
    }
    return names.size;
  }, [todayWorks]);
  const todayActiveSitesCount = useMemo(() => {
    if (!todayWorks?.works) return 0;
    return new Set(todayWorks.works.map((w) => w.siteId)).size;
  }, [todayWorks]);

  const last5Teslimat = teslimatlar.slice(0, 5);
  const last5Ariza = arizalar.slice(0, 5);

  // Son 7 gün (bugün + önceki 6 gün) içinde yapılan teslimat sayısı
  const last7TeslimatCount = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime() - 6 * 24 * 60 * 60 * 1000;
    return teslimatlar.filter((t) => {
      const d = new Date(t.date).getTime();
      return !Number.isNaN(d) && d >= startMs;
    }).length;
  })();

  return (
    <div>
      {/* ====== MASAÜSTÜ / TABLET YATAY DÜZEN (lg+, iPad Air 4 landscape) ====== */}
      {(() => {
        // 3 kolon — tablet ve PC aynı içeriği paylaşır (fonksiyon/link korunur)
        const columns = (
          <>
            {/* Sol sütun: Günlük Çalışma Özeti — tam yükseklik */}
            <div className="flex-1 min-w-0 min-h-0">
              <WorksAndPersonnelSummaryCard
                worksCount={todayWorksCount}
                personnelCount={todayPersonnelUnique}
                siteCount={todayActiveSitesCount}
                works={todayWorks?.works ?? []}
                onClick={() => setOpenModal("worksAndPersonnel")}
                fullHeight
              />
            </div>

            {/* Orta sütun: Şantiyeler (%75) + Teslimat (%25) */}
            <div className={`flex-1 min-w-0 flex flex-col gap-2`}>
              <div className="flex-[2.4] min-h-0">
                <SitesProgressCard sites={sitesProgress} loading={sitesProgressLoading} />
              </div>
              <div className="flex-1 min-h-0">
                <SummaryCard
                  gradient="from-rose-500 to-red-700"
                  icon={<Truck size={26} />}
                  title="Teslimat"
                  subtitle="Son teslimatlar"
                  badge={`Son 7 gün: ${last7TeslimatCount}`}
                  onClick={() => setOpenModal("teslimat")}
                  mainValue={String(teslimatlar.length)}
                  mainLabel="toplam"
                  extras={last5Teslimat.slice(0, 2).map((t) => ({
                    label: TR_DATE_SHORT(t.date),
                    value: t.supplier || t.irsaliyeNo || "—",
                  }))}
                  inlineLabel
                  fullHeight
                />
              </div>
            </div>

            {/* Sağ sütun: Depo + Arıza + Satış (3 eşit kart, scroll'suz sığar) */}
            <div className={`flex-1 min-w-0 flex flex-col gap-2`}>
              <div className="flex-1 min-h-0">
                <SummaryCard
                  gradient="from-indigo-500 to-purple-700"
                  icon={<Warehouse size={26} />}
                  title="Depo"
                  subtitle="Kalem sayıları"
                  onClick={() => setOpenModal("depo")}
                  mainValue={String(warehouses.reduce((s, w) => s + w.materials.length, 0))}
                  mainLabel="toplam kalem"
                  extras={warehouses.slice(0, 2).map((w) => ({
                    label: w.name,
                    value: String(w.materials.length),
                  }))}
                  fullHeight
                />
              </div>
              <div className="flex-1 min-h-0">
                <SummaryCard
                  gradient="from-yellow-500 to-orange-600"
                  icon={<Wrench size={26} />}
                  title="Arıza Takip"
                  subtitle="Son 5 arıza"
                  onClick={() => setOpenModal("ariza")}
                  mainValue={String(arizalar.filter((a) => a.status === "OPEN").length)}
                  mainLabel="açık arıza"
                  extras={[
                    {
                      label: "Çözülen",
                      value: String(arizalar.filter((a) => a.status === "RESOLVED").length),
                    },
                    { label: "Toplam", value: String(arizalar.length) },
                  ]}
                  fullHeight
                />
              </div>
              <div className="flex-1 min-h-0">
                <SummaryCard
                  gradient="from-teal-500 to-green-600"
                  icon={<TrendingUp size={26} />}
                  title="Satıştaki Projeler"
                  subtitle="Blok bazlı durum"
                  onClick={() => router.push("/dashboard/satis?from=dashboard")}
                  mainValue={`${salesSummary?.totals.totalAvailable ?? 0}/${salesSummary?.totals.totalUnits ?? 0}`}
                  mainLabel="boş"
                  extras={(salesSummary?.blocks ?? []).slice(0, 2).map((b) => ({
                    label: `${b.ownerName} · ${b.blockName}`,
                    value: `${b.available}/${b.total} boş`,
                  }))}
                  fullHeight
                  compact
                />
              </div>
            </div>
          </>
        );

        // iPad / tablet: ESKİSİYLE BİREBİR AYNI (dokunulmadı)
        if (isTablet) {
          return (
            <div className="hidden lg:flex items-stretch gap-2 h-[calc(100dvh-80px)]">
              {columns}
            </div>
          );
        }

        // PC / masaüstü: scale-to-fit — kenarlara/alta kadar doldurur, taşma yok
        // (negatif margin ile <main> dolgusunu iptal eder → beyaz kenarlar kapanır)
        return (
          <FitToScreen designHeight={980} className="hidden lg:block -mx-7 -mt-6 -mb-8">
            <div className="flex items-stretch gap-2 h-full">{columns}</div>
          </FitToScreen>
        );
      })()}

      {/* ====== MOBİL / KÜÇÜK EKRAN DÜZEN (< lg) ====== */}
      <div className="lg:hidden p-3 space-y-3">
        {/* 1) Günlük Çalışma Özeti — tam ekran yükseklik + iç scroll, mat lacivert */}
        <WorksAndPersonnelSummaryCard
          mobile={!isTablet}
          tall={!isTablet}
          worksCount={todayWorksCount}
          personnelCount={todayPersonnelUnique}
          siteCount={todayActiveSitesCount}
          works={todayWorks?.works ?? []}
          onClick={() => setOpenModal("worksAndPersonnel")}
        />

        {/* 2) Şantiyeler — mobilde lacivert arka plan + alt alta liste */}
        <SitesProgressSection sites={sitesProgress} loading={sitesProgressLoading} mobile={!isTablet} />

        {/* 3-6) Satış · Teslimat · Depo · Arıza (kompakt, mat renkler) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 3) Satıştaki Projeler */}
          <SummaryCard
            mobile={!isTablet}
            gradient={!isTablet ? "from-teal-700 to-emerald-800" : "from-teal-500 to-green-600"}
            icon={<TrendingUp size={22} />}
            title="Satıştaki Projeler"
            subtitle="Blok bazlı durum"
            onClick={() => router.push("/dashboard/satis?from=dashboard")}
            mainValue={`${salesSummary?.totals.totalAvailable ?? 0}/${salesSummary?.totals.totalUnits ?? 0}`}
            mainLabel="boş"
            extras={(salesSummary?.blocks ?? []).slice(0, 3).map((b) => ({
              label: `${b.ownerName} · ${b.blockName}`,
              value: `${b.available}/${b.total} boş`,
            }))}
          />

          {/* 4) Teslimat */}
          <SummaryCard
            mobile={!isTablet}
            gradient={!isTablet ? "from-rose-700 to-red-900" : "from-rose-500 to-red-700"}
            icon={<Truck size={22} />}
            title="Teslimat"
            subtitle="Son 5 teslimat"
            badge={`Son 7 gün: ${last7TeslimatCount}`}
            onClick={() => setOpenModal("teslimat")}
            mainValue={String(teslimatlar.length)}
            mainLabel="toplam"
            extras={last5Teslimat.slice(0, 3).map((t) => ({
              label: TR_DATE_SHORT(t.date),
              value: t.supplier || t.irsaliyeNo || "—",
            }))}
          />

          {/* 5) Depo */}
          <SummaryCard
            mobile={!isTablet}
            gradient={!isTablet ? "from-indigo-700 to-purple-900" : "from-indigo-500 to-purple-700"}
            icon={<Warehouse size={22} />}
            title="Depo"
            subtitle="Kalem sayıları"
            onClick={() => setOpenModal("depo")}
            mainValue={String(warehouses.reduce((s, w) => s + w.materials.length, 0))}
            mainLabel="toplam kalem"
            extras={warehouses.slice(0, 3).map((w) => ({
              label: w.name,
              value: String(w.materials.length),
            }))}
          />

          {/* 6) Arıza Takip */}
          <SummaryCard
            mobile={!isTablet}
            gradient={!isTablet ? "from-amber-600 to-orange-800" : "from-yellow-500 to-orange-600"}
            icon={<Wrench size={22} />}
            title="Arıza Takip"
            subtitle="Son 5 arıza"
            onClick={() => setOpenModal("ariza")}
            mainValue={String(arizalar.filter((a) => a.status === "OPEN").length)}
            mainLabel="açık arıza"
            extras={[
              {
                label: "Çözülen",
                value: String(arizalar.filter((a) => a.status === "RESOLVED").length),
              },
              { label: "Toplam", value: String(arizalar.length) },
            ]}
          />
        </div>
      </div>

      {/* Modal'lar */}
      {openModal === "personnel" && (
        <PersonnelModal days={personnelDays} onClose={() => setOpenModal(null)} />
      )}
      {openModal === "works" && (
        <WorksModal data={worksData} onClose={() => setOpenModal(null)} />
      )}
      {openModal === "worksAndPersonnel" && (
        <WorksAndPersonnelModal
          initialData={todayWorks}
          initialDate={autoOpenDate}
          onClose={() => { setOpenModal(null); setAutoOpenDate(null); }}
        />
      )}
      {openModal === "depo" && (
        <DepoModal warehouses={warehouses} onClose={() => setOpenModal(null)} />
      )}
      {openModal === "teslimat" && (
        <TeslimatModal teslimatlar={teslimatlar} onClose={() => setOpenModal(null)} />
      )}
      {openModal === "ariza" && (
        <ArizaModal arizalar={arizalar} onClose={() => setOpenModal(null)} />
      )}
    </div>
  );
}

/* ============================================================
   YENİDEN KULLANILABİLİR KART
   ============================================================ */

function SitesProgressSection({
  sites,
  loading,
  mobile,
}: {
  sites: SiteProgress[];
  loading: boolean;
  mobile?: boolean;
}) {
  const getProgressTone = (percent: number) => {
    if (percent >= 100) return "bg-emerald-500";
    if (percent > 0) return "bg-amber-500";
    return "bg-gray-300";
  };

  // MOBİL: lacivert arka plan (Günlük Çalışma ile uyumlu) + şantiyeler alt alta (tek sütun)
  if (mobile) {
    const toneOnNavy = (percent: number) =>
      percent >= 100 ? "bg-emerald-400" : percent > 0 ? "bg-amber-400" : "bg-white/30";
    return (
      <section className="bg-gradient-to-br from-[#1e3a5f] to-[#13243a] rounded-2xl p-4 shadow-lg text-white">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight">Şantiyeler</h2>
              <p className="text-[11px] text-white/70">
                {loading ? "Yükleniyor…" : `${sites.length} aktif şantiye`}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/sites"
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-2 text-xs font-semibold transition-colors"
          >
            Tümü <ChevronRight size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="bg-white/10 rounded-xl p-4 h-[88px] animate-pulse" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="py-8 text-center text-white/60 text-sm">Aktif şantiye bulunmuyor.</div>
        ) : (
          <div className="space-y-2">
            {sites.map((site) => {
              const percent = Math.max(0, Math.min(100, site.percent || 0));
              return (
                <Link
                  key={site.id}
                  href={`/dashboard/sites/${site.id}`}
                  className="block bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="font-semibold truncate">{site.name}</span>
                    <span className="shrink-0 bg-white/20 rounded-lg px-2.5 py-0.5 text-sm font-black">
                      %{percent}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                    <div className={`h-full rounded-full ${toneOnNavy(percent)}`} style={{ width: `${percent}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                    <span>{site.blockCount} blok</span>
                    <span>{site.completed}/{site.total} iş</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#1e3a5f] text-white flex items-center justify-center">
            <Building2 size={25} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Şantiyeler</h2>
            <p className="text-sm text-gray-500">
              {loading ? "Aktif şantiyeler yükleniyor" : `${sites.length} aktif şantiye`}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/sites"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 text-sm font-semibold transition-colors"
        >
          Tüm şantiyeler
          <ChevronRight size={17} />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="min-h-44 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm animate-pulse">
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="mt-5 h-10 w-20 rounded bg-gray-200" />
              <div className="mt-6 h-3 rounded bg-gray-200" />
              <div className="mt-5 h-4 w-1/2 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-10 px-5 text-center text-gray-500">
          <Building2 className="mx-auto mb-3 text-gray-300" size={42} />
          Aktif şantiye bulunmuyor.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {sites.map((site) => {
            const percent = Math.max(0, Math.min(100, site.percent || 0));
            return (
              <Link
                key={site.id}
                href={`/dashboard/sites/${site.id}`}
                className="group min-h-44 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:border-[#1e3a5f]/40 hover:shadow-lg transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#1e3a5f] transition-colors break-words">
                      {site.name}
                    </h3>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                      Aktif
                    </p>
                  </div>
                  <span className="shrink-0 rounded-xl bg-[#1e3a5f] px-3 py-2 text-lg font-black text-white">
                    %{percent}
                  </span>
                </div>

                <div className="mt-6">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${getProgressTone(percent)}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                    <span>{site.blockCount} blok</span>
                    <span className="font-semibold text-gray-700">
                      {site.completed} / {site.total} iş
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-1 text-xs font-semibold text-gray-400 group-hover:text-[#1e3a5f] transition-colors">
                  Detaya git
                  <ChevronRight size={15} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   STUDYANKA KARTI (mobil ve masaüstü)
   ============================================================ */

function StudyAnkaCard({
  fullHeight,
  mobile,
  online,
  studyLoading,
  studyAccess,
  activeCount,
  totalRooms,
  todayKabinCount,
  todayToplantiCount,
}: {
  fullHeight?: boolean;
  mobile?: boolean;
  online: boolean;
  studyLoading: boolean;
  studyAccess: boolean;
  activeCount: number;
  totalRooms: number;
  todayKabinCount: number;
  todayToplantiCount: number;
}) {
  if (!studyAccess) {
    return (
      <div className={`${fullHeight ? "h-full" : mobile ? "" : "aspect-square"} bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-6 text-center text-gray-500`}>
        <Coffee size={32} className="text-gray-400 mb-3" />
        <h3 className="font-semibold">StudyAnka erişiminiz yok</h3>
        <p className="text-xs mt-1">Erişim için sistem yöneticisine başvurun.</p>
      </div>
    );
  }
  return (
    <Link
      href="/dashboard/studyanka"
      className={`group relative ${fullHeight ? "h-full" : mobile ? "" : "aspect-square"} bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-lg hover:shadow-2xl active:scale-[0.98] transition-all duration-200 flex flex-col ${mobile ? "p-3.5" : "p-3"} text-white ${fullHeight ? "overflow-y-auto" : "overflow-hidden"}`}
    >
      <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm ${fullHeight ? "text-[22px]" : mobile ? "text-[11px]" : "text-[13px]"} font-medium`}>
        {online ? <Wifi size={mobile ? 13 : 15} /> : <WifiOff size={mobile ? 13 : 15} />}
        {online ? "Çevrimiçi" : "Çevrimdışı"}
      </div>
      <div className={`flex items-center gap-2.5 ${mobile ? "mb-1" : "mb-1.5"}`}>
        <div className={`${mobile ? "w-9 h-9" : "w-11 h-11"} bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Coffee size={mobile ? 20 : 26} />
        </div>
        <div className="min-w-0">
          <h2 className={`${mobile ? "text-lg" : "text-3xl"} font-bold leading-tight`}>StudyAnka</h2>
          <p className={`${fullHeight ? "text-[26px]" : mobile ? "text-[11px]" : "text-[14px]"} text-white/80`}>Anlık özet</p>
        </div>
      </div>
      <div className={`flex-1 flex flex-col justify-center ${mobile ? "gap-1.5 py-0.5" : "gap-2"}`}>
        <CardStatRow
          big={fullHeight}
          mobile={mobile}
          icon={<DoorOpen size={mobile ? 16 : 20} />}
          label="Aktif Oda"
          value={studyLoading ? "—" : `${activeCount}${totalRooms ? ` / ${totalRooms}` : ""}`}
          compact
        />
        <CardStatRow
          big={fullHeight}
          mobile={mobile}
          icon={<DoorOpen size={mobile ? 16 : 20} />}
          label="Bugün Kabin"
          value={studyLoading ? "—" : `${todayKabinCount}`}
          compact
        />
        <CardStatRow
          big={fullHeight}
          mobile={mobile}
          icon={<Users size={mobile ? 16 : 20} />}
          label="Bugün Toplantı"
          value={studyLoading ? "—" : `${todayToplantiCount}`}
          compact
        />
      </div>
    </Link>
  );
}

/* ============================================================
   ŞANTİYELER KARTI (masaüstü tam yükseklik kart)
   ============================================================ */

function SitesProgressCard({
  sites,
  loading,
}: {
  sites: SiteProgress[];
  loading: boolean;
}) {
  const getProgressTone = (percent: number) => {
    if (percent >= 100) return "bg-emerald-400";
    if (percent > 0) return "bg-amber-400";
    return "bg-white/30";
  };

  return (
    <div className="h-full bg-gradient-to-br from-[#1e3a5f] to-[#0d2342] rounded-2xl shadow-lg flex flex-col p-5 text-white overflow-hidden">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shrink-0">
            <Building2 size={22} />
          </div>
          <div>
            <h2 className="text-5xl font-bold">Şantiyeler</h2>
            <p className="text-[30px] text-white/70">
              {loading ? "Yükleniyor…" : `${sites.length} aktif şantiye`}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/sites"
          className="shrink-0 text-[30px] bg-white/20 hover:bg-white/30 px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-1"
        >
          Tümü <ChevronRight size={14} />
        </Link>
      </div>

      {/* Site listesi - kaydırılabilir */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        {loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white/10 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-white/20 rounded w-2/3 mb-3" />
                <div className="h-2.5 bg-white/20 rounded-full w-full" />
              </div>
            ))}
          </>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/60 text-sm py-8">
            <Building2 size={32} className="mb-3 text-white/40" />
            Aktif şantiye yok
          </div>
        ) : (
          sites.map((site) => {
            const percent = Math.max(0, Math.min(100, site.percent || 0));
            return (
              <Link
                key={site.id}
                href={`/dashboard/sites/${site.id}`}
                className="block bg-white/10 hover:bg-white/20 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="font-semibold text-[40px] truncate">{site.name}</span>
                  <span className="shrink-0 bg-white/20 rounded-lg px-3 py-1 text-[40px] font-black">
                    %{percent}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className={`h-full rounded-full ${getProgressTone(percent)}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[26px] text-white/70">
                  <span>{site.blockCount} blok</span>
                  <span>{site.completed}/{site.total} iş</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function PersonnelSummaryCard({
  count,
  yesterdayCount,
  previousCount,
  onClick,
}: {
  count: number;
  yesterdayCount: number;
  previousCount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-square bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-lg hover:shadow-2xl active:scale-[0.98] transition-all duration-200 flex flex-col p-6 text-white text-left overflow-hidden"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <HardHat size={26} />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Personel</h2>
          <p className="text-xs text-white/80">Bugün çalışan personel</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="flex items-end gap-3">
          <span className="text-6xl md:text-7xl font-black leading-none">{count}</span>
          <span className="pb-2 text-lg md:text-xl font-semibold text-white/95">kişi</span>
        </div>
        <div className="mt-3 text-2xl md:text-3xl font-extrabold leading-tight">
          Bugün çalışıyor
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-white/10 px-3 py-2">
          <div className="text-white/75">Dün</div>
          <div className="mt-0.5 text-lg font-bold">{yesterdayCount}</div>
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-2">
          <div className="text-white/75">Önceki</div>
          <div className="mt-0.5 text-lg font-bold">{previousCount}</div>
        </div>
      </div>
    </button>
  );
}

function SummaryCard({
  gradient,
  icon,
  title,
  subtitle,
  mainValue,
  mainLabel,
  extras,
  onClick,
  fullHeight,
  compact,
  badge,
  inlineLabel,
  mobile,
}: {
  gradient: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  mainValue: string;
  mainLabel: string;
  extras: { label: string; value: string }[];
  onClick: () => void;
  fullHeight?: boolean;
  compact?: boolean;
  badge?: React.ReactNode;
  inlineLabel?: boolean;
  mobile?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative w-full ${fullHeight ? "h-full" : mobile ? "" : "aspect-square"} bg-gradient-to-br ${gradient} rounded-2xl shadow-lg hover:shadow-2xl active:scale-[0.98] transition-all duration-200 flex flex-col ${mobile ? "p-3.5" : compact ? "p-2.5" : "p-3"} text-white text-left overflow-hidden`}
    >
      {badge != null && (
        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white/25 backdrop-blur-sm ${fullHeight ? "text-[22px]" : mobile ? "text-[11px]" : "text-[13px]"} font-semibold whitespace-nowrap z-10`}>
          {badge}
        </div>
      )}
      <div className={`flex items-center gap-2.5 ${mobile ? "mb-1" : "mb-1.5"}`}>
        <div className={`${mobile ? "w-9 h-9" : compact ? "w-10 h-10" : "w-11 h-11"} bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className={`${mobile ? "text-lg" : compact ? "text-2xl" : "text-3xl"} font-bold leading-tight truncate`}>{title}</h2>
          <p className={`${fullHeight ? "text-[26px]" : mobile ? "text-[11px]" : "text-[14px]"} text-white/80 truncate`}>{subtitle}</p>
        </div>
      </div>
      <div className={`flex-1 flex flex-col justify-center ${mobile ? "py-0.5" : ""}`}>
        {inlineLabel ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`${mobile ? "text-[30px]" : compact ? "text-5xl" : "text-6xl"} font-extrabold leading-none`}>{mainValue}</span>
            <span className={`${fullHeight ? "text-[26px]" : mobile ? "text-[12px]" : "text-[15px]"} text-white/85`}>{mainLabel}</span>
          </div>
        ) : (
          <>
            <div className={`${mobile ? "text-[30px]" : compact ? "text-5xl" : "text-6xl"} font-extrabold leading-none`}>{mainValue}</div>
            <div className={`${fullHeight ? "text-[26px]" : mobile ? "text-[12px]" : "text-[15px]"} text-white/85 mt-1`}>{mainLabel}</div>
          </>
        )}
      </div>
      <div className={`${mobile ? "mt-1.5 pt-1.5" : compact ? "mt-1.5 pt-2" : "mt-2 pt-2"} border-t border-white/20 ${mobile ? "space-y-0.5" : "space-y-1"}`}>
        {extras.map((e, i) => (
          <div key={i} className={`flex items-center justify-between gap-2 ${fullHeight ? "text-[28px]" : mobile ? "text-[12px]" : (compact ? "text-[16px]" : "text-lg")}`}>
            <span className="text-white/85 truncate">{e.label}</span>
            <span className="font-semibold whitespace-nowrap">{e.value}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

function CardStatRow({
  icon,
  label,
  value,
  compact,
  big,
  mobile,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  compact?: boolean;
  big?: boolean;
  mobile?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`${mobile ? "w-8 h-8" : compact ? "w-10 h-10" : "w-9 h-9"} bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <span className={`${big ? "text-[28px]" : mobile ? "text-[13px]" : (compact ? "text-[16px]" : "text-lg")} font-medium text-white/90 truncate`}>{label}</span>
      </div>
      <span className={`${big ? "text-[40px]" : mobile ? "text-xl" : "text-3xl"} font-bold whitespace-nowrap`}>{value}</span>
    </div>
  );
}

/* ============================================================
   MODAL ŞELEKETİ (iPad uyumlu — büyük dokunma alanları)
   ============================================================ */

function ModalShell({
  title,
  onClose,
  actions,
  shortcut,
  bodyScrollLocked,
  children,
}: {
  title: string;
  onClose: () => void;
  actions?: React.ReactNode;
  shortcut?: { label: string; href: string };
  bodyScrollLocked?: boolean;
  children: React.ReactNode;
}) {
  const { isMobile } = useDevice();
  return (
    <div
      className={`fixed inset-0 z-50 bg-black/60 ${isMobile ? "" : "backdrop-blur-sm flex items-center justify-center p-4"}`}
      onClick={isMobile ? undefined : onClose}
    >
      <div
        className={`bg-white flex flex-col ${isMobile ? "w-full h-full" : "rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — mobilde tam-ekran: safe-top + geri (ana sayfa) butonu */}
        <div
          className={`sticky top-0 z-10 bg-white border-b border-gray-200 gap-2 ${
            isMobile
              ? "modal-safe-top px-2 pb-2.5 flex items-center"
              : "py-2 px-4 rounded-t-2xl flex flex-col md:flex-row md:items-center md:justify-between"
          }`}
        >
          {isMobile && (
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-gray-100 active:scale-90 text-gray-700 shrink-0 transition"
              aria-label="Ana sayfaya dön"
            >
              <ChevronLeft size={26} />
            </button>
          )}
          <h2 className={`font-bold text-gray-800 ${isMobile ? "text-lg flex-1 min-w-0 truncate" : "text-base md:text-lg"}`}>{title}</h2>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
            {shortcut && (
              <Link
                href={shortcut.href}
                onClick={onClose}
                className={`inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors ${isMobile ? "px-3 py-2 text-sm" : "min-h-[48px] px-5 py-3 text-base"}`}
              >
                <ExternalLink size={18} />
                <span>{shortcut.label}</span>
              </Link>
            )}
            {!isMobile && (
              <button
                onClick={onClose}
                className="inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                aria-label="Kapat"
              >
                <X size={22} />
              </button>
            )}
          </div>
        </div>
        {/* Body */}
        <div className={`flex-1 ${bodyScrollLocked ? "overflow-hidden" : "overflow-y-auto"} p-3`}>{children}</div>
      </div>
    </div>
  );
}

/* ============================================================
   PERSONEL MODAL
   ============================================================ */

function PersonnelModal({
  days,
  onClose,
}: {
  days: PersonnelDay[];
  onClose: () => void;
}) {
  const [todayIso] = useState(() => getTurkeyTodayIso());
  const [selectedDate, setSelectedDate] = useState(() => todayIso);
  const [day, setDay] = useState<PersonnelDay>(() => {
    const cachedToday = days.find((item) => item.date === todayIso);
    return cachedToday || emptyPersonnelDay(todayIso);
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cachedDay = days.find((item) => item.date === selectedDate);
    if (cachedDay) setDay(cachedDay);

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/dashboard/recent-personnel?date=${selectedDate}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return emptyPersonnelDay(selectedDate);
        const json = await res.json();
        return json.days?.[0] || emptyPersonnelDay(selectedDate);
      })
      .then((nextDay) => setDay(nextDay))
      .catch((error) => {
        if (error?.name !== "AbortError") setDay(emptyPersonnelDay(selectedDate));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedDate]);

  const groupedSites = useMemo(() => {
    const groups = new Map<
      string,
      { siteId: string; siteName: string; records: PersonnelRecord[] }
    >();

    for (const record of day.records) {
      const key = record.siteId || record.siteName;
      if (!groups.has(key)) {
        groups.set(key, {
          siteId: record.siteId,
          siteName: record.siteName,
          records: [],
        });
      }
      groups.get(key)!.records.push(record);
    }

    return Array.from(groups.values());
  }, [day.records]);

  const setClampedDate = (date: string) => {
    if (!date) return;
    setSelectedDate(clampPersonnelDate(date, todayIso));
  };

  const canGoPrev = selectedDate > MIN_PERSONNEL_DATE;
  const canGoNext = selectedDate < todayIso;
  const isToday = selectedDate === todayIso;

  const goPrev = () => {
    if (canGoPrev) setClampedDate(shiftIsoDate(selectedDate, -1));
  };

  const goNext = () => {
    if (canGoNext) setClampedDate(shiftIsoDate(selectedDate, 1));
  };

  const headerActions = (
    <>
      {!isToday && (
        <button
          onClick={() => setSelectedDate(todayIso)}
          className="inline-flex items-center justify-center min-h-[48px] px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition-colors"
        >
          Bugüne dön
        </button>
      )}
      <label className="inline-flex items-center gap-2 min-h-[48px] px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-semibold">
        <CalendarDays size={18} />
        <input
          type="date"
          min={MIN_PERSONNEL_DATE}
          max={todayIso}
          value={selectedDate}
          onChange={(event) => setClampedDate(event.target.value)}
          className="bg-transparent outline-none min-h-[32px]"
          aria-label="Personel tarihi seç"
        />
      </label>
    </>
  );

  return (
    <ModalShell
      title={`Personel — ${TR_DATE(selectedDate)}`}
      onClose={onClose}
      actions={headerActions}
      shortcut={{ label: "Personel sayfası", href: "/dashboard/personel" }}
    >
      <button
        type="button"
        onClick={goPrev}
        disabled={!canGoPrev}
        className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-[55] min-h-[72px] min-w-[67px] items-center justify-center rounded-2xl bg-white/95 shadow-xl text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Önceki gün"
      >
        <ChevronLeft size={34} />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={!canGoNext}
        className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-[55] min-h-[72px] min-w-[67px] items-center justify-center rounded-2xl bg-white/95 shadow-xl text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Sonraki gün"
      >
        <ChevronRight size={34} />
      </button>

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">
            {day.uniqueCount} kişi · {day.total} kayıt
          </span>
          {loading && <span className="text-sm text-gray-400">Yükleniyor...</span>}
        </div>

        {groupedSites.length === 0 && !loading && (
          <p className="text-gray-500 text-base py-8 text-center">Bu tarih için kayıt bulunamadı.</p>
        )}

        {groupedSites.map((site) => (
          <section key={site.siteId || site.siteName} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-2">
              <h3 className="text-lg md:text-xl font-bold text-gray-900">{site.siteName}</h3>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
                {site.records.length} kayıt
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {site.records.map((record) => {
                const duration = record.workDuration === "FULL_DAY" ? "Tam Gün" : "Yarım Gün";
                const workLine = [
                  `${duration} ${record.blockName || "Peyzaj"}`,
                  record.workName,
                  record.floorName,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={record.id}
                    className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="font-bold text-gray-900 text-base truncate">
                      {record.personnelName}
                    </div>
                    {record.company && (
                      <div className="text-sm text-gray-600 truncate mt-0.5">
                        {record.company}
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-gray-100 text-sm font-semibold text-gray-700">
                      {workLine}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ModalShell>
  );
}

/* ============================================================
   YAPILAN İŞLER MODAL
   ============================================================ */

function WorksModal({
  data,
  onClose,
}: {
  data: RecentWorksResp | null;
  onClose: () => void;
}) {
  const [popupWork, setPopupWork] = useState<WorkAgg | null>(null);
  const [viewerItems, setViewerItems] = useState<MediaItem[] | null>(null);
  const [viewerIdx, setViewerIdx] = useState(0);

  // Tüm işler — tekrar olmadan, son aktiviteye göre sıralı
  const list = useMemo(() => data?.works ?? [], [data]);

  return (
    <>
      <ModalShell title="Yapılan İşler — Son 3 Gün" onClose={onClose} bodyScrollLocked={!!popupWork}>
        <div className="space-y-4">
          {/* Sayım özeti */}
          {data && (
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-semibold">
                Toplam: {data.total}
              </span>
              <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-semibold">
                Fotoğraf (Personelsiz): {data.categories.photosOnly.length}
              </span>
              <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-semibold">
                Personel (Fotoğrafsız): {data.personnelNoPhotoCount}
              </span>
              <span className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg font-semibold">
                Fotoğraf ve Personel: {data.photoWithPersonnelCount}
              </span>
            </div>
          )}

          {/* Liste */}
          {list.length === 0 ? (
            <p className="text-gray-500 text-base py-6 text-center">Kayıt bulunamadı.</p>
          ) : (
            <div className="space-y-3">
              {list.map((w) => (
                <div
                  key={w.key}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-gray-900 text-base">{w.workName}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-semibold">Şantiye:</span> {w.siteName} ·{" "}
                        <span className="font-semibold">Kat/Bağlam:</span> {w.contextName}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs">
                        <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md font-semibold">
                          {w.personnelCount} personel
                        </span>
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md font-semibold">
                          {w.photoCount} fotoğraf
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {w.personnelCount > 0 && (
                        <button
                          onClick={() => setPopupWork(w)}
                          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-semibold"
                        >
                          <Users size={16} /> Personel
                        </button>
                      )}
                      {w.photoCount > 0 && (
                        <button
                          onClick={() => {
                            requestPageFullscreen();
                            setViewerItems(
                              w.photos.map((p) => ({
                                id: p.id,
                                fileName: p.fileName || "",
                                fileUrl: p.url,
                                mimeType: p.mimeType,
                              }))
                            );
                            setViewerIdx(0);
                          }}
                          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-sm font-semibold"
                        >
                          <Camera size={16} /> Fotoğraf
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalShell>

      {/* Personel popup */}
      {popupWork && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPopupWork(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-200">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-800 truncate">
                  {popupWork.workName}
                </h3>
                <p className="text-sm text-gray-500 truncate">
                  {popupWork.siteName} · {popupWork.contextName}
                </p>
              </div>
              <button
                onClick={() => setPopupWork(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {popupWork.personnelEntries.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">
                      {p.personnelName}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {p.company || "—"} · {TR_DATE(p.date)}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                      p.workDuration === "FULL_DAY"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {p.workDuration === "FULL_DAY" ? "Tam" : "Yarım"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tam özellikli medya viewer */}
      <MediaViewer
        open={!!viewerItems && viewerItems.length > 0}
        items={viewerItems || []}
        index={viewerIdx}
        onIndexChange={setViewerIdx}
        onClose={() => setViewerItems(null)}
      />
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 min-h-[48px] px-5 py-3 rounded-xl text-base font-semibold transition-colors ${
        active
          ? "bg-blue-600 text-white shadow"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ============================================================
   DEPO MODAL
   ============================================================ */

function DepoModal({
  warehouses,
  onClose,
}: {
  warehouses: WarehouseItem[];
  onClose: () => void;
}) {
  const { isMobile } = useDevice();
  const [activeId, setActiveId] = useState<string>("__all__");
  const [viewerItems, setViewerItems] = useState<MediaItem[] | null>(null);
  const [viewerIdx, setViewerIdx] = useState(0);
  const isAll = activeId === "__all__";
  const active = isAll ? null : warehouses.find((w) => w.id === activeId) || null;
  const totalCount = warehouses.reduce((s, w) => s + w.materials.length, 0);

  type RowMedia = { id: string; mimeType: string; fileName?: string | null };
  type Row = {
    warehouseName: string;
    name: string;
    quantity: number | string;
    unit: string;
    minStock: number | null | undefined;
    notes: string | null | undefined;
    media: RowMedia[];
  };
  const mapRow = (w: WarehouseItem, m: WarehouseMaterial): Row => ({
    warehouseName: w.name,
    name: m.material.name,
    quantity: m.quantity,
    unit: m.unit || m.material.unit,
    minStock: m.minStock,
    notes: m.notes,
    media: m.media ?? [],
  });
  const rows: Row[] = isAll
    ? warehouses.flatMap((w) => w.materials.map((m) => mapRow(w, m)))
    : (active?.materials ?? []).map((m) => mapRow(active!, m));

  const openMedia = (media: RowMedia[]) => {
    if (media.length === 0) return;
    setViewerItems(
      media.map((m) => ({
        id: m.id,
        fileName: m.fileName || "",
        fileUrl: `/api/warehouses/stock/media/${m.id}`,
        mimeType: m.mimeType,
      }))
    );
    setViewerIdx(0);
  };

  return (
    <ModalShell
      title="Depolar — Detay"
      onClose={onClose}
      shortcut={{ label: "Depoya git", href: "/dashboard/depo" }}
    >
      <div className="space-y-4">
        {/* Depo filtresi — mobilde açılır liste (sayılı), masaüstünde pill */}
        {isMobile ? (
          <div className="flex items-center gap-2">
            <Warehouse size={18} className="text-indigo-600 shrink-0" />
            <select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              className="flex-1 min-w-0 min-h-[42px] px-3 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800"
              aria-label="Depo seç"
            >
              <option value="__all__">Tümü ({totalCount})</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.materials.length})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveId("__all__")}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm border ${
                isAll
                  ? "bg-gradient-to-r from-indigo-600 to-purple-700 text-white border-transparent shadow-lg"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              <Warehouse size={16} />
              <span>Tümü ({totalCount})</span>
            </button>
            {warehouses.map((w) => {
              const isActive = active?.id === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setActiveId(w.id)}
                  className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm border ${
                    isActive
                      ? "bg-gradient-to-r from-indigo-600 to-purple-700 text-white border-transparent shadow-lg"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <Warehouse size={16} />
                  <span>{w.name} ({w.materials.length})</span>
                </button>
              );
            })}
          </div>
        )}
        {/* Liste */}
        {rows.length === 0 ? (
          <p className="text-gray-500 text-base py-6 text-center">Kalem bulunamadı.</p>
        ) : isMobile ? (
          /* Mobil: yatay kaydırma yok → kart listesi */
          <div className="space-y-2">
            {rows.map((m, i) => {
              const hasMedia = m.media.length > 0;
              return (
              <div
                key={i}
                onClick={hasMedia ? () => openMedia(m.media) : undefined}
                className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm ${hasMedia ? "cursor-pointer active:bg-blue-50/40" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-gray-900 leading-snug flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{m.name}</span>
                    {hasMedia && (
                      <span className="inline-flex items-center gap-0.5 text-blue-600 shrink-0">📷<span className="text-[10px] font-bold">{m.media.length}</span></span>
                    )}
                  </span>
                  <span className="font-bold text-indigo-700 whitespace-nowrap shrink-0">
                    {m.quantity} {m.unit}
                  </span>
                </div>
                {isAll && (
                  <div className="text-xs text-indigo-600 font-medium mt-0.5">{m.warehouseName}</div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 mt-1.5">
                  <span>Min. Stok: {m.minStock != null ? m.minStock : "—"}</span>
                  {m.notes && <span className="min-w-0 break-words">Not: {m.notes}</span>}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-700 text-sm font-semibold">
                  {isAll && <th className="px-4 py-3 rounded-l-lg">Depo</th>}
                  <th className={`px-4 py-3 ${isAll ? "" : "rounded-l-lg"}`}>Malzeme</th>
                  <th className="px-4 py-3">Miktar</th>
                  <th className="px-4 py-3">Birim</th>
                  <th className="px-4 py-3">Min. Stok</th>
                  <th className="px-4 py-3 rounded-r-lg">Notlar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m, i) => {
                  const hasMedia = m.media.length > 0;
                  return (
                  <tr
                    key={i}
                    onClick={hasMedia ? () => openMedia(m.media) : undefined}
                    className={`border-b border-gray-100 ${hasMedia ? "cursor-pointer hover:bg-blue-50" : ""}`}
                    title={hasMedia ? "Fotoğrafları görüntülemek için tıklayın" : undefined}
                  >
                    {isAll && (
                      <td className="px-4 py-3 text-indigo-700 font-semibold">
                        {m.warehouseName}
                      </td>
                    )}
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      <span className="inline-flex items-center gap-1.5">
                        {m.name}
                        {hasMedia && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600">📷<span className="text-[10px] font-bold">{m.media.length}</span></span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{m.quantity}</td>
                    <td className="px-4 py-3 text-gray-700">{m.unit}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {m.minStock != null ? m.minStock : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-xs">
                      {m.notes || "—"}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewerItems && (
        <MediaViewer
          open={viewerItems.length > 0}
          items={viewerItems}
          index={viewerIdx}
          onClose={() => setViewerItems(null)}
          onIndexChange={setViewerIdx}
        />
      )}
    </ModalShell>
  );
}

/* ============================================================
   TESLİMAT MODAL
   ============================================================ */

function TeslimatModal({
  teslimatlar,
  onClose,
}: {
  teslimatlar: TeslimatRecord[];
  onClose: () => void;
}) {
  const { isMobile } = useDevice();
  const [siteFilter, setSiteFilter] = useState<string>("ALL");
  const [viewing, setViewing] = useState<TeslimatRecord | null>(null);
  const [viewerItems, setViewerItems] = useState<MediaItem[] | null>(null);
  const [viewerIdx, setViewerIdx] = useState(0);

  const sites = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teslimatlar) {
      if (t.site) map.set(t.site.id, t.site.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [teslimatlar]);

  const filtered =
    siteFilter === "ALL"
      ? teslimatlar
      : teslimatlar.filter((t) => t.site?.id === siteFilter);

  const formatCurrency = (val: number) =>
    val.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
  const formatDate = (d: string) => TR_DATE(d);

  const openItemMediaViewer = (item: TeslimatItem) => {
    if (!item.media || item.media.length === 0) return;
    const items: MediaItem[] = item.media.map((m) => ({
      id: m.id,
      fileName: m.fileName,
      fileUrl: `/api/teslimat-items/file/${m.id}`,
      mimeType: m.mimeType,
    }));
    setViewerItems(items);
    setViewerIdx(0);
  };

  return (
    <ModalShell
      title="Teslimatlar"
      onClose={onClose}
      shortcut={{ label: "Teslimat'a git", href: "/dashboard/teslimat" }}
    >
      <div className="space-y-4">
        {/* Filtre */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-base font-semibold text-gray-700">Şantiye:</label>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="min-h-[48px] px-4 py-3 text-base rounded-xl border border-gray-300 bg-white"
          >
            <option value="ALL">Tümü ({teslimatlar.length})</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-sm text-gray-500">
            Gösterilen: <span className="font-semibold">{filtered.length}</span>
          </span>
        </div>

        {/* Liste — teslimat sayfasındaki tablo benzeri */}
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-base py-6 text-center">Kayıt bulunamadı.</p>
        ) : isMobile ? (
          /* Mobil: yatay kaydırma yok → kart listesi */
          <div className="space-y-2">
            {filtered.map((t) => {
              const totalMedia = t.items.reduce((s, i) => s + (i.media?.length ?? 0), 0);
              const itemsText = t.items.map((i) => i.materialName).join(", ");
              return (
                <button
                  key={t.id}
                  onClick={() => setViewing(t)}
                  className="w-full text-left rounded-xl border border-gray-200 bg-white p-3 shadow-sm active:scale-[0.99] transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900 leading-snug">{t.supplier || "—"}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">{formatDate(t.date)}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-0.5">{t.site?.name || "—"}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5 min-w-0">
                    <span className="shrink-0">{t.items.length} kalem</span>
                    {totalMedia > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-blue-700 font-bold shrink-0">
                        <Camera size={11} />{totalMedia}
                      </span>
                    )}
                    <span className="truncate">· {itemsText || "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-400">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-3 py-2 border border-gray-400">Tarih</th>
                  <th className="text-left px-3 py-2 border border-gray-400">Tedarikçi</th>
                  <th className="text-left px-3 py-2 border border-gray-400">Şantiye</th>
                  <th className="text-left px-3 py-2 border border-gray-400">Kalemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const totalMedia = t.items.reduce(
                    (s, i) => s + (i.media?.length ?? 0),
                    0
                  );
                  const itemsText = t.items.map((i) => i.materialName).join(", ");
                  const itemsShort =
                    itemsText.length > 15 ? itemsText.slice(0, 15) + "..." : itemsText;
                  return (
                  <tr
                    key={t.id}
                    onClick={() => setViewing(t)}
                    className="cursor-pointer hover:bg-blue-50"
                    title="Detayları görüntülemek için tıklayın"
                  >
                    <td className="px-3 py-2 border border-gray-400 whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="px-3 py-2 border border-gray-400">{t.supplier || "—"}</td>
                    <td className="px-3 py-2 border border-gray-400">{t.site?.name || "—"}</td>
                    <td className="px-3 py-2 border border-gray-400 align-top">
                      <div className="text-[10px] text-gray-500 leading-tight flex items-center gap-1">
                        <span>{t.items.length} kalem</span>
                        {totalMedia > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-blue-700 font-bold">
                            <Camera size={11} />
                            {totalMedia}
                          </span>
                        )}
                      </div>
                      <div className="font-medium whitespace-nowrap" title={itemsText}>
                        {itemsShort || "—"}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detay popup — mobilde tam-ekran + geri */}
      {viewing && (
        <div
          className={`fixed inset-0 bg-black/50 z-[60] ${isMobile ? "" : "flex items-center justify-center p-4"}`}
          onClick={() => setViewing(null)}
        >
          <div
            className={`bg-white overflow-y-auto ${isMobile ? "w-full h-full" : "rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center gap-2 border-b sticky top-0 bg-white z-10 ${isMobile ? "modal-safe-top px-2 pb-3" : "justify-between p-5"}`}>
              {isMobile && (
                <button onClick={() => setViewing(null)} className="inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-gray-100 active:scale-90 text-gray-700 shrink-0 transition" aria-label="Geri">
                  <ChevronLeft size={26} />
                </button>
              )}
              <h2 className="text-lg font-bold text-gray-800 flex-1 min-w-0 truncate">Teslimat Detayı</h2>
              {!isMobile && (
                <button onClick={() => setViewing(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X size={20} />
                </button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">İrsaliye No:</span> <span className="font-medium ml-1">{viewing.irsaliyeNo || "—"}</span></div>
                <div><span className="text-gray-500">Tarih:</span> <span className="font-medium ml-1">{formatDate(viewing.date)}</span></div>
                <div><span className="text-gray-500">Tedarikçi:</span> <span className="font-medium ml-1">{viewing.supplier || "-"}</span></div>
                <div><span className="text-gray-500">Şantiye:</span> <span className="font-medium ml-1">{viewing.site?.name || "-"}</span></div>
                <div><span className="text-gray-500">Teslim Alan:</span> <span className="font-medium ml-1">{viewing.receivedBy}</span></div>
                {viewing.notes && (
                  <div className="col-span-2"><span className="text-gray-500">Notlar:</span> <span className="ml-1">{viewing.notes}</span></div>
                )}
              </div>

              {(() => {
                const showPrice = viewing.items.some((i) => (i.unitPrice ?? 0) > 0);
                return (
                  <div className="overflow-x-auto">
                    {/* style display:table → globals'taki [data-device=mobile] main table{display:block}
                        kuralını ezer; w-full + Malzeme w-full → tablo satırı tam kaplar, Miktar sağa yaslanır */}
                    <table style={{ display: "table", width: "100%" }} className="w-full text-sm border-collapse border border-gray-400">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="text-left px-3 py-2 border border-gray-400 w-full">Malzeme</th>
                          <th className="text-right px-3 py-2 border border-gray-400 whitespace-nowrap">Miktar</th>
                          {showPrice && (
                            <>
                              <th className="text-right px-3 py-2 border border-gray-400">Birim Fiyat</th>
                              <th className="text-right px-3 py-2 border border-gray-400">KDV</th>
                              <th className="text-right px-3 py-2 border border-gray-400">Toplam</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {viewing.items.map((item, i) => {
                          const lineGross = item.quantity * item.unitPrice;
                          const lineNet = lineGross / (1 + (item.taxRate ?? 0) / 100);
                          const lineKdv = lineGross - lineNet;
                          const hasMedia = (item.media?.length ?? 0) > 0;
                          return (
                            <tr
                              key={i}
                              onClick={hasMedia ? () => openItemMediaViewer(item) : undefined}
                              className={hasMedia ? "cursor-pointer hover:bg-blue-50" : ""}
                              title={hasMedia ? "Fotoğrafları görüntülemek için tıklayın" : undefined}
                            >
                              <td className="px-3 py-2 border border-gray-400">
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
                              <td className="px-3 py-2 text-right border border-gray-400">{item.quantity} {item.unit}</td>
                              {showPrice && (
                                <>
                                  <td className="px-3 py-2 text-right border border-gray-400">{formatCurrency(item.unitPrice)}</td>
                                  <td className="px-3 py-2 text-right border border-gray-400">
                                    <div>%{item.taxRate ?? 0}</div>
                                    <div className="text-[10px] text-gray-500">{formatCurrency(lineKdv)}</div>
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium border border-gray-400">
                                    <div className="text-[#c0392b]">{formatCurrency(lineGross)}</div>
                                    <div className="text-[10px] text-gray-500 font-normal">KDV-siz: {formatCurrency(lineNet)}</div>
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
                            const grossSum = viewing.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
                            const netSum = viewing.items.reduce((s, i) => s + (i.quantity * i.unitPrice) / (1 + (i.taxRate ?? 0) / 100), 0);
                            const kdvSum = grossSum - netSum;
                            return (
                              <>
                                <tr className="bg-gray-50">
                                  <td colSpan={4} className="px-3 py-1.5 text-right text-gray-600 border border-gray-400">KDV-siz Toplam:</td>
                                  <td className="px-3 py-1.5 text-right font-medium border border-gray-400">{formatCurrency(netSum)}</td>
                                </tr>
                                <tr className="bg-gray-50">
                                  <td colSpan={4} className="px-3 py-1.5 text-right text-gray-600 border border-gray-400">Toplam KDV:</td>
                                  <td className="px-3 py-1.5 text-right font-medium border border-gray-400">{formatCurrency(kdvSum)}</td>
                                </tr>
                                <tr className="bg-gray-50 font-bold">
                                  <td colSpan={4} className="px-3 py-2 text-right border border-gray-400">Toplam Tutar (KDV Dahil):</td>
                                  <td className="px-3 py-2 text-right text-[#c0392b] border border-gray-400">
                                    {formatCurrency(grossSum)}
                                  </td>
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
            </div>
          </div>
        </div>
      )}

      {viewerItems && (
        <MediaViewer
          open={viewerItems.length > 0}
          items={viewerItems}
          index={viewerIdx}
          onClose={() => setViewerItems(null)}
          onIndexChange={setViewerIdx}
        />
      )}
    </ModalShell>
  );
}

/* ============================================================
   ARIZA MODAL
   ============================================================ */

function ArizaModal({
  arizalar,
  onClose,
}: {
  arizalar: ArizaRecord[];
  onClose: () => void;
}) {
  const { isMobile } = useDevice();
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [viewerItems, setViewerItems] = useState<MediaItem[] | null>(null);
  const [viewerIdx, setViewerIdx] = useState(0);
  const [detail, setDetail] = useState<ArizaRecord | null>(null);
  const filtered =
    filter === "ALL" ? arizalar : arizalar.filter((a) => a.status === filter);

  const openMediaFor = (a: ArizaRecord) => {
    const media = a.media ?? [];
    if (media.length === 0) return;
    setViewerItems(
      media.map((m) => ({
        id: m.id,
        fileName: m.fileName,
        fileUrl: `/api/ariza/file/${m.id}`,
        mimeType: m.mimeType,
      }))
    );
    setViewerIdx(0);
  };

  return (
    <ModalShell
      title="Arıza Takip"
      onClose={onClose}
      shortcut={{ label: "Arıza Takip'e git", href: "/dashboard/ariza" }}
    >
      <div className="space-y-4">
        {/* Filtre */}
        <div className="flex flex-wrap gap-2">
          <TabButton
            active={filter === "ALL"}
            onClick={() => setFilter("ALL")}
            icon={<ChevronRight size={18} />}
            label={`Tümü (${arizalar.length})`}
          />
          <TabButton
            active={filter === "OPEN"}
            onClick={() => setFilter("OPEN")}
            icon={<AlertCircle size={18} />}
            label={`Açık (${arizalar.filter((a) => a.status === "OPEN").length})`}
          />
          <TabButton
            active={filter === "RESOLVED"}
            onClick={() => setFilter("RESOLVED")}
            icon={<CheckCircle2 size={18} />}
            label={`Çözülen (${arizalar.filter((a) => a.status === "RESOLVED").length})`}
          />
        </div>
        {/* Liste */}
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-base py-6 text-center">Kayıt bulunamadı.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => {
              const mediaCount = a.media?.length ?? 0;
              const hasMedia = mediaCount > 0;
              return (
              <div
                key={a.id}
                onClick={hasMedia ? () => openMediaFor(a) : undefined}
                className={`border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow ${
                  hasMedia ? "cursor-pointer hover:bg-blue-50/40 hover:border-blue-300" : ""
                }`}
                title={hasMedia ? "Fotoğrafları görüntülemek için tıklayın" : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 text-base flex items-center gap-2">
                      <span>{a.site?.name || a.customSiteName || "—"}</span>
                      {hasMedia && (
                        <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md text-xs font-bold">
                          <Camera size={12} />
                          {mediaCount}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {[a.block?.name, a.floor?.name, a.unit?.name]
                        .filter(Boolean)
                        .join(" · ") || "Genel"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className={`text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap ${
                        a.status === "OPEN"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {a.status === "OPEN" ? "AÇIK" : "ÇÖZÜLDÜ"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDetail(a); }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e3a5f] bg-[#1e3a5f]/10 hover:bg-[#1e3a5f]/20 active:scale-95 px-2.5 py-1.5 rounded-md whitespace-nowrap transition"
                    >
                      Detay <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mt-2">{a.description}</p>
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 grid grid-cols-1 md:grid-cols-2 gap-1">
                  <div>
                    <span className="font-semibold">Başlangıç:</span>{" "}
                    {TR_DATE(a.startDate)}
                  </div>
                  {a.endDate && (
                    <div>
                      <span className="font-semibold">Bitiş:</span> {TR_DATE(a.endDate)}
                    </div>
                  )}
                  {a.assignedPersonnel && (
                    <div>
                      <span className="font-semibold">Atanan:</span> {a.assignedPersonnel}
                    </div>
                  )}
                  {a.createdByName && (
                    <div>
                      <span className="font-semibold">Açan:</span> {a.createdByName}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tek arıza — tam-ekran detay (Detay butonu) */}
      {detail && (
        <div
          className={`fixed inset-0 bg-black/50 z-[60] ${isMobile ? "" : "flex items-center justify-center p-4"}`}
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
                <span className="font-bold text-gray-900 text-lg leading-snug">{detail.site?.name || detail.customSiteName || "—"}</span>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap shrink-0 ${detail.status === "OPEN" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {detail.status === "OPEN" ? "AÇIK" : "ÇÖZÜLDÜ"}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {[detail.block?.name, detail.floor?.name, detail.unit?.name].filter(Boolean).join(" · ") || "Genel"}
              </div>
              {detail.description && (
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800 whitespace-pre-wrap">{detail.description}</div>
              )}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><span className="text-gray-500">Başlangıç</span><span className="font-medium text-gray-800">{TR_DATE(detail.startDate)}</span></div>
                {detail.endDate && <div className="flex justify-between gap-3"><span className="text-gray-500">Bitiş</span><span className="font-medium text-gray-800">{TR_DATE(detail.endDate)}</span></div>}
                {detail.assignedPersonnel && <div className="flex justify-between gap-3"><span className="text-gray-500">Atanan</span><span className="font-medium text-gray-800">{detail.assignedPersonnel}</span></div>}
                {detail.createdByName && <div className="flex justify-between gap-3"><span className="text-gray-500">Açan</span><span className="font-medium text-gray-800">{detail.createdByName}</span></div>}
              </div>
              {(detail.media?.length ?? 0) > 0 && (
                <button
                  onClick={() => openMediaFor(detail)}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1e3a5f] hover:bg-[#16293f] text-white font-semibold active:scale-[0.99] transition"
                >
                  <Camera size={18} /> Fotoğrafları gör ({detail.media!.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {viewerItems && (
        <MediaViewer
          open={viewerItems.length > 0}
          items={viewerItems}
          index={viewerIdx}
          onClose={() => setViewerItems(null)}
          onIndexChange={setViewerIdx}
        />
      )}
    </ModalShell>
  );
}

/* ============================================================
   YAPILAN İŞLER VE PERSONEL — BİRLEŞİK KART
   ============================================================ */

function WorksAndPersonnelSummaryCard({
  worksCount,
  personnelCount,
  siteCount,
  works,
  onClick,
  fullHeight,
  mobile,
  tall,
}: {
  worksCount: number;
  personnelCount: number;
  siteCount: number;
  works: WorkAgg[];
  onClick: () => void;
  fullHeight?: boolean;
  mobile?: boolean;
  tall?: boolean;
}) {
  const siteGroups = useMemo(() => {
    const map = new Map<string, { siteName: string; works: WorkAgg[] }>();
    for (const w of works) {
      if (!map.has(w.siteId)) map.set(w.siteId, { siteName: w.siteName, works: [] });
      map.get(w.siteId)!.works.push(w);
    }
    return Array.from(map.values());
  }, [works]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`group relative ${fullHeight ? "h-full" : tall ? "h-[calc(100dvh-9rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]" : mobile ? "min-h-[120px] max-h-[300px]" : "aspect-square"} bg-gradient-to-br ${mobile ? "from-[#1e3a5f] to-[#13243a]" : "from-cyan-500 to-sky-700"} rounded-2xl shadow-lg hover:shadow-2xl active:scale-[0.98] transition-all duration-200 flex flex-col ${mobile ? "p-3.5" : "p-3"} text-white text-left overflow-hidden cursor-pointer`}
    >
      {/* Header */}
      <div className={`flex items-center gap-2.5 ${mobile ? "mb-1.5" : "mb-2"} flex-shrink-0`}>
        <div className={`${mobile ? "w-9 h-9" : "w-11 h-11"} bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Activity size={mobile ? 20 : 26} />
        </div>
        <div className="min-w-0">
          <h2 className={`${fullHeight ? "text-[44px]" : mobile ? "text-lg" : "text-2xl"} font-bold leading-tight`}>Günlük Çalışma</h2>
          <p className={`${fullHeight ? "text-[28px]" : mobile ? "text-[11px]" : "text-[14px]"} text-white/80`}>{worksCount} iş · {personnelCount} kişi · {siteCount} şantiye</p>
        </div>
      </div>

      {/* Site-grouped works list */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-0.5">
        {siteGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/60 text-sm">
            <Hammer size={28} className="mb-2 opacity-50" />
            <span>Bugün kayıt yok</span>
          </div>
        ) : (
          siteGroups.map((site) => (
            <div key={site.siteName} className="bg-white/15 rounded-xl p-2">
              <div className={`font-extrabold ${fullHeight ? "text-[40px] md:text-[44px]" : mobile ? "text-base" : "text-xl md:text-2xl"} text-amber-200 mb-1.5 truncate tracking-wide drop-shadow-sm`}>
                {site.siteName}
              </div>
              <div className="space-y-1.5">
                {site.works.map((w) => (
                  <div key={w.key} className="bg-white/10 rounded-lg px-2.5 py-2">
                    <div className={`${fullHeight ? "text-[28px]" : mobile ? "text-[12px]" : "text-[15px]"} text-white/75 truncate`}>
                      {w.contextName && w.contextName !== "—" ? w.contextName : "—"}
                    </div>
                    <div className={`${fullHeight ? "text-[32px]" : mobile ? "text-[13px]" : "text-[16px]"} font-semibold text-white leading-snug truncate`}>
                      {w.workName}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {w.personnelCount > 0 && (
                        <span className={`inline-flex items-center gap-1 ${fullHeight ? "text-[24px]" : mobile ? "text-[11px]" : "text-[13px]"} font-medium bg-white/20 rounded px-2 py-0.5`}>
                          <Users size={13} />{w.personnelCount} kişi
                        </span>
                      )}
                      {w.photoCount > 0 && (
                        <span className={`inline-flex items-center gap-1 ${fullHeight ? "text-[24px]" : mobile ? "text-[11px]" : "text-[13px]"} font-medium bg-white/20 rounded px-2 py-0.5`}>
                          <Camera size={13} />{w.photoCount} medya
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================
   YAPILAN İŞLER VE PERSONEL — MODAL (gün seç + şantiye filtresi)
   ============================================================ */

function WorksAndPersonnelModal({
  initialData,
  initialDate,
  onClose,
}: {
  initialData: RecentWorksResp | null;
  initialDate?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [todayIso] = useState(() => getTurkeyTodayIso());
  const [selectedDate, setSelectedDate] = useState(() => initialDate ? clampPersonnelDate(initialDate, getTurkeyTodayIso()) : getTurkeyTodayIso());
  const [data, setData] = useState<RecentWorksResp | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [siteFilter, setSiteFilter] = useState<string>("ALL");
  const [popupWork, setPopupWork] = useState<WorkAgg | null>(null);
  const [viewerItems, setViewerItems] = useState<MediaItem[] | null>(null);
  const [viewerIdx, setViewerIdx] = useState(0);
  const [detailPopup, setDetailPopup] = useState<"works" | "personnel" | null>(null);

  // Tarih değiştiğinde veriyi getir
  useEffect(() => {
    // Bugünse ve initialData varsa, tekrar çekme
    if (selectedDate === todayIso && initialData) {
      setData(initialData);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/dashboard/recent-works?date=${selectedDate}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as RecentWorksResp;
      })
      .then((next) => {
        if (next) setData(next);
        else
          setData({
            total: 0,
            withPhotoCount: 0,
            personnelNoPhotoCount: 0,
            photoWithPersonnelCount: 0,
            works: [],
            categories: {
              photos: [],
              personnelNoPhoto: [],
              personnelWithPhoto: [],
              photosOnly: [],
            },
          });
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setData({
            total: 0,
            withPhotoCount: 0,
            personnelNoPhotoCount: 0,
            photoWithPersonnelCount: 0,
            works: [],
            categories: {
              photos: [],
              personnelNoPhoto: [],
              personnelWithPhoto: [],
              photosOnly: [],
            },
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedDate, todayIso, initialData]);

  // Şantiye filtre butonları için liste
  const siteOptions = useMemo(() => {
    if (!data?.works) return [];
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const w of data.works) {
      const existing = map.get(w.siteId);
      if (existing) existing.count++;
      else map.set(w.siteId, { id: w.siteId, name: w.siteName, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "tr")
    );
  }, [data]);

  // Filtrelenmiş iş listesi
  const filteredWorks = useMemo(() => {
    if (!data?.works) return [];
    if (siteFilter === "ALL") return data.works;
    return data.works.filter((w) => w.siteId === siteFilter);
  }, [data, siteFilter]);

  // Filtrelenmiş benzersiz personel sayısı
  const filteredUniquePersonnel = useMemo(() => {
    const names = new Set<string>();
    for (const w of filteredWorks) {
      for (const p of w.personnelEntries) {
        const k = (p.personnelName || "")
          .trim()
          .replace(/\s+/g, " ")
          .toLocaleLowerCase("tr-TR");
        if (k) names.add(k);
      }
    }
    return names.size;
  }, [filteredWorks]);

  // Sıralama: önce inşaat türü (KABA → INCE → BINA → PEYZAJ),
  // sonra şantiye, sonra kat/daire (numaralarla doğal sıralama),
  // sonra iş adı.
  const sortedWorks = useMemo(() => {
    const TYPE_ORDER: Record<string, number> = {
      KABA_INSAAT: 0,
      INCE_INSAAT: 1,
      BINA_GENEL: 2,
      PEYZAJ: 3,
    };
    const naturalCmp = (a: string, b: string) =>
      (a || "").localeCompare(b || "", "tr", {
        numeric: true,
        sensitivity: "base",
      });
    return [...filteredWorks].sort((a, b) => {
      const ta = TYPE_ORDER[a.constructionType ?? ""] ?? 99;
      const tb = TYPE_ORDER[b.constructionType ?? ""] ?? 99;
      if (ta !== tb) return ta - tb;
      const siteCmp = naturalCmp(a.siteName, b.siteName);
      if (siteCmp !== 0) return siteCmp;
      const ctxCmp = naturalCmp(a.contextName, b.contextName);
      if (ctxCmp !== 0) return ctxCmp;
      return naturalCmp(a.workName, b.workName);
    });
  }, [filteredWorks]);

  const selectedSiteName = useMemo(() => {
    if (siteFilter === "ALL") return null;
    return siteOptions.find((s) => s.id === siteFilter)?.name ?? null;
  }, [siteFilter, siteOptions]);

  const worksDetailGroups = useMemo(() => {
    const groups = new Map<string, { siteName: string; works: WorkAgg[] }>();
    for (const w of sortedWorks) {
      const existing = groups.get(w.siteId);
      if (existing) existing.works.push(w);
      else groups.set(w.siteId, { siteName: w.siteName, works: [w] });
    }
    return Array.from(groups.values());
  }, [sortedWorks]);

  const personnelDetailRows = useMemo(() => {
    // Group by personnel name; under each name, group works by site.
    type Row = {
      key: string;
      personnelName: string;
      company: string | null;
      workDuration: string;
      // Map site name -> ordered unique work names list
      sites: Map<string, string[]>;
    };
    const byName = new Map<string, Row>();
    for (const w of sortedWorks) {
      for (const p of w.personnelEntries) {
        const nameKey = (p.personnelName || "")
          .trim()
          .replace(/\s+/g, " ")
          .toLocaleLowerCase("tr-TR");
        if (!nameKey) continue;
        let row = byName.get(nameKey);
        if (!row) {
          row = {
            key: nameKey,
            personnelName: p.personnelName,
            company: p.company,
            workDuration: p.workDuration,
            sites: new Map(),
          };
          byName.set(nameKey, row);
        }
        const workLabel = p.workName || w.workName;
        const list = row.sites.get(w.siteName) ?? [];
        if (!list.includes(workLabel)) {
          list.push(workLabel);
          row.sites.set(w.siteName, list);
        }
      }
    }
    const rows = Array.from(byName.values()).map((r) => ({
      key: r.key,
      personnelName: r.personnelName,
      company: r.company,
      workDuration: r.workDuration,
      siteGroups: Array.from(r.sites.entries()).map(([siteName, works]) => ({
        siteName,
        works,
      })),
    }));
    rows.sort((a, b) =>
      a.personnelName.localeCompare(b.personnelName, "tr", { sensitivity: "base" })
    );
    return rows;
  }, [sortedWorks]);

  // Şantiye filtresi mevcut listede yoksa otomatik TÜMÜ'ye geç
  useEffect(() => {
    if (siteFilter !== "ALL" && !siteOptions.some((s) => s.id === siteFilter)) {
      setSiteFilter("ALL");
    }
  }, [siteOptions, siteFilter]);

  // Tarih navigasyonu
  const canGoPrev = selectedDate > MIN_PERSONNEL_DATE;
  const canGoNext = selectedDate < todayIso;
  const isToday = selectedDate === todayIso;

  const setClampedDate = (date: string) => {
    if (!date) return;
    setSelectedDate(clampPersonnelDate(date, todayIso));
  };
  const goPrev = () => {
    if (canGoPrev) setClampedDate(shiftIsoDate(selectedDate, -1));
  };
  const goNext = () => {
    if (canGoNext) setClampedDate(shiftIsoDate(selectedDate, 1));
  };

  const headerActions = (
    <>
      <button
        type="button"
        onClick={goPrev}
        disabled={!canGoPrev}
        className="inline-flex items-center justify-center min-h-[48px] min-w-[58px] px-3 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        aria-label="Önceki gün"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={!canGoNext}
        className="inline-flex items-center justify-center min-h-[48px] min-w-[58px] px-3 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        aria-label="Sonraki gün"
      >
        <ChevronRight size={22} />
      </button>
      {!isToday && (
        <button
          onClick={() => setSelectedDate(todayIso)}
          className="inline-flex items-center justify-center min-h-[48px] px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition-colors"
        >
          Bugüne dön
        </button>
      )}
      <label className="inline-flex items-center gap-2 min-h-[48px] px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-semibold">
        <CalendarDays size={18} />
        <input
          type="date"
          min={MIN_PERSONNEL_DATE}
          max={todayIso}
          value={selectedDate}
          onChange={(event) => setClampedDate(event.target.value)}
          className="bg-transparent outline-none min-h-[32px]"
          aria-label="Tarih seç"
        />
      </label>
    </>
  );

  const { isMobile } = useDevice();

  return (
    <>
      <ModalShell
        title={isMobile ? "Günlük Çalışma" : `Yapılan İşler ve Personel — ${TR_DATE(selectedDate)}`}
        onClose={onClose}
        actions={isMobile ? undefined : headerActions}
        bodyScrollLocked={!!(popupWork || detailPopup)}
      >
        <div className="space-y-2">
          {/* Mobil: tarih seçimi kendi satırında (header'da geri butonuyla sıkışmasın;
              "Bugüne dön" çıkınca yer kalsın) */}
          {isMobile && (
            <div className="flex flex-wrap items-center gap-1.5">{headerActions}</div>
          )}
          {/* Şantiye filtresi — mobilde açılır liste (parantez içinde sayılar), masaüstünde chip */}
          {siteOptions.length > 0 && (
            isMobile ? (
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-cyan-600 shrink-0" />
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  className="flex-1 min-w-0 min-h-[42px] px-3 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800"
                  aria-label="Şantiye seç"
                >
                  <option value="ALL">Tümü ({data?.works?.length ?? 0})</option>
                  {siteOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.count})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSiteFilter("ALL")}
                  className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                    siteFilter === "ALL"
                      ? "bg-cyan-600 text-white shadow"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <Building2 size={14} />
                  <span>Tümü ({data?.works?.length ?? 0})</span>
                </button>
                {siteOptions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSiteFilter(s.id)}
                    className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                      siteFilter === s.id
                        ? "bg-cyan-600 text-white shadow"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <Building2 size={14} />
                    <span>
                      {s.name} ({s.count})
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          {/* Özet */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5 text-sm">
              <button
                onClick={() => setDetailPopup("works")}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded-lg font-semibold transition-colors text-xs"
              >
                {filteredWorks.length} iş kalemi
              </button>
              <button
                onClick={() => setDetailPopup("personnel")}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-semibold transition-colors text-xs"
              >
                {filteredUniquePersonnel} personel
              </button>
            </div>
            {loading && (
              <span className="text-xs text-gray-400">Yükleniyor...</span>
            )}
          </div>

          {/* İş listesi */}
          {sortedWorks.length === 0 && !loading ? (
            <p className="text-gray-500 text-base py-8 text-center">
              Bu tarih için kayıt bulunamadı.
            </p>
          ) : (
            <div
              className={
                sortedWorks.length === 2
                  ? "grid grid-cols-1 md:grid-cols-2 gap-3"
                  : sortedWorks.length >= 3 && sortedWorks.length <= 4
                  ? "grid grid-cols-2 md:grid-cols-4 gap-3"
                  : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
              }
            >
              {sortedWorks.map((w) => {
                const photoItems: MediaItem[] = w.photos.map((p) => ({
                  id: p.id,
                  fileName: p.fileName || "",
                  fileUrl: p.url,
                  mimeType: p.mimeType,
                }));
                const kabaWorkNames = w.workNames && w.workNames.length > 0 ? w.workNames : [w.workName];
                return (
                  <div
                    key={w.key}
                    className="relative overflow-hidden border border-slate-200 rounded-2xl p-3 bg-gradient-to-br from-white via-white to-slate-50 flex flex-col min-h-[180px] shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {/* Proje — Blok */}
                    <div className={`text-[13px] font-bold leading-tight whitespace-normal break-words ${siteColor(w.siteId)}`}>
                      {w.siteName}{w.blockName && w.blockName !== "—" ? ` — ${w.blockName}` : ""}
                    </div>
                    {/* İş adı */}
                    {w.constructionType === "INCE_INSAAT" && w.blockId ? (
                      <div className="mt-1 flex-1 leading-snug flex flex-col min-h-0">
                        <button
                          onClick={() => router.push(`/dashboard/sites/${w.siteId}?autoBlock=${w.blockId}&autoType=INCE_INSAAT&inceView=daire_bazinda&returnDate=${selectedDate}`)}
                          className="text-sm font-semibold text-left text-blue-700 hover:text-blue-900 line-clamp-3 cursor-pointer bg-yellow-200 hover:bg-yellow-300 rounded-xl px-3 py-1 border border-yellow-400/60"
                        >
                          {w.workName}
                        </button>
                        <div className="text-xs text-black font-bold mt-1 leading-snug break-words">
                          {(w.daireNames && w.daireNames.length > 0 ? w.daireNames : [w.contextName]).join(", ")}
                        </div>
                      </div>
                    ) : w.constructionType === "KABA_INSAAT" && w.blockId ? (
                      <div className="mt-1 flex-1 leading-snug flex flex-col gap-1">
                        {w.contextName && w.contextName !== "—" && (
                          <div className="text-xs text-black font-bold leading-snug break-words">
                            {w.contextName}
                          </div>
                        )}
                        {kabaWorkNames.map((name) => (
                          <button
                            key={name}
                            onClick={() => router.push(`/dashboard/sites/${w.siteId}?autoBlock=${w.blockId}&autoType=KABA_INSAAT&returnDate=${selectedDate}`)}
                            className="text-sm font-semibold text-left text-blue-700 hover:text-blue-900 line-clamp-3 cursor-pointer bg-yellow-200 hover:bg-yellow-300 rounded-xl px-3 py-1 border border-yellow-400/60"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm font-semibold text-gray-800 mt-1 flex-1 leading-snug line-clamp-4">
                        {w.workName}
                      </div>
                    )}
                    {/* Aksiyon butonları */}
                    <div className="flex flex-col gap-1.5 mt-2">
                      {w.personnelCount > 0 ? (
                        <button
                          onClick={() => setPopupWork(w)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-semibold w-full justify-center"
                          title="Personel isimlerini gör"
                        >
                          <Users size={16} />
                          {w.personnelCount} kişi
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-400 text-sm font-semibold w-full justify-center">
                          <Users size={16} />0 kişi
                        </span>
                      )}
                      {photoItems.length > 0 && (
                        <button
                          onClick={() => {
                            requestPageFullscreen();
                            setViewerItems(photoItems);
                            setViewerIdx(0);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-sm font-semibold w-full justify-center"
                        >
                          <Camera size={16} />
                          {photoItems.length} fotoğraf
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ModalShell>

      {/* İş kalemi / Personel detay popup */}
      {detailPopup && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDetailPopup(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">
                {detailPopup === "works"
                  ? selectedSiteName
                    ? `${selectedSiteName} — İş Kalemleri`
                    : "Tüm Şantiyelerde İş Kalemleri"
                  : selectedSiteName
                  ? `${selectedSiteName} — Personel`
                  : "Tüm Şantiyelerde Personel"}
              </h3>
              <button
                onClick={() => setDetailPopup(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                aria-label="Kapat"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {detailPopup === "works" ? (
                <div className="space-y-4">
                  {worksDetailGroups.length === 0 ? (
                    <p className="text-gray-500 text-base py-6 text-center">İş kalemi yok.</p>
                  ) : (
                    worksDetailGroups.map((g) => (
                      <div key={g.siteName} className="space-y-2">
                        {selectedSiteName === null && (
                          <div className="text-sm font-bold text-[#1e3a5f] border-b border-gray-200 pb-1.5 mb-2">
                            {g.siteName}
                          </div>
                        )}
                        {g.works.map((w) => (
                          <div
                            key={w.key}
                            className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate">
                                {w.workName}
                              </div>
                              {w.contextName && w.contextName !== "—" && (
                                <div className="text-xs text-gray-500 truncate">
                                  {w.contextName}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {w.personnelCount > 0 && (
                                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                                  {w.personnelCount} kişi
                                </span>
                              )}
                              {w.photoCount > 0 && (
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs font-semibold">
                                  {w.photoCount} foto
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {personnelDetailRows.length === 0 ? (
                    <p className="text-gray-500 text-base py-6 text-center">
                      Personel kaydı yok.
                    </p>
                  ) : (
                    personnelDetailRows.map((row) => (
                      <div
                        key={row.key}
                        className="p-3 border border-gray-200 rounded-lg"
                      >
                        <div className="font-semibold text-gray-900">
                          {row.personnelName}
                        </div>
                        <div className="mt-1 space-y-1">
                          {row.siteGroups.map((g) => (
                            <div key={g.siteName} className="text-xs">
                              {selectedSiteName === null && (
                                <div className="font-semibold text-[#1e3a5f]">
                                  {g.siteName}
                                </div>
                              )}
                              <div className="text-gray-600 leading-snug break-words">
                                {g.works.join(" | ")}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Personel isim listesi popup */}
      {popupWork && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPopupWork(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-200">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-800 truncate">
                  {popupWork.workName}
                </h3>
                <p className="text-sm text-gray-500 truncate">
                  {popupWork.siteName} · {popupWork.contextName}
                </p>
              </div>
              <button
                onClick={() => setPopupWork(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                aria-label="Kapat"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {popupWork.personnelEntries.length === 0 ? (
                <p className="text-gray-500 text-base py-6 text-center">
                  Personel kaydı yok.
                </p>
              ) : (
                (() => {
                  type G = {
                    key: string;
                    name: string;
                    company: string | null;
                    workDuration: string;
                    date: string;
                    works: string[];
                  };
                  const byName = new Map<string, G>();
                  for (const p of popupWork.personnelEntries) {
                    const k = (p.personnelName || "")
                      .trim()
                      .replace(/\s+/g, " ")
                      .toLocaleLowerCase("tr-TR");
                    if (!k) continue;
                    let g = byName.get(k);
                    if (!g) {
                      g = {
                        key: k,
                        name: p.personnelName,
                        company: p.company,
                        workDuration: p.workDuration,
                        date: p.date,
                        works: [],
                      };
                      byName.set(k, g);
                    }
                    const wl = p.workName || popupWork.workName;
                    if (!g.works.includes(wl)) g.works.push(wl);
                  }
                  const list = Array.from(byName.values()).sort((a, b) =>
                    a.name.localeCompare(b.name, "tr", { sensitivity: "base" })
                  );
                  return list.map((g) => (
                    <div
                      key={g.key}
                      className="flex items-start justify-between gap-3 p-3 border border-gray-200 rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {g.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {g.company || "—"} · {TR_DATE(g.date)}
                        </div>
                        <div className="text-xs text-gray-700 leading-snug break-words mt-1">
                          {g.works.join(" | ")}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${
                          g.workDuration === "FULL_DAY"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {g.workDuration === "FULL_DAY" ? "Tam" : "Yarım"}
                      </span>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tam özellikli medya viewer */}
      <MediaViewer
        open={!!viewerItems && viewerItems.length > 0}
        items={viewerItems || []}
        index={viewerIdx}
        onIndexChange={setViewerIdx}
        onClose={() => setViewerItems(null)}
      />
    </>
  );
}
