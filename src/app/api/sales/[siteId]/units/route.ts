import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PATCH /api/sales/[siteId]/units -> bir daire için status/price/notes günceller
// body: { blockId, daireName, status?, price?, reservedFor?, notes? }
// Kayıt yoksa upsert eder.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { siteId } = await params;
    const body = await request.json();
    const { blockId, daireName, status, price, reservedFor, notes } = body || {};

    if (!blockId || !daireName) {
      return NextResponse.json(
        { error: "blockId ve daireName zorunlu" },
        { status: 400 }
      );
    }

    const validStatus = ["AVAILABLE", "RESERVED", "SOLD", "LAND_OWNER"];
    if (status && !validStatus.includes(status)) {
      return NextResponse.json({ error: "Geçersiz status" }, { status: 400 });
    }

    const data: {
      status?: "AVAILABLE" | "RESERVED" | "SOLD" | "LAND_OWNER";
      price?: number | null;
      reservedFor?: string | null;
      notes?: string | null;
    } = {};
    if (status !== undefined) data.status = status;
    if (price !== undefined)
      data.price = price === null || price === "" ? null : Number(price);
    if (reservedFor !== undefined) data.reservedFor = reservedFor || null;
    if (notes !== undefined) data.notes = notes || null;

    const unit = await prisma.salesUnit.upsert({
      where: {
        siteId_blockId_daireName: { siteId, blockId, daireName },
      },
      update: data,
      create: {
        siteId,
        blockId,
        daireName,
        status: (status as "AVAILABLE" | "RESERVED" | "SOLD" | "LAND_OWNER") || "AVAILABLE",
        price:
          price === undefined || price === null || price === "" ? null : Number(price),
        reservedFor: reservedFor || null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ unit });
  } catch (err) {
    console.error("PATCH /api/sales/[siteId]/units error:", err);
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 });
  }
}
