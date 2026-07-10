import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST /api/push/register  { token: string, platform: "ios"|"android" }
// Mevcut kullanıcının cihaz push token'ını kaydeder/günceller.
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { token, platform } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token gerekli" }, { status: 400 });
    }
    // "ios-voip" = PushKit VoIP token (gelen arama); FCM'e DEĞİL, doğrudan APNs'e gider.
    const plat =
      platform === "ios" || platform === "android" || platform === "ios-voip"
        ? platform
        : "android";

    await prisma.deviceToken.upsert({
      where: { token },
      update: { userId: user.id, platform: plat },
      create: { token, platform: plat, userId: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("push/register:", e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
