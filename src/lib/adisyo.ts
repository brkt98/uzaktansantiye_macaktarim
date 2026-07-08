// Adisyo REST API istemcisi + istatistik aggregasyon yardımcıları.
//
// Kimlik: her istekte x-api-key / x-api-secret / x-api-consumer header'ları gönderilir
// (Adisyo > Restoran Ayarları > Entegrasyon'dan alınır, .env'e konur).
// Base URL: https://ext.adisyo.com/api/External/v2
//
// Önemli: /CompletedOrders 40 sn'de 1 çağrılabilir ve sayfa başı max 100 sipariş döner.
// Bu yüzden veriyi AdisyoOrder (DB ayna) tablosuna yazarız; panel hep aynadan okur.

import type { Prisma } from "@prisma/client";
import { categoryForProduct } from "./adisyoCategories";

// İstanbul yıl boyunca sabit +03:00 (2016'dan beri DST yok) — TZ matematiğini basitleştirir.
const IST_OFFSET = "+03:00";

const BASE_URL = (process.env.ADISYO_API_BASE_URL || "https://ext.adisyo.com/api/External/v2").replace(/\/$/, "");

// ==================== Tipler (Adisyo yanıt şeması — kısmi) ====================

export interface AdisyoApiProduct {
  id?: number;
  productId?: number; // /Products ile kategori eşlemesi için
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  categoryName?: string | null;
}

export interface AdisyoApiPayment {
  paymentTypeId?: number;
  paymentName?: string | null;
  amount?: number;
  isMealCard?: boolean;
}

export interface AdisyoApiOrder {
  id: number;
  orderTotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  insertDate?: string; // sipariş seviyesi: yerel TR saati (ör. "2023-08-18T14:10:52.11")
  updateDate?: string;
  orderType?: string | null;
  orderTypeId?: number;
  status?: string | null;
  statusId?: number;
  orderCancelReason?: string | null;
  tableName?: string | null;
  orderNumber?: number;
  waiterName?: string | null;
  products?: AdisyoApiProduct[];
  payments?: AdisyoApiPayment[];
}

interface CompletedOrdersResponse {
  orders?: AdisyoApiOrder[];
  totalCount?: number;
  pageCount?: number;
  status?: number;
  message?: string;
}

// ==================== Hata yönetimi ====================

const STATUS_MESSAGES: Record<number, string> = {
  600: "Consumer alanı boş olamaz",
  601: "İstek limiti aşıldı (rate limit)",
  800: "Restoranın paket süresi dolmuş",
  901: "API Key bilgisi hatalı",
  902: "API Secret bilgisi hatalı",
  754: "Sipariş bulunamadı",
};

export class AdisyoError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AdisyoError";
    this.status = status;
  }
}

function requireCredentials() {
  const key = process.env.ADISYO_API_KEY;
  const secret = process.env.ADISYO_API_SECRET;
  const consumer = process.env.ADISYO_API_CONSUMER;
  if (!key || !secret || !consumer) {
    throw new AdisyoError(
      "Adisyo kimlik bilgileri eksik. .env içine ADISYO_API_KEY / ADISYO_API_SECRET / ADISYO_API_CONSUMER ekleyin."
    );
  }
  return { key, secret, consumer };
}

// ==================== Düşük seviye fetch ====================

async function adisyoFetch<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const { key, secret, consumer } = requireCredentials();
  const url = new URL(BASE_URL + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": key,
        "x-api-secret": secret,
        "x-api-consumer": consumer,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new AdisyoError(`Adisyo'ya bağlanılamadı: ${e instanceof Error ? e.message : "bilinmeyen hata"}`);
  }

  // ÖNEMLİ: Adisyo rate-limit'i HTTP 400 + gövdede {"status":601} olarak döndürür.
  // Bu yüzden !res.ok olsa bile önce gövdeyi okuyup status alanına bakarız;
  // böylece 601 (rate limit) gerçek HTTP hatasından ayırt edilir.
  let json: (T & { status?: number; message?: string }) | null = null;
  try {
    json = (await res.json()) as T & { status?: number; message?: string };
  } catch {
    json = null;
  }

  if (json && typeof json.status === "number" && json.status !== 100) {
    const msg = STATUS_MESSAGES[json.status] ?? json.message ?? `Adisyo hata kodu ${json.status}`;
    throw new AdisyoError(msg, json.status);
  }

  if (!res.ok) {
    throw new AdisyoError(`Adisyo HTTP ${res.status}`, res.status);
  }

  if (!json) {
    throw new AdisyoError("Adisyo'dan geçersiz/boş yanıt");
  }
  return json;
}

// ==================== Tarih yardımcıları (İstanbul) ====================

// Adisyo API'sine startDate UTC istenir: "yyyy-MM-dd HH:mm:ss"
export function formatApiUtc(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ` +
    `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`
  );
}

// new Date()'i İstanbul "YYYY-MM-DD" anahtarına çevirir.
export function istDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // en-CA → "YYYY-MM-DD"
  return parts;
}

// "YYYY-MM-DD" İstanbul gününün başlangıç (00:00) instant'ı.
export function istDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000${IST_OFFSET}`);
}

// Bir TR yerel tarih-saat string'ini (offset'siz) doğru UTC instant'a çevirir.
export function parseTrInstant(local: string | undefined | null): Date {
  if (!local) return new Date(NaN);
  // Zaten offset/Z içeriyorsa olduğu gibi parse et, yoksa +03:00 ekle.
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(local);
  return new Date(hasTz ? local : `${local}${IST_OFFSET}`);
}

// ==================== Yüksek seviye API çağrıları ====================

export interface FetchCompletedParams {
  startUtc?: string; // "yyyy-MM-dd HH:mm:ss" (UTC). Boşsa Adisyo son 24 saati döner.
  page?: number;
  includeCancelled?: boolean;
  orderType?: string; // "Table,TakeAway,Retail"
}

export async function fetchCompletedOrders(params: FetchCompletedParams = {}): Promise<CompletedOrdersResponse> {
  return adisyoFetch<CompletedOrdersResponse>("/CompletedOrders", {
    page: params.page ?? 1,
    startDate: params.startUtc,
    includeCancelled: params.includeCancelled ?? true,
    orderType: params.orderType,
  });
}

// NOT: /CompletedOrders 40 sn'de 1 çağrılabilir — sayfalama dahil (ardışık sayfa = 601).
// Bu yüzden çok sayfalı çekim adisyoSync.ts içinde sayfalar arası beklemeyle yapılır.

export interface AdisyoOrderDetail extends AdisyoApiOrder {
  customer?: unknown;
}

export async function fetchOrderById(orderId: string | number): Promise<AdisyoOrderDetail> {
  return adisyoFetch<AdisyoOrderDetail>(`/Order/${orderId}`);
}

// ==================== Ürün → Kategori eşlemesi (/Products) ====================

interface ProductsResponse {
  data?: {
    categoryName?: string | null;
    categoryId?: number;
    products?: { productId?: number; productName?: string }[];
  }[];
  status?: number;
  message?: string;
}

// /Products 3 dk'da 1 çağrılabilir + menü/kategori nadiren değişir → 1 saat cache.
const PRODUCT_CACHE_TTL_MS = 60 * 60 * 1000;
let productCatCache: { map: Map<string, string>; expires: number } | null = null;

// productId -> categoryName eşlemesi. Hata olursa eski cache'i (veya boş) döner; panel çökmez.
export async function getProductCategoryMap(): Promise<Map<string, string>> {
  if (productCatCache && Date.now() < productCatCache.expires) {
    return productCatCache.map;
  }
  try {
    const res = await adisyoFetch<ProductsResponse>("/Products");
    const map = new Map<string, string>();
    for (const cat of res.data ?? []) {
      const name = (cat.categoryName ?? "").trim() || "Diğer";
      for (const p of cat.products ?? []) {
        if (p.productId != null) map.set(String(p.productId), name);
      }
    }
    productCatCache = { map, expires: Date.now() + PRODUCT_CACHE_TTL_MS };
    return map;
  } catch (e) {
    if (productCatCache) return productCatCache.map; // eski (bayat) eşleme
    console.error("[ADISYO /Products]", e instanceof Error ? e.message : e);
    return new Map();
  }
}

// ==================== Ayna (mirror) dönüşümü ====================

export interface MappedOrder {
  id: string;
  orderDate: Date;
  totalAmount: number;
  orderType: string | null;
  status: string | null;
  isCancelled: boolean;
  waiterName: string | null;
  payload: Prisma.InputJsonValue;
}

function detectCancelled(raw: AdisyoApiOrder): boolean {
  if (raw.orderCancelReason) return true;
  const s = raw.status ?? "";
  // Türkçe "İ" sorunu: "İptal".toLowerCase() => "i̇ptal" (noktalı i) olduğundan /iptal/i eşleşmez.
  // Hem Türkçe-locale küçültme hem de orijinal stringde "İptal"/"İade" kontrolü yapılır.
  const lower = s.toLocaleLowerCase("tr-TR");
  return lower.includes("iptal") || lower.includes("iade") || s.includes("İptal") || s.includes("İade");
}

// Adisyo ham siparişini AdisyoOrder (DB ayna) alanlarına çevirir.
export function mapToAdisyoOrder(raw: AdisyoApiOrder): MappedOrder {
  return {
    id: String(raw.id),
    orderDate: parseTrInstant(raw.insertDate),
    totalAmount: Number(raw.orderTotal) || 0,
    orderType: raw.orderType ?? null,
    status: raw.status ?? null,
    isCancelled: detectCancelled(raw),
    waiterName: raw.waiterName ?? null,
    payload: raw as unknown as Prisma.InputJsonValue,
  };
}

// ==================== Aggregasyon (aynadan okunan kayıtlar üzerinde) ====================

// Aynadaki bir satırın aggregasyon için normalize edilmiş hâli.
export interface NormalizedOrder {
  id: string;
  total: number;
  isCancelled: boolean;
  orderType: string;
  waiter: string;
  dateKey: string; // "YYYY-MM-DD" (İstanbul yerel)
  hour: number; // 0-23
  payments: { name: string; amount: number }[];
  products: { productId: string; name: string; quantity: number; total: number }[];
}

// AdisyoOrder benzeri kayıt (DB'den veya doğrudan map'ten).
export interface MirrorRow {
  id: string;
  orderDate: Date;
  totalAmount: number;
  orderType: string | null;
  status: string | null;
  isCancelled: boolean;
  waiterName: string | null;
  payload: unknown;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

// Ham insertDate string'i (yerel TR) doğrudan parçalanır → TZ matematiği yok.
export function normalizeRow(row: MirrorRow): NormalizedOrder {
  const p = asRecord(row.payload);
  const insert = typeof p.insertDate === "string" ? p.insertDate : null;
  // dateKey/hour: önce ham TR string'inden (en güvenilir), yoksa orderDate'ten İstanbul'a çevirerek.
  let dateKey: string;
  let hour: number;
  if (insert && /^\d{4}-\d{2}-\d{2}T\d{2}/.test(insert)) {
    dateKey = insert.slice(0, 10);
    hour = Number(insert.slice(11, 13));
  } else {
    dateKey = istDateKey(row.orderDate);
    hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }).format(
        row.orderDate
      )
    ) % 24;
  }

  const paymentsRaw = Array.isArray(p.payments) ? (p.payments as AdisyoApiPayment[]) : [];
  const productsRaw = Array.isArray(p.products) ? (p.products as AdisyoApiProduct[]) : [];

  return {
    id: row.id,
    total: Number(row.totalAmount) || 0,
    isCancelled: row.isCancelled,
    orderType: row.orderType ?? "Diğer",
    waiter: row.waiterName ?? "—",
    dateKey,
    hour: Number.isFinite(hour) ? hour : 0,
    payments: paymentsRaw.map((pm) => ({
      name: pm.paymentName ?? "Bilinmiyor",
      amount: Number(pm.amount) || 0,
    })),
    products: productsRaw.map((pr) => ({
      productId: String(pr.productId ?? ""),
      name: pr.productName ?? "Bilinmiyor",
      quantity: Number(pr.quantity) || 0,
      total: Number(pr.totalAmount) || 0,
    })),
  };
}

const active = (orders: NormalizedOrder[]) => orders.filter((o) => !o.isCancelled);

export function totalRevenue(orders: NormalizedOrder[]): number {
  return active(orders).reduce((sum, o) => sum + o.total, 0);
}

export function orderCount(orders: NormalizedOrder[]): number {
  return active(orders).length;
}

export function cancelledCount(orders: NormalizedOrder[]): number {
  return orders.filter((o) => o.isCancelled).length;
}

export function avgTicket(orders: NormalizedOrder[]): number {
  const a = active(orders);
  return a.length ? a.reduce((s, o) => s + o.total, 0) / a.length : 0;
}

// Bir günün saatlik ciro/sipariş dökümü (0-23).
export function groupByHour(orders: NormalizedOrder[], dateKey: string): { hour: string; revenue: number; orders: number }[] {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, "0")}:00`, revenue: 0, orders: 0 }));
  for (const o of active(orders)) {
    if (o.dateKey !== dateKey) continue;
    const h = Math.min(23, Math.max(0, o.hour));
    buckets[h].revenue += o.total;
    buckets[h].orders += 1;
  }
  return buckets;
}

// Tarih aralığındaki günlük ciro/sipariş trendi (artan sırada).
export function groupByDay(orders: NormalizedOrder[]): { date: string; revenue: number; orders: number }[] {
  const map = new Map<string, { date: string; revenue: number; orders: number }>();
  for (const o of active(orders)) {
    const cur = map.get(o.dateKey) ?? { date: o.dateKey, revenue: 0, orders: 0 };
    cur.revenue += o.total;
    cur.orders += 1;
    map.set(o.dateKey, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Gün (Pzt=0..Paz=6) × Saat (0-23) ısı haritası: ciro ve sipariş adedi matrisleri.
export function heatmapByWeekdayHour(orders: NormalizedOrder[]): {
  revenue: number[][];
  orders: number[][];
} {
  const revenue = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const counts = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const o of active(orders)) {
    const d = new Date(`${o.dateKey}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const wd = (d.getUTCDay() + 6) % 7; // Pazartesi=0
    const h = Math.min(23, Math.max(0, o.hour));
    revenue[wd][h] += o.total;
    counts[wd][h] += 1;
  }
  return { revenue, orders: counts };
}

export function breakdownByPayment(orders: NormalizedOrder[]): { name: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const o of active(orders)) {
    for (const pm of o.payments) {
      map.set(pm.name, (map.get(pm.name) ?? 0) + pm.amount);
    }
  }
  return Array.from(map, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

export function breakdownByOrderType(orders: NormalizedOrder[]): { type: string; revenue: number; orders: number }[] {
  const map = new Map<string, { type: string; revenue: number; orders: number }>();
  for (const o of active(orders)) {
    const cur = map.get(o.orderType) ?? { type: o.orderType, revenue: 0, orders: 0 };
    cur.revenue += o.total;
    cur.orders += 1;
    map.set(o.orderType, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function topProducts(orders: NormalizedOrder[], limit = 15): { name: string; quantity: number; revenue: number }[] {
  const map = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const o of active(orders)) {
    for (const pr of o.products) {
      const cur = map.get(pr.name) ?? { name: pr.name, quantity: 0, revenue: 0 };
      cur.quantity += pr.quantity;
      cur.revenue += pr.total;
      map.set(pr.name, cur);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

// Kategori bazlı satış: ürün ADINI StudyAnka manuel kategori eşlemesine bağlar
// (kaynak: kategoriler_study_anka.xlsx → src/lib/adisyoCategories.ts).
export function breakdownByCategory(
  orders: NormalizedOrder[]
): { category: string; quantity: number; revenue: number }[] {
  const map = new Map<string, { category: string; quantity: number; revenue: number }>();
  for (const o of active(orders)) {
    for (const pr of o.products) {
      const category = categoryForProduct(pr.name);
      const cur = map.get(category) ?? { category, quantity: 0, revenue: 0 };
      cur.quantity += pr.quantity;
      cur.revenue += pr.total;
      map.set(category, cur);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function revenueByWaiter(orders: NormalizedOrder[]): { waiter: string; revenue: number; orders: number }[] {
  const map = new Map<string, { waiter: string; revenue: number; orders: number }>();
  for (const o of active(orders)) {
    const cur = map.get(o.waiter) ?? { waiter: o.waiter, revenue: 0, orders: 0 };
    cur.revenue += o.total;
    cur.orders += 1;
    map.set(o.waiter, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}
