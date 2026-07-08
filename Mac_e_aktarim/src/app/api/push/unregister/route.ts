import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST /api/push/unregister  { token: string }
// Çıkış yaparken cihaz token'ını siler.
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { token } = await request.json();
    if (token && typeof token === "string") {
      await prisma.deviceToken.deleteMany({ where: { token, userId: user.id } });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("push/unregister:", e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
