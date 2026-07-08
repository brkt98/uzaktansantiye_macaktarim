"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useUser } from "../layout";
import {
  getTrDayName,
  getTrMonthName,
  formatMinutesAsHours,
} from "@/lib/studyankaAttendance";
import {
  Wifi,
  WifiOff,
  Coffee,
  Users,
  Clock,
  RefreshCw,
  Monitor,
  DoorOpen,
  FileDown,
  Settings,
  ArrowLeft,
  Hash,
  Plus,
  Trash2,
  X,
  Table2,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  BarChart3,
} from "lucide-react";

interface RoomStatus {
  key: string;
  label: string;
  type: string;
  active: boolean;
  kalanSaniye: number;
  kalanText: string;
  baslangic: string;
  bitis: string;
  duration: number;
  customerName: string;
}

interface Prices {
  kabin?: { base: number; extra: number };
  toplanti?: { base: number; extra: number };
  alttoplanti?: { base: number; extra: number };
}

interface Summary {
  totalUsed?: number;
  activeCount?: number;
  completedCount?: number;
  cancelledCount?: number;
  totalRevenue?: number;
  totalHours?: number;
  kabinUsedToday?: number;
  toplantiUsedToday?: number;
}

interface TodayAttendanceRecord {
  UserID: string;
  UserName: string;
  DateKey: string;
  EntryDateTime: string;
  ExitDateTime: string | null;
  EntryTime: string;
  ExitTime: string | null;
  RecordCount: number;
}

export default function StudyankaPage() {
  const user = useUser();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [prices, setPrices] = useState<Prices>({});
  const [summary, setSummary] = useState<Summary>({});
  const [todayAttendanceRecords, setTodayAttendanceRecords] = useState<TodayAttendanceRecord[]>([]);
  const [todayAttendanceCount, setTodayAttendanceCount] = useState(0);
  const [lastAttendanceAt, setLastAttendanceAt] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [personnelDownloading, setPersonnelDownloading] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [showIdMappingModal, setShowIdMappingModal] = useState(false);
  const [showWeeklyModal, setShowWeeklyModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error"; prices?: Prices } | null>(null);
  useBodyScrollLock(!!(showPriceModal || showIdMappingModal || showWeeklyModal || toast));

  // StudyAnka erişim kontrolü
  useEffect(() => {
    if (user && !(user as any).studyankaAccess) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/studyanka/status");
      if (res.status === 403) {
        router.push("/dashboard");
        return;
      }
      if (!res.ok) throw new Error("Veri alınamadı");
      const data = await res.json();
      setRooms(data.rooms || []);
      setPrices(data.prices || {});
      setSummary(data.summary || {});
      setTodayAttendanceRecords(data.todayAttendanceRecords || []);
      setTodayAttendanceCount(data.todayAttendanceCount || 0);
      setLastAttendanceAt(data.lastAttendanceAt || null);
      setOnline(data.online || false);
      setSyncedAt(data.syncedAt);
      setError("");
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/studyanka/report");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Rapor indirilemedi");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `StudyAnka_Rapor_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Rapor indirme hatası");
    } finally {
      setDownloading(false);
    }
  };


  const handleDownloadPersonnelReport = async () => {
    setPersonnelDownloading(true);
    try {
      const res = await fetch("/api/studyanka/personnel-report");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Personel takip raporu indirilemedi");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `StudyAnka_Personel_Takip_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Personel takip raporu indirme hatası");
    } finally {
      setPersonnelDownloading(false);
    }
  };
  const handleSavePrices = async (newPrices: Prices) => {
    setSavingPrices(true);
    try {
      const res = await fetch("/api/studyanka/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPrices),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({ message: data.error || "Fiyat güncellenemedi", type: "error" });
        return;
      }
      setPrices(newPrices);
      setToast({ message: "Fiyatlar güncellendi!", type: "success", prices: newPrices });
      setShowPriceModal(false);
    } catch {
      setToast({ message: "Fiyat güncelleme hatası", type: "error" });
    } finally {
      setSavingPrices(false);
    }
  };

  if (user && !(user as any).studyankaAccess) return null;

  const kabinler = rooms.filter((r) => r.type === "kabin");
  const toplantilar = rooms.filter((r) => r.type === "toplanti" || r.type === "alttoplanti");

  const activeCount = rooms.filter((r) => r.active).length;
  const totalRooms = rooms.length;

  const formatSyncTime = (iso: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Ana Sayfaya Dön"
            className="flex items-center justify-center p-3 min-w-[48px] min-h-[48px] hover:bg-gray-100 active:bg-gray-200 rounded-xl text-gray-700 border border-gray-200 shadow-sm transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
            <Coffee size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">StudyAnka</h1>
            <p className="text-sm text-gray-500">Oda Yönetim Sistemi - Anlık Durum</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard/studyanka/adisyo"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 transition-all"
          >
            <BarChart3 size={16} />
            Adisyo
          </Link>
          <button
            onClick={handleDownloadPersonnelReport}
            disabled={personnelDownloading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            <Users size={16} />
            {personnelDownloading ? "Indiriliyor..." : "Personel Excel"}
          </button>
          <button
            onClick={() => setShowWeeklyModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-all"
          >
            <Table2 size={16} />
            Personel Tablo
          </button>
          <button
            onClick={() => setShowIdMappingModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
          >
            <Hash size={16} />
            ID Belirleme
          </button>
          <button
            onClick={handleDownloadReport}
            disabled={downloading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-all"
          >
            <FileDown size={16} />
            {downloading ? "İndiriliyor..." : "Günlük Rapor"}
          </button>
          <button
            onClick={() => setShowPriceModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-all"
          >
            <Settings size={16} />
            Fiyat Düzenle
          </button>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              online
                ? "bg-green-100 text-green-700 border border-green-200"
                : "bg-red-100 text-red-700 border border-red-200"
            }`}
          >
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            {online ? "Çevrimiçi" : "Çevrimdışı"}
          </div>
          <span className="text-xs text-gray-400">
            Son güncelleme: {formatSyncTime(syncedAt)}
          </span>
          <button
            onClick={fetchStatus}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            title="Yenile"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-500 border-t-transparent"></div>
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-20">
          <Monitor size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-500">Henüz veri yok</h3>
          <p className="text-sm text-gray-400 mt-1">
            PLC sistemi henüz veri göndermedi. Sistem bağlantısını kontrol edin.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              icon={DoorOpen}
              label="Aktif Oda"
              value={`${activeCount} / ${totalRooms}`}
              color="blue"
            />
            <SummaryCard
              icon={Users}
              label="Bugün Toplam"
              value={`${summary.totalUsed ?? 0}`}
              color="green"
            />
            <SummaryCard
              icon={DoorOpen}
              label="Bugün Kabin"
              value={`${summary.kabinUsedToday ?? 0}`}
              color="purple"
            />
            <SummaryCard
              icon={Users}
              label="Bugün Toplantı Odası"
              value={`${summary.toplantiUsedToday ?? 0}`}
              color="amber"
            />
          </div>

          <TodayAttendanceCard
            records={todayAttendanceRecords}
            count={todayAttendanceCount}
            lastAttendanceAt={lastAttendanceAt}
          />

          {/* Kabinler */}
          <RoomSection title="Kabinler" rooms={kabinler} compact />

          {/* Toplantı Odaları */}
          <RoomSection title="Toplantı Odaları" rooms={toplantilar} compact singleRow />

          {/* Fiyat Bilgisi */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Fiyat Tablosu
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PriceCard label="Kabin" base={prices.kabin?.base} extra={prices.kabin?.extra} />
              <PriceCard label="Toplantı Odası" base={prices.toplanti?.base} extra={prices.toplanti?.extra} />
            </div>
          </div>
        </>
      )}

      {showPriceModal && (
        <PriceEditModal
          prices={prices}
          onClose={() => setShowPriceModal(false)}
          onSave={handleSavePrices}
          saving={savingPrices}
        />
      )}

      {showIdMappingModal && (
        <IdMappingModal onClose={() => setShowIdMappingModal(false)} />
      )}

      {showWeeklyModal && (
        <WeeklyTableModal onClose={() => setShowWeeklyModal(false)} />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          prices={toast.prices}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function TodayAttendanceCard({
  records,
  count,
  lastAttendanceAt,
}: {
  records: TodayAttendanceRecord[];
  count: number;
  lastAttendanceAt: string | null;
}) {
  const formatTime = (value: string | null) => {
    if (!value) return "-";
    return value.includes(" ") ? value.slice(11, 19) : value;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <h3 className="text-base font-bold text-gray-700 uppercase tracking-wider">
          Bugünkü Personel Girişleri
        </h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-bold text-gray-800">Bugün {count} personel</span>
          {lastAttendanceAt && (
            <span className="text-gray-400">Son giriş: {formatTime(lastAttendanceAt)}</span>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-gray-400">Bugün personel girişi yok</p>
      ) : (
        <div className="max-h-40 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            {records.map((record, index) => (
              <div
                key={`${record.UserID}-${record.DateKey}-${index}`}
                className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900 min-w-[180px]"
              >
                <div className="font-bold">{record.UserName || "Yok"} ({record.UserID})</div>
                <div className="mt-1 font-medium">Giriş: {formatTime(record.EntryTime || record.EntryDateTime)}</div>
                <div className="font-medium">Çıkış: {formatTime(record.ExitTime || record.ExitDateTime)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  customIcon,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  color: string;
  customIcon?: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-green-50 text-green-600 border-green-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
  };
  const iconColorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    amber: "bg-amber-100 text-amber-600",
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColorMap[color]}`}>
          {customIcon ? customIcon : Icon ? <Icon size={20} /> : null}
        </div>
        <div>
          <p className="text-xs font-medium opacity-70">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function RoomSection({
  title,
  rooms,
  compact,
  singleRow,
}: {
  title: string;
  rooms: RoomStatus[];
  compact?: boolean;
  singleRow?: boolean;
}) {
  if (rooms.length === 0) return null;
  const activeCount = rooms.filter((r) => r.active).length;

  const gridClass = singleRow
    ? "grid grid-cols-4 sm:grid-cols-8 gap-2"
    : compact
      ? "grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-2"
      : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-700 uppercase tracking-wider">
          {title}
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-extrabold text-gray-800">{activeCount}</span>
          <span className="text-sm text-gray-400">aktif /</span>
          <span className="text-lg font-extrabold text-gray-800">{rooms.length}</span>
          <span className="text-sm text-gray-400">toplam</span>
        </div>
      </div>
      <div className={gridClass}>
        {rooms.map((room) => (
          <RoomCard key={room.key} room={room} compact={compact || singleRow} />
        ))}
      </div>
    </div>
  );
}

function RoomCard({ room, compact }: { room: RoomStatus; compact?: boolean }) {
  const isLow = room.active && room.kalanSaniye > 0 && room.kalanSaniye < 600; // < 10 dk

  const shortLabel = room.label
    .replace("Alt Toplantı ", "AT")
    .replace("Toplantı ", "T")
    .replace("Kabin ", "K");

  if (compact) {
    return (
      <div
        className={`rounded-lg border-2 p-2 transition-all text-center min-h-[68px] flex flex-col ${
          room.active
            ? isLow
              ? "border-red-300 bg-red-50"
              : "border-green-300 bg-green-50"
            : "border-gray-200 bg-gray-50"
        }`}
        title={room.active ? `${room.customerName || room.label} - ${room.kalanText}\n${room.baslangic} → ${room.bitis}` : room.label}
      >
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-xs font-bold ${room.active ? (isLow ? "text-red-700" : "text-green-700") : "text-gray-400"}`}>
            {shortLabel}
          </span>
        </div>
        <div className="flex-1 flex flex-col justify-center">
          {room.active ? (
            <>
              <div className={`text-base font-extrabold font-mono ${isLow ? "text-red-600" : "text-green-600"}`}>
                {room.kalanText}
              </div>
              {room.customerName && (
                <p className="text-xs font-bold text-gray-600 truncate mt-0.5">{room.customerName}</p>
              )}
            </>
          ) : (
            <p className="text-[10px] text-gray-300">—</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border-2 p-3.5 transition-all ${
        room.active
          ? isLow
            ? "border-red-300 bg-red-50 shadow-md"
            : "border-green-300 bg-green-50 shadow-md"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-bold ${room.active ? (isLow ? "text-red-700" : "text-green-700") : "text-gray-400"}`}>
          {room.label}
        </span>
      </div>
      {room.active ? (
        <div className="space-y-1.5">
          <div className={`text-2xl font-extrabold font-mono ${isLow ? "text-red-600" : "text-green-600"}`}>
            {room.kalanText}
          </div>
          {room.customerName && (
            <p className="text-sm font-bold text-gray-600 truncate" title={room.customerName}>
              👤 {room.customerName}
            </p>
          )}
          <div className="text-[10px] text-gray-400 space-y-0.5">
            <p>Başlangıç: {room.baslangic}</p>
            <p>Bitiş: {room.bitis}</p>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-gray-300">—</p>
      )}
    </div>
  );
}

function Toast({
  message,
  type,
  prices,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  prices?: Prices;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const isSuccess = type === "success";

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200 border-2 ${
          isSuccess ? "border-green-300" : "border-red-300"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
              isSuccess ? "bg-green-100" : "bg-red-100"
            }`}
          >
            <span className="text-3xl">{isSuccess ? "✓" : "✕"}</span>
          </div>
          <h3 className={`text-lg font-bold mb-2 ${isSuccess ? "text-green-700" : "text-red-700"}`}>
            {message}
          </h3>
          {isSuccess && prices && (
            <div className="w-full mt-3 space-y-2">
              <div className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2.5">
                <span className="text-sm font-medium text-gray-600">Kabin</span>
                <span className="text-sm font-bold text-gray-800">
                  {prices.kabin?.base} ₺ baz / +{prices.kabin?.extra} ₺ ek saat
                </span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2.5">
                <span className="text-sm font-medium text-gray-600">Toplantı</span>
                <span className="text-sm font-bold text-gray-800">
                  {prices.toplanti?.base} ₺ baz / +{prices.toplanti?.extra} ₺ ek saat
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                PLC birkaç saniye içinde güncellenecek.
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className={`mt-5 px-8 py-2.5 rounded-xl text-sm font-semibold text-white transition-all ${
              isSuccess ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceEditModal({
  prices,
  onClose,
  onSave,
  saving,
}: {
  prices: Prices;
  onClose: () => void;
  onSave: (newPrices: Prices) => void;
  saving: boolean;
}) {
  const [kabinBase, setKabinBase] = useState(prices.kabin?.base ?? 150);
  const [kabinExtra, setKabinExtra] = useState(prices.kabin?.extra ?? 50);
  const [toplantiBase, setToplantiBase] = useState(prices.toplanti?.base ?? 450);
  const [toplantiExtra, setToplantiExtra] = useState(prices.toplanti?.extra ?? 150);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Fiyat Düzenle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
        </div>

        <div className="space-y-5">
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="text-base font-bold text-gray-700 mb-4">Kabin</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600 mb-2 block">3 Saatlik Baz (₺)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setKabinBase(Math.max(0, kabinBase - 10))}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl font-bold transition-all"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={kabinBase}
                    onChange={(e) => setKabinBase(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base font-semibold text-center focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setKabinBase(kabinBase + 10)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl font-bold transition-all"
                  >+</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 mb-2 block">Ek Saat (₺)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setKabinExtra(Math.max(0, kabinExtra - 10))}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl font-bold transition-all"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={kabinExtra}
                    onChange={(e) => setKabinExtra(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base font-semibold text-center focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setKabinExtra(kabinExtra + 10)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl font-bold transition-all"
                  >+</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="text-base font-bold text-gray-700 mb-4">Toplantı Odası</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600 mb-2 block">3 Saatlik Baz (₺)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setToplantiBase(Math.max(0, toplantiBase - 10))}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl font-bold transition-all"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={toplantiBase}
                    onChange={(e) => setToplantiBase(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base font-semibold text-center focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setToplantiBase(toplantiBase + 10)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl font-bold transition-all"
                  >+</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 mb-2 block">Ek Saat (₺)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setToplantiExtra(Math.max(0, toplantiExtra - 10))}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl font-bold transition-all"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={toplantiExtra}
                    onChange={(e) => setToplantiExtra(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base font-semibold text-center focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setToplantiExtra(toplantiExtra + 10)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl font-bold transition-all"
                  >+</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-7">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-base font-semibold text-gray-700 hover:bg-gray-50 transition-all"
          >
            İptal
          </button>
          <button
            onClick={() =>
              onSave({
                kabin: { base: kabinBase, extra: kabinExtra },
                toplanti: { base: toplantiBase, extra: toplantiExtra },
                alttoplanti: { base: toplantiBase, extra: toplantiExtra },
              })
            }
            disabled={saving}
            className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-xl text-base font-semibold hover:bg-amber-700 disabled:opacity-50 transition-all"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceCard({
  label,
  base,
  extra,
}: {
  label: string;
  base?: number;
  extra?: number;
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
      <p className="text-sm font-semibold text-amber-800">{label}</p>
      <p className="text-lg font-bold text-amber-600 mt-1">{base ?? "-"} ₺</p>
      <p className="text-xs text-amber-500">+ {extra ?? "-"} ₺ / ek saat</p>
    </div>
  );
}

function IdMappingModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/studyanka/user-ids")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.mappings)) {
          setRows(data.mappings);
        } else {
          setLoadError("Veriler yüklenemedi");
        }
      })
      .catch(() => setLoadError("Bağlantı hatası"));
  }, []);

  const handleChange = (index: number, field: "id" | "name", value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setSaved(false);
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, { id: "", name: "" }]);
    setSaved(false);
  };

  const handleDeleteRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/studyanka/user-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: rows }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Kayıt hatası");
        return;
      }
      setSaved(true);
    } catch {
      alert("Kayıt sırasında hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Hash size={18} className="text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">ID Belirleme</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_1fr_40px] gap-2 mb-2 px-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kullanıcı ID</span>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kullanıcı Adı</span>
              <span />
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_40px] gap-2 items-center">
                  <input
                    type="text"
                    value={row.id}
                    onChange={(e) => handleChange(index, "id", e.target.value)}
                    placeholder="örn. 5"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  />
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => handleChange(index, "name", e.target.value)}
                    placeholder="Ad Soyad"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  />
                  <button
                    onClick={() => handleDeleteRow(index)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Sil"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddRow}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-indigo-300 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <Plus size={15} />
              Satır Ekle
            </button>

            <div className="flex gap-3 mt-5">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
              >
                {saved ? "Kapat" : "İptal"}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all"
              >
                {saving ? "Kaydediliyor..." : saved ? "✓ Kaydedildi" : "Kaydet"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface WeeklyDayCell {
  hasRecord: boolean;
  entryTime: string | null;
  exitTime: string | null;
  durationMinutes: number | null;
}

interface WeeklyPersonRow {
  userId: string;
  userName: string;
  days: WeeklyDayCell[];
  totalMinutes: number;
}

interface WeeklyWeek {
  weekStartKey: string; // "YYYY/MM/DD" (Pazartesi)
  weekStart: string; // ISO
  weekEnd: string; // ISO
  rows: WeeklyPersonRow[];
}

// "YYYY/MM/DD" -> UTC Date (gün ekleme için)
function weekKeyToDate(key: string, addDays = 0): Date {
  const [y, m, d] = key.split("/").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  if (addDays) date.setUTCDate(date.getUTCDate() + addDays);
  return date;
}

function formatDdMmYyyy(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}.${m}.${date.getUTCFullYear()}`;
}

// Hafta aralığı etiketi: "04.05.2026 – 10.05.2026"
function weekRangeLabel(week: WeeklyWeek): string {
  const start = weekKeyToDate(week.weekStartKey);
  const end = weekKeyToDate(week.weekStartKey, 6);
  return `${formatDdMmYyyy(start)} – ${formatDdMmYyyy(end)}`;
}

// Gün başlığı: "4 Mayıs 2026 Pazartesi"
function dayHeaderLabel(weekStartKey: string, dayIndex: number): string {
  const date = weekKeyToDate(weekStartKey, dayIndex);
  return `${date.getUTCDate()} ${getTrMonthName(date.getUTCMonth())} ${date.getUTCFullYear()} ${getTrDayName(dayIndex)}`;
}

function WeeklyTableModal({ onClose }: { onClose: () => void }) {
  const [weeks, setWeeks] = useState<WeeklyWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0); // 0 = en güncel hafta

  useEffect(() => {
    let active = true;
    fetch("/api/studyanka/weekly-report")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Veriler yüklenemedi");
        }
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setWeeks(Array.isArray(data.weeks) ? data.weeks : []);
      })
      .catch((err) => {
        if (active) setError(err.message || "Bağlantı hatası");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // weeks yeniden eskiye sıralı: index arttıkça eski hafta.
  const week = weeks[selectedIndex];
  const canNewer = selectedIndex > 0; // Sonraki (daha yeni) hafta
  const canOlder = selectedIndex < weeks.length - 1; // Önceki (daha eski) hafta

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col p-6 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
              <Table2 size={18} className="text-teal-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Haftalık Personel Tablosu</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-500 border-t-transparent"></div>
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-10 text-center">{error}</p>
        ) : weeks.length === 0 || !week ? (
          <p className="text-sm text-gray-400 py-10 text-center">Henüz haftalık çalışma verisi yok.</p>
        ) : (
          <>
            {/* Hafta seçimi + gezinme */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIndex((i) => Math.min(weeks.length - 1, i + 1))}
                  disabled={!canOlder}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title="Önceki hafta"
                >
                  <ChevronLeft size={16} />
                  Önceki Hafta
                </button>
                <button
                  onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                  disabled={!canNewer}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title="Sonraki hafta"
                >
                  Sonraki Hafta
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <CalendarRange size={18} className="text-teal-600" />
                <select
                  value={selectedIndex}
                  onChange={(e) => setSelectedIndex(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 focus:ring-teal-400 focus:border-teal-400 outline-none bg-white"
                >
                  {weeks.map((w, i) => (
                    <option key={w.weekStartKey} value={i}>
                      {weekRangeLabel(w)}
                      {i === 0 ? " (Bu hafta)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tablo */}
            <div className="overflow-auto rounded-xl border border-gray-200">
              <table className="border-collapse text-center text-xs sm:text-sm min-w-full">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-10 bg-gray-800 text-white font-bold px-3 py-2 border border-gray-300 whitespace-nowrap"
                    >
                      Personel
                    </th>
                    {Array.from({ length: 7 }, (_, d) => (
                      <th
                        key={d}
                        colSpan={2}
                        className="bg-emerald-500 text-white font-semibold px-2 py-1.5 border border-gray-300 whitespace-nowrap"
                      >
                        {dayHeaderLabel(week.weekStartKey, d)}
                      </th>
                    ))}
                    <th
                      rowSpan={2}
                      className="bg-emerald-800 text-white font-bold px-3 py-2 border border-gray-300 whitespace-nowrap"
                    >
                      Haftalık Toplam
                    </th>
                  </tr>
                  <tr>
                    {Array.from({ length: 7 }, (_, d) => (
                      <Fragment key={d}>
                        <th className="bg-emerald-100 text-gray-700 font-semibold px-2 py-1 border border-gray-300">
                          Giriş
                        </th>
                        <th className="bg-emerald-100 text-gray-700 font-semibold px-2 py-1 border border-gray-300">
                          Çıkış
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {week.rows.map((person) => (
                    <Fragment key={person.userId}>
                      <tr>
                        <td
                          rowSpan={2}
                          className="sticky left-0 z-10 bg-gray-50 font-bold text-gray-800 px-3 py-1.5 border border-gray-300 whitespace-nowrap"
                        >
                          {person.userName}
                        </td>
                        {person.days.map((day, d) =>
                          day.hasRecord ? (
                            <Fragment key={d}>
                              <td className="px-2 py-1.5 border border-gray-300 text-gray-700">
                                {day.entryTime ?? "-"}
                              </td>
                              <td className="px-2 py-1.5 border border-gray-300 text-gray-700">
                                {day.exitTime ?? "-"}
                              </td>
                            </Fragment>
                          ) : (
                            <td
                              key={d}
                              colSpan={2}
                              rowSpan={2}
                              className="px-2 py-1.5 border border-gray-300 bg-amber-50 text-amber-700 font-semibold italic"
                            >
                              İzin
                            </td>
                          ),
                        )}
                        <td
                          rowSpan={2}
                          className="px-3 py-1.5 border border-gray-300 bg-emerald-50 text-emerald-800 font-bold text-sm whitespace-nowrap"
                        >
                          {formatMinutesAsHours(person.totalMinutes)}
                        </td>
                      </tr>
                      <tr>
                        {person.days.map((day, d) =>
                          day.hasRecord ? (
                            <td
                              key={d}
                              colSpan={2}
                              className="px-2 py-1.5 border border-gray-300 bg-gray-50 font-semibold text-gray-600"
                            >
                              {day.durationMinutes !== null
                                ? formatMinutesAsHours(day.durationMinutes)
                                : "-"}
                            </td>
                          ) : null,
                        )}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-400 mt-3">
              Üst satır giriş/çıkış saatleri, alt satır o günkü çalışma süresidir. İzinli günler
              &quot;İzin&quot; olarak gösterilir.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
