import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Polymorphic alici endpoint: targetType ("unit"|"daire") + targetId zorunlu.
// Bir hedef icin tek alici var sayilir (basit upsert), birden fazla alici
// gerekirse ileride genisletilir.

function validateTarget(targetType?: string | null, targetId?: string | null) {
  if (!targetType || !targetId) return "targetType & targetId zorunlu";
  if (targetType !== "unit" && targetType !== "daire") return "Gecersiz targetType";
  return null;
}

// GET ?targetType=&targetId=  -> { buyer | null }
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get("targetType");
    const targetId = searchParams.get("targetId");
    const err = validateTarget(targetType, targetId);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const buyer = await prisma.buyer.findFirst({
      where: { targetType: targetType!, targetId: targetId! },
      include: {
        payments: {
          orderBy: { paidAt: "desc" },
          include: { documents: true },
        },
      },
    });
    return NextResponse.json({ buyer });
  } catch (e) {
    console.error("Buyer GET error:", e);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

// POST body: { targetType, targetId, name, phone?, email?, notes? }
// Hedef icin alici varsa update, yoksa create
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await request.json();
    const { targetType, targetId, name, phone, email, notes } = body || {};
    const err = validateTarget(targetType, targetId);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "name zorunlu" }, { status: 400 });
    }

    const existing = await prisma.buyer.findFirst({
      where: { targetType, targetId },
    });

    const data = {
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : null,
      email: email ? String(email).trim() : null,
      notes: notes ? String(notes).trim() : null,
    };

    const buyer = existing
      ? await prisma.buyer.update({ where: { id: existing.id }, data })
      : await prisma.buyer.create({ data: { ...data, targetType, targetId } });

    return NextResponse.json({ buyer }, { status: existing ? 200 : 201 });
  } catch (e) {
    console.error("Buyer POST error:", e);
    return NextResponse.json({ error: "Kaydedilemedi" }, { status: 500 });
  }
}

// DELETE ?buyerId=
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const buyerId = searchParams.get("buyerId");
    if (!buyerId) return NextResponse.json({ error: "buyerId zorunlu" }, { status: 400 });

    await prisma.buyer.delete({ where: { id: buyerId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Buyer DELETE error:", e);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
