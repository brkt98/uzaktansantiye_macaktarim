"use client";

import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import {
  GraduationCap,
  Search,
  RefreshCw,
  Users,
  CalendarDays,
  Wifi,
  WifiOff,
  Clock,
  Download,
  UserCheck,
} from "lucide-react";

type StudentOutside = {
  ad: string;
  soyad: string;
  departman: string;
  tip?: string;
  kart_id: string;
  son_hareket: string;
};

type DailyRow = {
  ad: string;
  soyad: string;
  departman: string;
  tarih: string;
  ilk_giris: string;
  son_cikis: string;
  toplam_giris: number;
  toplam_cikis: number;
};

type WeekItem = {
  key: string;
  label: string;
  start: string;
  end: string;
};

type WeeklyEntry = {
  ad: string;
  soyad: string;
  tarih: string;
  giris: string;
  cikis: string;
};

const TR_DAYS = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

function diffMinutes(giris: string, cikis: string): number {
  if (!giris || !cikis) return 0;
  const [gh, gm] = giris.split(":").map(Number);
  const [ch, cm] = cikis.split(":").map(Number);
  if (isNaN(gh) || isNaN(ch)) return 0;
  let mins = ch * 60 + cm - (gh * 60 + gm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

function formatDur(mins: number): string {
  if (mins <= 0) return "-";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}s ${String(m).padStart(2, "0")}dk`;
}

function todayDmy(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function isPersonel(s: StudentOutside): boolean {
  return (s.tip || "").toLocaleLowerCase("tr-TR") === "personel";
}

type ApiResponse = {
  studentsOutside: StudentOutside[];
  personnelDaily: DailyRow[];
  weeks: WeekItem[];
  weeklyData: Record<string, WeeklyEntry[]>;
  meta: {
    lastUploadAt?: string;
    outsideOgrenci?: number;
    outsidePersonel?: number;
    totalStudentsOutside?: number;
  } & Record<string, unknown>;
  syncedAt: string | null;
  online: boolean;
  error?: string;
};

const TABS = [
  { id: "students", label: "Dışarıdaki Kişiler", icon: Users },
  { id: "daily", label: "Personel Günlük", icon: CalendarDays },
  { id: "weekly", label: "Haftalık Rapor", icon: CalendarDays },
] as const;

type TabId = (typeof TABS)[number]["id"];

function formatDateTime(s: string | null): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function YurtAnkaCebeciPage() {
  const [tab, setTab] = useState<TabId>("students");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [weeklySearch, setWeeklySearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<string>("");

  const today = todayDmy();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/yurtanka/data", { cache: "no-store" });
      const json: ApiResponse = await res.json();
      if (!res.ok) {
        setError(json.error || "Veri alınamadı");
      } else {
        setError(null);
        setData(json);
        if (!selectedWeek && json.weeks?.length) {
          setSelectedWeek(json.weeks[0].key);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }, [selectedWeek]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => {
    const all = data?.studentsOutside ?? [];
    const total = data?.meta?.totalStudentsOutside ?? all.length;
    const personel = data?.meta?.outsidePersonel ?? all.filter(isPersonel).length;
    const ogrenci = data?.meta?.outsideOgrenci ?? Math.max(0, total - personel);
    return { total, personel, ogrenci };
  }, [data]);

  const filteredStudents = useMemo(() => {
    if (!data?.studentsOutside) return [];
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return data.studentsOutside;
    return data.studentsOutside.filter((s) => {
      const full = `${s.ad} ${s.soyad}`.toLocaleLowerCase("tr-TR");
      return full.includes(q) || s.departman?.toLocaleLowerCase("tr-TR").includes(q);
    });
  }, [data, search]);

  const filteredDaily = useMemo(() => {
    if (!data?.personnelDaily) return [];
    return data.personnelDaily.filter((r) => r.tarih === today);
  }, [data, today]);

  const weeklyRows = useMemo(() => {
    if (!data?.weeklyData || !selectedWeek) return [];
    const rows = data.weeklyData[selectedWeek] ?? [];
    const q = weeklySearch.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) => {
      const full = `${r.ad} ${r.soyad}`.toLocaleLowerCase("tr-TR");
      return full.includes(q);
    });
  }, [data, selectedWeek, weeklySearch]);

  const weeklyMatrix = useMemo(() => {
    if (!data?.weeks || !selectedWeek) {
      return { days: [] as Date[], dayKeys: [] as string[], people: [] as { name: string; days: Record<string, { giris: string; cikis: string }>; total: number }[], range: "" };
    }
    const week = data.weeks.find((w) => w.key === selectedWeek);
    if (!week) return { days: [], dayKeys: [], people: [], range: "" };
    const start = new Date(`${week.start}T00:00:00`);
    const days: Date[] = [];
    const dayKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      dayKeys.push(`${dd}.${mm}.${d.getFullYear()}`);
    }

    const map = new Map<string, Record<string, { giris: string; cikis: string }>>();
    for (const r of weeklyRows) {
      const name = `${r.ad} ${r.soyad}`.trim();
      if (!map.has(name)) map.set(name, {});
      map.get(name)![r.tarih] = { giris: r.giris || "", cikis: r.cikis || "" };
    }
    const people = Array.from(map.entries())
      .map(([name, d]) => {
        let total = 0;
        for (const dk of dayKeys) {
          const cell = d[dk];
          if (cell) total += diffMinutes(cell.giris, cell.cikis);
        }
        return { name, days: d, total };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

    const startD = days[0];
    const endD = days[6];
    const fmt = (x: Date) =>
      `${String(x.getDate()).padStart(2, "0")}.${String(x.getMonth() + 1).padStart(2, "0")}.${x.getFullYear()}`;
    return { days, dayKeys, people, range: `${fmt(startD)} – ${fmt(endD)}` };
  }, [data, selectedWeek, weeklyRows]);

  // Auto-pick first person when matrix loads or week changes
  useEffect(() => {
    if (weeklyMatrix.people.length === 0) {
      if (selectedPerson) setSelectedPerson("");
      return;
    }
    if (!selectedPerson || !weeklyMatrix.people.find((p) => p.name === selectedPerson)) {
      setSelectedPerson(weeklyMatrix.people[0].name);
    }
  }, [weeklyMatrix.people, selectedPerson]);

  const selectedPersonData = useMemo(
    () => weeklyMatrix.people.find((p) => p.name === selectedPerson),
    [weeklyMatrix.people, selectedPerson],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white rounded-xl p-4 sm:p-5 shadow-lg flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2.5 sm:p-3 rounded-lg">
            <GraduationCap size={24} className="sm:w-7 sm:h-7" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold">YurtAnka Cebeci</h1>
            <p className="text-xs sm:text-sm text-emerald-100">
              PDKS Öğrenci ve Personel Takibi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
              data?.online
                ? "bg-green-500/20 text-green-100"
                : "bg-red-500/20 text-red-100"
            }`}
          >
            {data?.online ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="hidden sm:inline">{data?.online ? "Bağlı" : "Bağlantı Yok"}</span>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-white/10">
            <Clock size={14} />
            <span>Son sync: {formatDateTime(data?.syncedAt ?? null)}</span>
          </div>
          <button
            onClick={load}
            className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition"
            title="Yenile"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Indicator badges (visible on web + mobile) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
            <Users size={20} />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-gray-500 font-medium uppercase">Toplam Dışarıda</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900">{counts.total}</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
            <GraduationCap size={20} />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-gray-500 font-medium uppercase">Öğrenci</div>
            <div className="text-xl sm:text-2xl font-bold text-blue-700">{counts.ogrenci}</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="bg-orange-100 text-orange-700 p-2 rounded-lg">
            <UserCheck size={20} />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-gray-500 font-medium uppercase">Personel</div>
            <div className="text-xl sm:text-2xl font-bold text-orange-700">{counts.personel}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 sm:px-5 py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition ${
                tab === t.id
                  ? "border-emerald-600 text-emerald-700 bg-emerald-50"
                  : "border-transparent text-gray-600 hover:bg-gray-50"
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-3 sm:p-4">
          {tab === "students" && (
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="İsim ara..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  />
                </div>
                <span className="text-xs sm:text-sm text-gray-600 font-medium">
                  {filteredStudents.length} kişi
                </span>
              </div>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Ad Soyad</th>
                      <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Departman</th>
                      <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Son Hareket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-8 text-gray-400">
                          Listede kayıt yok
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s, i) => (
                        <tr
                          key={`${s.kart_id}-${i}`}
                          className={i % 2 ? "bg-gray-50/60" : "bg-white"}
                        >
                          <td className="px-3 py-2 font-medium text-gray-900">
                            <div className="flex items-center gap-2">
                              <span>{`${s.ad} ${s.soyad}`.trim()}</span>
                              {isPersonel(s) && (
                                <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">P</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">
                            {s.departman || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600 font-mono text-[11px] sm:text-xs whitespace-nowrap">
                            {s.son_hareket || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "daily" && (
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="text-xs sm:text-sm text-gray-700 font-medium">
                  Bugün: <span className="font-mono">{today}</span>
                </span>
                <span className="text-xs sm:text-sm text-gray-600 ml-auto">
                  {filteredDaily.length} personel
                </span>
              </div>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Personel</th>
                      <th className="text-center px-3 py-2 font-semibold">İlk Giriş</th>
                      <th className="text-center px-3 py-2 font-semibold">Son Çıkış</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDaily.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-8 text-gray-400">
                          Bugün için kayıt yok
                        </td>
                      </tr>
                    ) : (
                      filteredDaily.map((r, i) => (
                        <tr
                          key={`${r.ad}-${r.soyad}-${i}`}
                          className={i % 2 ? "bg-gray-50/60" : "bg-white"}
                        >
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {`${r.ad} ${r.soyad}`.trim()}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs">
                            {r.ilk_giris || "—"}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs">
                            {r.son_cikis || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "weekly" && (
            <div>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
                <label className="text-xs sm:text-sm text-gray-700 font-medium">Hafta:</label>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 flex-1 min-w-[180px]"
                >
                  {(data?.weeks ?? []).length === 0 && <option value="">—</option>}
                  {(data?.weeks ?? []).map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <a
                  href={selectedWeek ? `/api/yurtanka/report?week=${encodeURIComponent(selectedWeek)}` : "#"}
                  onClick={(e) => {
                    if (!selectedWeek) e.preventDefault();
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                    selectedWeek
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                  title="Haftalık Excel raporunu indir"
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Excel İndir</span>
                </a>
              </div>

              {/* Search bar - desktop only */}
              <div className="hidden md:flex items-center gap-3 mb-3">
                <div className="relative flex-1 max-w-md">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={weeklySearch}
                    onChange={(e) => setWeeklySearch(e.target.value)}
                    placeholder="İsim ara..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <span className="text-sm text-gray-600">
                  {weeklyMatrix.people.length} kişi
                </span>
              </div>

              {/* Mobile: person dropdown + vertical day rows */}
              <div className="md:hidden">
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-xs text-gray-700 font-medium whitespace-nowrap">Personel:</label>
                  <select
                    value={selectedPerson}
                    onChange={(e) => setSelectedPerson(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    {weeklyMatrix.people.length === 0 && <option value="">—</option>}
                    {weeklyMatrix.people.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPersonData ? (
                  <div className="rounded-lg border border-[#1a1a2e] shadow overflow-hidden">
                    <div className="bg-[#1a1a2e] text-white text-center py-2 font-bold text-sm">
                      {selectedPersonData.name}
                    </div>
                    <div className="bg-[#2c3e50] text-white text-center py-1 text-[11px] italic">
                      {weeklyMatrix.range || "—"}
                    </div>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-[#1a1a2e] text-white text-xs">
                          <th className="px-2 py-2 text-left border border-[#0f0f1f]">Gün</th>
                          <th className="px-2 py-2 text-center border border-[#0f0f1f]">Giriş</th>
                          <th className="px-2 py-2 text-center border border-[#0f0f1f]">Çıkış</th>
                          <th className="px-2 py-2 text-center border border-[#0f0f1f]">Süre</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeklyMatrix.days.map((d, i) => {
                          const dk = weeklyMatrix.dayKeys[i];
                          const cell = selectedPersonData.days[dk];
                          const present = !!(cell?.giris || cell?.cikis);
                          const mins = cell ? diffMinutes(cell.giris, cell.cikis) : 0;
                          const bg = i % 2 === 0 ? "bg-white" : "bg-gray-50";
                          const cellBg = present ? bg : "bg-red-50";
                          return (
                            <tr key={i} className={cellBg}>
                              <td className="px-2 py-2 border border-gray-300">
                                <div className="font-semibold text-xs">{TR_DAYS[(d.getDay() + 6) % 7]}</div>
                                <div className="text-[10px] text-gray-500">
                                  {String(d.getDate()).padStart(2, "0")}.{String(d.getMonth() + 1).padStart(2, "0")}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-center font-mono text-xs border border-gray-300">
                                {cell?.giris || "-"}
                              </td>
                              <td className="px-2 py-2 text-center font-mono text-xs border border-gray-300">
                                {cell?.cikis || "-"}
                              </td>
                              <td className="px-2 py-2 text-center text-[11px] text-gray-700 border border-gray-300">
                                {mins > 0 ? formatDur(mins) : ""}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-emerald-50 text-emerald-800 font-bold">
                          <td colSpan={3} className="px-3 py-2 text-right border border-gray-300">
                            Toplam Süre
                          </td>
                          <td className="px-2 py-2 text-center border border-gray-300">
                            {formatDur(selectedPersonData.total)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400 border border-gray-200 rounded-lg">
                    Bu hafta için kayıt yok
                  </div>
                )}
              </div>

              {/* Desktop: matrix view */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-[#1a1a2e] shadow">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#1a1a2e] text-white">
                      <th
                        colSpan={2 + weeklyMatrix.days.length * 2}
                        className="text-center font-bold py-2.5 text-base"
                      >
                        Yurt Anka Cebeci — Haftalık Personel Raporu
                      </th>
                    </tr>
                    <tr className="bg-[#2c3e50] text-white">
                      <th
                        colSpan={2 + weeklyMatrix.days.length * 2}
                        className="text-center italic py-1.5 text-xs"
                      >
                        {weeklyMatrix.range || "—"}
                      </th>
                    </tr>
                    <tr className="bg-[#1a1a2e] text-white">
                      <th rowSpan={2} className="px-3 py-2 text-center align-middle border border-[#0f0f1f] min-w-[140px]">
                        Personel
                      </th>
                      {weeklyMatrix.days.map((d, i) => (
                        <th
                          key={i}
                          colSpan={2}
                          className="px-2 py-2 text-center border border-[#0f0f1f] font-semibold"
                        >
                          <div>{TR_DAYS[(d.getDay() + 6) % 7]}</div>
                          <div className="text-[11px] text-gray-300 font-normal">
                            {String(d.getDate()).padStart(2, "0")}.{String(d.getMonth() + 1).padStart(2, "0")}
                          </div>
                        </th>
                      ))}
                      <th rowSpan={2} className="px-3 py-2 text-center align-middle bg-emerald-700 border border-[#0f0f1f] min-w-[90px]">
                        Toplam Süre
                      </th>
                    </tr>
                    <tr className="bg-[#2c3e50] text-white text-[11px]">
                      {weeklyMatrix.days.map((_, i) => (
                        <Fragment key={i}>
                          <th className="px-2 py-1 text-center border border-[#0f0f1f] font-medium min-w-[58px]">
                            Giriş
                          </th>
                          <th className="px-2 py-1 text-center border border-[#0f0f1f] font-medium min-w-[58px]">
                            Çıkış
                          </th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyMatrix.people.length === 0 ? (
                      <tr>
                        <td
                          colSpan={2 + weeklyMatrix.days.length * 2}
                          className="text-center py-8 text-gray-400"
                        >
                          Bu hafta için kayıt yok
                        </td>
                      </tr>
                    ) : (
                      weeklyMatrix.people.map((p, i) => {
                        const bg = i % 2 === 0 ? "bg-white" : "bg-gray-50";
                        return (
                          <Fragment key={p.name}>
                            <tr className={bg}>
                              <td
                                rowSpan={2}
                                className="px-3 py-2 font-semibold text-gray-900 border border-gray-300 align-middle"
                              >
                                {p.name}
                              </td>
                              {weeklyMatrix.dayKeys.map((dk, di) => {
                                const cell = p.days[dk];
                                const present = !!(cell?.giris || cell?.cikis);
                                const cellBg = present ? "" : "bg-red-50";
                                return (
                                  <Fragment key={di}>
                                    <td className={`px-2 py-1.5 text-center font-mono text-xs border border-gray-300 ${cellBg}`}>
                                      {cell?.giris || "-"}
                                    </td>
                                    <td className={`px-2 py-1.5 text-center font-mono text-xs border border-gray-300 ${cellBg}`}>
                                      {cell?.cikis || "-"}
                                    </td>
                                  </Fragment>
                                );
                              })}
                              <td
                                rowSpan={2}
                                className="px-3 py-2 text-center font-bold bg-emerald-50 text-emerald-800 border border-gray-300 align-middle"
                              >
                                {formatDur(p.total)}
                              </td>
                            </tr>
                            <tr className={bg}>
                              {weeklyMatrix.dayKeys.map((dk, di) => {
                                const cell = p.days[dk];
                                const mins = cell ? diffMinutes(cell.giris, cell.cikis) : 0;
                                return (
                                  <td
                                    key={di}
                                    colSpan={2}
                                    className="px-2 py-1 text-center text-[11px] text-gray-600 border border-gray-300"
                                  >
                                    {mins > 0 ? formatDur(mins) : ""}
                                  </td>
                                );
                              })}
                            </tr>
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
