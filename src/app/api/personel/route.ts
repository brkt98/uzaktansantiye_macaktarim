import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { syncMatchedPersonnel } from "@/lib/personnel-sync";

// GET /api/personel?siteId=xxx&search=abc
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");
    const search = searchParams.get("search");

    if (!siteId) {
      return NextResponse.json({ error: "siteId gerekli" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { siteId };

    if (search && search.length > 0) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    const personnel = await prisma.sitePersonnel.findMany({
      where,
      include: {
        documents: { orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    return NextResponse.json({ personnel });
  } catch (error) {
    console.error("Personnel list error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST /api/personel
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const body = await req.json();
    const { siteId, firstName, lastName, company, tcNo, phone, position, notes } = body;

    if (!siteId || !firstName || !lastName) {
      return NextResponse.json({ error: "siteId, firstName ve lastName gerekli" }, { status: 400 });
    }

    // Validate TC No format if provided (11 digits)
    if (tcNo && !/^\d{11}$/.test(tcNo)) {
      return NextResponse.json({ error: "TC Kimlik No 11 haneli olmalıdır" }, { status: 400 });
    }

    const personnel = await prisma.sitePersonnel.create({
      data: {
        siteId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        company: company?.trim() || null,
        tcNo: tcNo?.trim() || null,
        phone: phone?.trim() || null,
        position: position?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    await syncMatchedPersonnel(personnel.id);

    const syncedPersonnel = await prisma.sitePersonnel.findUnique({
      where: { id: personnel.id },
      include: { documents: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json({ personnel: syncedPersonnel || personnel }, { status: 201 });
  } catch (error) {
    console.error("Personnel create error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
