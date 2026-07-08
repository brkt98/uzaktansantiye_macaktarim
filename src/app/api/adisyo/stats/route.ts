import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFresh } from "@/lib/adisyoSync";
import {
  istDateKey,
  istDayStart,
  normalizeRow,
  totalRevenue,
  orderCount,
  cancelledCount,
  avgTicket,
  groupByHour,
  groupByDay,
  heatmapByWeekdayHour,
  breakdownByPayment,
  breakdownByOrderType,
  breakdownByCategory,
  topProducts,
  revenueByWaiter,
  type MirrorRow,
} from "@/lib/adisyo";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "YYYY-MM-DD" + n gün → "YYYY-MM-DD" (UTC tabanlı, TZ kaymasından bağımsız).
function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// GET /api/adisyo/stats?start=YYYY-MM-DD&end=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.studyankaAccess) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const today = istDateKey();
    const monthStart = `${today.slice(0, 7)}-01`;

    const params = new URL(request.url).searchParams;
    const startRaw = params.get("start");
    const endRaw = params.get("end");
    const start = startRaw && DATE_RE.test(startRaw) ? startRaw : monthStart;
    let end = endRaw && DATE_RE.test(endRaw) ? endRaw : today;
    // start > end ise yer değiştir.
    let rangeStart = start;
    let rangeEnd = end;
    if (rangeStart > rangeEnd) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    end = rangeEnd;

    // Ayna bayatsa artımlı sync tetikle (hata olsa bile mevcut veriyle devam).
    const fresh = await ensureFresh();

    // Bugünü, seçilen aralığı ve içinde bulunulan ayı kapsayan tek pencere çek.
    const windowStartKey = [rangeStart, monthStart, today].sort()[0];
    const windowEndKey = [rangeEnd, today].sort()[1] ?? today;
    const gte = istDayStart(windowStartKey);
    const lt = istDayStart(addDaysKey(windowEndKey, 1));

    const rows = (await prisma.adisyoOrder.findMany({
      where: { orderDate: { gte, lt } },
      orderBy: { orderDate: "asc" },
    })) as unknown as MirrorRow[];

    const all = rows.map(normalizeRow);

    const todayOrders = all.filter((o) => o.dateKey === today);
    const monthOrders = all.filter((o) => o.dateKey >= monthStart && o.dateKey <= today);
    const rangeOrders = all.filter((o) => o.dateKey >= rangeStart && o.dateKey <= rangeEnd);

    return NextResponse.json({
      range: { start: rangeStart, end: rangeEnd },
      today,

      todayRevenue: totalRevenue(todayOrders),
      monthRevenue: totalRevenue(monthOrders),
      rangeRevenue: totalRevenue(rangeOrders),

      todayOrderCount: orderCount(todayOrders),
      rangeOrderCount: orderCount(rangeOrders),
      avgTicket: avgTicket(rangeOrders),
      cancelledCount: cancelledCount(rangeOrders),

      hourly: groupByHour(todayOrders, today),
      rangeDaily: groupByDay(rangeOrders),
      heatmap: heatmapByWeekdayHour(rangeOrders),
      paymentBreakdown: breakdownByPayment(rangeOrders),
      orderTypeBreakdown: breakdownByOrderType(rangeOrders),
      categoryBreakdown: breakdownByCategory(rangeOrders),
      topProducts: topProducts(rangeOrders),
      revenueByWaiter: revenueByWaiter(rangeOrders),

      syncedAt: new Date().toISOString(),
      syncError: fresh.error ?? null,
    });
  } catch (error: unknown) {
    console.error("[ADISYO STATS]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
