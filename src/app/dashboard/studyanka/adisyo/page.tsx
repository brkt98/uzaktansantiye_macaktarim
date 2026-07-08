"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../layout";
import {
  ArrowLeft,
  BarChart3,
  RefreshCw,
  TrendingUp,
  CalendarDays,
  ShoppingBag,
  Receipt,
  XCircle,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ==================== Tipler ====================

interface StatsResponse {
  range: { start: string; end: string };
  today: string;
  todayRevenue: number;
  monthRevenue: number;
  rangeRevenue: number;
  todayOrderCount: number;
  rangeOrderCount: number;
  avgTicket: number;
  cancelledCount: number;
  hourly: { hour: string; revenue: number; orders: number }[];
  rangeDaily: { date: string; revenue: number; orders: number }[];
  heatmap: { revenue: number[][]; orders: number[][] };
  paymentBreakdown: { name: string; amount: number }[];
  orderTypeBreakdown: { type: string; revenue: number; orders: number }[];
  categoryBreakdown: { category: string; quantity: number; revenue: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  revenueByWaiter: { waiter: string; revenue: number; orders: number }[];
  syncedAt: string;
  syncError: string | null;
}

// ==================== Tarih yardımcıları (İstanbul) ====================

function istKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function monthStartKey(): string {
  return `${istKey().slice(0, 7)}-01`;
}

function weekStartKey(): string {
  const [y, m, d] = istKey().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const offset = (dt.getUTCDay() + 6) % 7; // Pazartesi başlangıç
  dt.setUTCDate(dt.getUTCDate() - offset);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// ==================== Format ====================

const tl0 = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const tl2 = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("tr-TR");

function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}.${m}`;
}

const PIE_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

// ==================== Sayfa ====================

export default function AdisyoStatsPage() {
  const user = useUser();
  const router = useRouter();

  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [start, setStart] = useState(monthStartKey());
  const [end, setEnd] = useState(istKey());

  // Erişim kontrolü
  useEffect(() => {
    if (user && !(user as { studyankaAccess?: boolean }).studyankaAccess) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const fetchStats = useCallback(
    async (s: string, e: string, silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/adisyo/stats?start=${s}&end=${e}`);
        if (res.status === 403) {
          router.push("/dashboard");
          return;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Veri alınamadı");
        setData(json);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bağlantı hatası");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router]
  );

  useEffect(() => {
    fetchStats(start, end);
    // "Bugün" verisi için periyodik sessiz yenileme
    const interval = setInterval(() => fetchStats(start, end, true), 30000);
    return () => clearInterval(interval);
  }, [fetchStats, start, end]);

  const applyQuick = (s: string, e: string) => {
    setStart(s);
    setEnd(e);
  };

  if (user && !(user as { studyankaAccess?: boolean }).studyankaAccess) return null;

  const formatSyncTime = (iso: string | null) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const today = istKey();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/studyanka"
            aria-label="StudyAnka'ya Dön"
            className="flex items-center justify-center p-3 min-w-[48px] min-h-[48px] hover:bg-gray-100 active:bg-gray-200 rounded-xl text-gray-700 border border-gray-200 shadow-sm transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
            <BarChart3 size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Adisyo İstatistikleri</h1>
            <p className="text-sm text-gray-500">StudyAnka Kafe - Ciro & Sipariş Analizi</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Son güncelleme: {formatSyncTime(data?.syncedAt ?? null)}</span>
          <button
            onClick={() => fetchStats(start, end)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            title="Yenile"
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Tarih aralığı */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Başlangıç</label>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bitiş</label>
            <input
              type="date"
              value={end}
              max={today}
              onChange={(e) => setEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <QuickBtn label="Bugün" onClick={() => applyQuick(today, today)} active={start === today && end === today} />
          <QuickBtn
            label="Bu Hafta"
            onClick={() => applyQuick(weekStartKey(), today)}
            active={start === weekStartKey() && end === today}
          />
          <QuickBtn
            label="Bu Ay"
            onClick={() => applyQuick(monthStartKey(), today)}
            active={start === monthStartKey() && end === today}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}
      {data?.syncError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-sm">
          Adisyo senkron uyarısı: {data.syncError} (gösterilen veriler son başarılı senkrona ait olabilir)
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-rose-500 border-t-transparent"></div>
        </div>
      ) : !data ? (
        <div className="text-center py-20">
          <BarChart3 size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-500">Veri yok</h3>
        </div>
      ) : (
        <>
          {/* Özet kartları */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard icon={TrendingUp} color="rose" label="Günlük Ciro" value={tl0.format(data.todayRevenue)} />
            <SummaryCard icon={CalendarDays} color="blue" label="Aylık Ciro" value={tl0.format(data.monthRevenue)} />
            <SummaryCard icon={Wallet} color="green" label="Aralık Cirosu" value={tl0.format(data.rangeRevenue)} />
            <SummaryCard icon={ShoppingBag} color="indigo" label="Toplam Sipariş" value={num.format(data.rangeOrderCount)} />
            <SummaryCard icon={Receipt} color="amber" label="Ort. Adisyo" value={tl0.format(data.avgTicket)} />
            <SummaryCard icon={XCircle} color="gray" label="İptal" value={num.format(data.cancelledCount)} />
          </div>

          {/* Saatlik ciro (bugün) */}
          <ChartCard title="Bugünkü Saatlik Ciro" subtitle={`Bugün toplam ${num.format(data.todayOrderCount)} sipariş`}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hour" fontSize={11} interval={1} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => tl0.format(v)} />
                <Tooltip
                  formatter={(v) => [tl2.format(Number(v)), "Ciro"]}
                  labelFormatter={(l) => `Saat ${l}`}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Bar dataKey="revenue" fill="#e11d48" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Günlük ciro trendi */}
          {data.rangeDaily.length > 1 && (
            <ChartCard title="Günlük Ciro Trendi" subtitle={`${shortDate(data.range.start)} – ${shortDate(data.range.end)}`}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.rangeDaily}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" fontSize={11} tickFormatter={shortDate} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => tl0.format(v)} />
                  <Tooltip
                    formatter={(v) => [tl2.format(Number(v)), "Ciro"]}
                    labelFormatter={(l) => `Tarih: ${l}`}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Ödeme tipi + Isı haritası (yan yana) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Ödeme Tipi Dağılımı">
              {data.paymentBreakdown.length === 0 ? (
                <EmptyMini />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={data.paymentBreakdown}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(e) => e.name}
                      fontSize={11}
                    >
                      {data.paymentBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => tl2.format(Number(v))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend fontSize={11} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Yoğunluk Isı Haritası" subtitle="Gün ve saate göre ciro — koyu = daha yüksek">
              <Heatmap revenue={data.heatmap.revenue} orders={data.heatmap.orders} />
            </ChartCard>
          </div>

          {/* Kategori bazlı satış */}
          <ChartCard title="Kategori Bazlı Satış" subtitle="Hangi kategori daha çok ciro getiriyor">
            {data.categoryBreakdown.length === 0 ? (
              <EmptyMini />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, data.categoryBreakdown.length * 34)}>
                <BarChart data={data.categoryBreakdown} layout="vertical" margin={{ left: 30, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => tl0.format(v)} />
                  <YAxis type="category" dataKey="category" width={130} fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v, _n, item) => [
                      `${tl2.format(Number(v))} · ${num.format(Number(item?.payload?.quantity ?? 0))} adet`,
                      "Ciro",
                    ]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {data.categoryBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* En çok satanlar */}
          <TableCard
            title="En Çok Satan Ürünler"
            head={["Ürün", "Adet", "Ciro"]}
            rows={data.topProducts.map((p) => [p.name, num.format(p.quantity), tl0.format(p.revenue)])}
            align={["left", "right", "right"]}
          />
        </>
      )}
    </div>
  );
}

// ==================== Alt bileşenler ====================

const DAY_NAMES = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function Heatmap({ revenue, orders }: { revenue: number[][]; orders: number[][] }) {
  // Yalnızca aktivite olan saat aralığını göster (boş gece saatlerini gizle).
  const [sel, setSel] = useState<{ d: number; h: number; rev: number; cnt: number } | null>(null);
  let minH = 24;
  let maxH = -1;
  let max = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const c = orders[d]?.[h] ?? 0;
      if (c > 0) {
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
      max = Math.max(max, revenue[d]?.[h] ?? 0);
    }
  }
  if (maxH < 0) return <EmptyMini />;

  const hours: number[] = [];
  for (let h = minH; h <= maxH; h++) hours.push(h);
  const alpha = (v: number) => (max > 0 && v > 0 ? 0.1 + 0.9 * (v / max) : 0);

  return (
    <div>
      {/* Seçilen hücre detayı (mobilde dokununca, masaüstünde tıklayınca/hover) */}
      <div className="mb-2 h-5 text-sm">
        {sel ? (
          <span className="text-gray-700">
            <b>
              {DAY_NAMES[sel.d]} {String(sel.h).padStart(2, "0")}:00
            </b>{" "}
            — {tl0.format(sel.rev)} · {num.format(sel.cnt)} sipariş
          </span>
        ) : (
          <span className="text-gray-400 text-xs">Bir kareye dokun/tıkla → detayı gör</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-[3px]"
          style={{ gridTemplateColumns: `auto repeat(${hours.length}, minmax(28px, 1fr))` }}
        >
          <div />
          {hours.map((h) => (
            <div key={h} className="text-[10px] text-gray-400 text-center pb-1">
              {String(h).padStart(2, "0")}
            </div>
          ))}
          {DAY_NAMES.map((dn, d) => (
            <Fragment key={dn}>
              <div className="text-[11px] font-medium text-gray-500 pr-2 flex items-center justify-end">{dn}</div>
              {hours.map((h) => {
                const rev = revenue[d]?.[h] ?? 0;
                const cnt = orders[d]?.[h] ?? 0;
                const isSel = sel?.d === d && sel?.h === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setSel({ d, h, rev, cnt })}
                    title={`${dn} ${String(h).padStart(2, "0")}:00 — ${tl0.format(rev)} · ${num.format(cnt)} sipariş`}
                    className={`h-7 rounded-[4px] cursor-pointer transition-shadow ${
                      isSel ? "ring-2 ring-gray-800 ring-offset-1" : ""
                    }`}
                    style={{ background: rev > 0 ? `rgba(225,29,72,${alpha(rev)})` : "#f3f4f6" }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-gray-400">
        <span>Az yoğun</span>
        <div className="flex gap-[2px]">
          {[0.15, 0.35, 0.55, 0.75, 0.95].map((a) => (
            <div key={a} className="w-6 h-3 rounded-sm" style={{ background: `rgba(225,29,72,${a})` }} />
          ))}
        </div>
        <span>Çok yoğun</span>
      </div>
    </div>
  );
}

function QuickBtn({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
        active
          ? "bg-rose-600 text-white border-rose-600"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

const COLOR_MAP: Record<string, string> = {
  rose: "bg-rose-50 text-rose-600 border-rose-100",
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  green: "bg-green-50 text-green-600 border-green-100",
  indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
  gray: "bg-gray-50 text-gray-600 border-gray-100",
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${COLOR_MAP[color] ?? COLOR_MAP.gray}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium opacity-70 truncate">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyMini() {
  return <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">Bu aralıkta veri yok</div>;
}

function TableCard({
  title,
  head,
  rows,
  align,
}: {
  title: string;
  head: string[];
  rows: string[][];
  align: ("left" | "right")[];
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <EmptyMini />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                {head.map((h, i) => (
                  <th key={h} className={`py-2 font-medium ${align[i] === "right" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-gray-50 last:border-0">
                  {r.map((c, ci) => (
                    <td
                      key={ci}
                      className={`py-2 ${align[ci] === "right" ? "text-right tabular-nums" : "text-left"} ${
                        ci === 0 ? "font-medium text-gray-700" : "text-gray-600"
                      }`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
