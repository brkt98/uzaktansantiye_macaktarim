import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { fetchOrderById, mapToAdisyoOrder } from "@/lib/adisyo";

export const dynamic = "force-dynamic";

// NOT: Bu uç Adisyo'da webhook AKTİF EDİLİNCE çalışır. Şu an pasif (Adisyo'ya Servis URL girilmedi).
// Servis URL: https://uzaktansantiye.com/api/adisyo/webhook
// Güvenlik: HMAC-SHA256. Message = webhookEventType + "|" + eventTimeUtc + "|" + ApiKey
//           Signature = Base64(HMACSHA256(message, key=ApiKey)) → X-Adisyo-Signature header'ı.

function pick(body: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

function verifySignature(eventType: string, eventTime: string, signature: string, apiKey: string): boolean {
  if (!signature) return false;
  const message = `${eventType}|${eventTime}|${apiKey}`;
  const expected = crypto.createHmac("sha256", apiKey).update(message).digest("base64");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ADISYO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ADISYO_API_KEY tanımlı değil" }, { status: 500 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType = pick(body, "webhookEventType", "WebhookEventType");
    const eventTime = pick(body, "eventTimeUtc", "EventTimeUtc");
    const signature = request.headers.get("x-adisyo-signature") ?? "";

    if (!verifySignature(eventType, eventTime, signature, apiKey)) {
      return NextResponse.json({ error: "Geçersiz imza" }, { status: 401 });
    }

    // Sadece sipariş event'leri işlenir; stok event'leri yok sayılır.
    if (eventType === "order.created" || eventType === "order.updated") {
      const data = (body.data ?? body.Data) as Record<string, unknown> | undefined;
      const orderId = data?.id ?? data?.Id;
      if (orderId != null) {
        try {
          const detail = await fetchOrderById(String(orderId));
          const m = mapToAdisyoOrder(detail);
          if (!Number.isNaN(m.orderDate.getTime())) {
            await prisma.adisyoOrder.upsert({
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
            });
          }
        } catch (e) {
          // Detay çekilemese bile Adisyo retry'larını önlemek için 200 dönülür; logla.
          console.error("[ADISYO WEBHOOK] order fetch/upsert failed", e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[ADISYO WEBHOOK]", error);
    // Webhook'larda 200 dışı dönmek Adisyo'da retry tetikler; yine de beklenmeyen hatada 200 + logla.
    return NextResponse.json({ success: false });
  }
}
