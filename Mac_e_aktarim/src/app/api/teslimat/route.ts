import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";

// GET /api/teslimat - Tüm teslimatları listele
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (siteId) where.siteId = siteId;
    if (search) {
      where.OR = [
        { irsaliyeNo: { contains: search, mode: "insensitive" } },
        { supplier: { contains: search, mode: "insensitive" } },
        { receivedBy: { contains: search, mode: "insensitive" } },
        { items: { some: { materialName: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const teslimatlar = await prisma.teslimat.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        site: { select: { id: true, name: true } },
        items: {
          include: {
            media: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    return NextResponse.json({ teslimatlar });
  } catch (error) {
    console.error("Teslimat fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/teslimat - Yeni teslimat oluştur
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "SITE_CHIEF", "MUHASEBE"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { irsaliyeNo, supplier, siteId, receivedBy, date, notes, items } = body;

    if (!receivedBy?.trim() || !date) {
      return NextResponse.json({ error: "Teslim alan ve tarih zorunludur" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "En az bir malzeme kalemi ekleyin" }, { status: 400 });
    }

    for (const item of items) {
      if (!item.materialName?.trim() || !item.unit?.trim() || !item.quantity || item.quantity <= 0 || item.unitPrice === undefined || item.unitPrice < 0) {
        return NextResponse.json({ error: "Tüm kalemlerde malzeme adı, birim, miktar ve fiyat gerekli" }, { status: 400 });
      }
    }

    const teslimat = await prisma.teslimat.create({
      data: {
        irsaliyeNo: irsaliyeNo?.trim() || "",
        supplier: supplier?.trim() || null,
        siteId: siteId || null,
        receivedBy: receivedBy.trim(),
        date: new Date(date),
        notes: notes?.trim() || null,
        items: {
          create: items.map((item: { materialName: string; unit: string; quantity: number; unitPrice: number; taxRate?: number }) => ({
            materialName: item.materialName.trim(),
            unit: item.unit.trim(),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            taxRate: typeof item.taxRate === "number" ? item.taxRate : 0,
          })),
        },
      },
      include: {
        site: { select: { id: true, name: true } },
        items: true,
      },
    });

    return NextResponse.json({ teslimat }, { status: 201 });
  } catch (error) {
    console.error("Teslimat create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
