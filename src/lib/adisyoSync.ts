// Adisyo ayna (mirror) senkronu — /CompletedOrders'ı çekip AdisyoOrder tablosuna yazar.
//
// ÖNEMLİ: /CompletedOrders 40 sn'de 1 çağrılabilir (sayfalama dahil; ardışık sayfa = 601).
// Strateji:
//   - syncRecent(): son ~4 saatlik pencerede TEK sayfa (≤100 sipariş) → hızlı, limite takılmaz.
//                   Panel açıldıkça (ensureFresh) veya cron ile "bugün"ü taze tutar.
//   - runBackfill(): geçmiş için sayfalar arası 41 sn bekleyerek ARKA PLANDA çalışır (bloklamaz).
//   - Webhook aktif edilince ayna ayrıca anlık güncellenir (en doğru yöntem).

import { prisma } from "./db";
import { fetchCompletedOrders, mapToAdisyoOrder, formatApiUtc, AdisyoError } from "./adisyo";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const RECENT_WINDOW_MS = 4 * HOUR; // tek sayfaya sığacak kadar dar pencere
const COMPLETED_COOLDOWN_MS = 41 * 1000; // 40 sn limitine küçük pay
const BACKFILL_DEFAULT_DAYS = 35; // mevcut ay + biraz
const MAX_BACKFILL_PAGES = 400; // güvenlik tavanı

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Backfill ile recent sync'in aynı anda /CompletedOrders çağırıp 601 yememesi için kilit.
let backfillRunning = false;

export type SyncMode = "recent" | "backfill";

export interface SyncResult {
  mode: SyncMode;
  skipped: boolean;
  fetched: number;
  upserted: number;
  reason?: string;
  pages?: number;
  started?: boolean;
}

async function getMeta() {
  return prisma.adisyoSyncMeta.findUnique({ where: { id: "latest" } });
}

async function touchMeta(backfill: boolean) {
  const now = new Date();
  await prisma.adisyoSyncMeta.upsert({
    where: { id: "latest" },
    create: { id: "latest", lastSyncAt: now, lastBackfill: backfill ? now : null },
    update: { lastSyncAt: now, ...(backfill ? { lastBackfill: now } : {}) },
  });
}

async function upsertOrders(orders: ReturnType<typeof mapToAdisyoOrder>[]): Promise<number> {
  let count = 0;
  const CHUNK = 20;
  for (let i = 0; i < orders.length; i += CHUNK) {
    const chunk = orders.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((m) =>
        prisma.adisyoOrder.upsert({
          where: { id: m.id },
          create: {
            id: m.id,
            orderDate: m.orderDate,
            totalAmount: m.totalAmount,
            orderType: m.orderType,
            status: m.status,
            isCancelled: m.isCancelled,
            waiterName: m.waiterName,
            payload: m.payload,
          },
          update: {
            orderDate: m.orderDate,
            totalAmount: m.totalAmount,
            orderType: m.orderType,
            status: m.status,
            isCancelled: m.isCancelled,
            waiterName: m.waiterName,
            payload: m.payload,
            syncedAt: new Date(),
          },
        })
      )
    );
    count += chunk.length;
  }
  return count;
}

// Tek sayfa çekip aynaya yazar.
async function fetchPage(startUtc: string, page: number): Promise<{ upserted: number; fetched: number; pageCount: number }> {
  const res = await fetchCompletedOrders({ startUtc, page, includeCancelled: true });
  const mapped = (res.orders ?? [])
    .filter((o) => o && o.id != null)
    .map(mapToAdisyoOrder)
    .filter((m) => !Number.isNaN(m.orderDate.getTime()));
  const upserted = await upsertOrders(mapped);
  return { upserted, fetched: mapped.length, pageCount: res.pageCount ?? 1 };
}

// 601 (rate limit) alınırsa 41 sn bekleyip sayfayı yeniden dener. Backfill'in page-1 yarışına
// (döngünün hemen önce attığı çağrı) takılıp komple çökmesini önler.
async function fetchPageWithRetry(
  startUtc: string,
  page: number,
  maxRetries = 6
): Promise<{ upserted: number; fetched: number; pageCount: number }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchPage(startUtc, page);
    } catch (e) {
      if (e instanceof AdisyoError && e.status === 601 && attempt < maxRetries) {
        await sleep(COMPLETED_COOLDOWN_MS);
        continue;
      }
      throw e;
    }
  }
}

// Son ~4 saatin tek sayfası — hızlı, panelde "bugün"ü taze tutar.
export async function syncRecent(): Promise<SyncResult> {
  if (backfillRunning) {
    return { mode: "recent", skipped: true, fetched: 0, upserted: 0, reason: "backfill-running" };
  }
  const meta = await getMeta();
  if (meta?.lastSyncAt && Date.now() - meta.lastSyncAt.getTime() < COMPLETED_COOLDOWN_MS) {
    return { mode: "recent", skipped: true, fetched: 0, upserted: 0, reason: "cooldown" };
  }

  const startUtc = formatApiUtc(new Date(Date.now() - RECENT_WINDOW_MS));
  let r: { upserted: number; fetched: number; pageCount: number };
  try {
    r = await fetchPage(startUtc, 1);
  } catch (e) {
    // Rate limit'e takılırsa hata fırlatma; bir sonraki tur dener.
    if (e instanceof AdisyoError && e.status === 601) {
      return { mode: "recent", skipped: true, fetched: 0, upserted: 0, reason: "rate-limit" };
    }
    throw e;
  }
  await touchMeta(false);
  return { mode: "recent", skipped: false, fetched: r.fetched, upserted: r.upserted, pages: 1 };
}

// Geçmiş veriyi sayfalar arası 41 sn bekleyerek çeker. ARKA PLANDA çağrılmalı (uzun sürer).
export async function runBackfill(days = BACKFILL_DEFAULT_DAYS): Promise<SyncResult> {
  if (backfillRunning) {
    return { mode: "backfill", skipped: true, fetched: 0, upserted: 0, reason: "already-running" };
  }
  backfillRunning = true;
  let totalFetched = 0;
  let totalUpserted = 0;
  let pages = 1;
  try {
    const startUtc = formatApiUtc(new Date(Date.now() - days * DAY));
    const first = await fetchPageWithRetry(startUtc, 1);
    totalFetched += first.fetched;
    totalUpserted += first.upserted;
    pages = Math.min(first.pageCount, MAX_BACKFILL_PAGES);
    await touchMeta(true);

    for (let page = 2; page <= pages; page++) {
      await sleep(COMPLETED_COOLDOWN_MS); // 40 sn limiti
      const r = await fetchPageWithRetry(startUtc, page);
      totalFetched += r.fetched;
      totalUpserted += r.upserted;
      await touchMeta(true);
    }
    return { mode: "backfill", skipped: false, fetched: totalFetched, upserted: totalUpserted, pages };
  } finally {
    backfillRunning = false;
  }
}

export function isBackfillRunning(): boolean {
  return backfillRunning;
}

// Ayna bayatsa tek-sayfa recent sync tetikler; hata olsa bile fırlatmaz (panel bayat veriyle çalışsın).
export async function ensureFresh(maxAgeMs = COMPLETED_COOLDOWN_MS): Promise<{ synced: boolean; error?: string }> {
  try {
    if (backfillRunning) return { synced: false };
    const meta = await getMeta();
    if (meta?.lastSyncAt && Date.now() - meta.lastSyncAt.getTime() < maxAgeMs) {
      return { synced: false };
    }
    const r = await syncRecent();
    return { synced: !r.skipped };
  } catch (e) {
    return { synced: false, error: e instanceof Error ? e.message : "bilinmeyen hata" };
  }
}
