import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

// POST /api/push/test
// Giriş yapmış kullanıcının kendi cihazlarına test bildirimi gönderir.
// Push altyapısını uçtan uca doğrulamak için.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  await sendPushToUser(user.id, {
    title: "Test bildirimi",
    body: "Push altyapısı çalışıyor 🎉",
    data: { relatedUrl: "/dashboard" },
  });

  return NextResponse.json({ ok: true });
}
