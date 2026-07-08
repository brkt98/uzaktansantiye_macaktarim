import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST: Bloka yeni daire ekle
// body: { blockId, name }
export async function POST(
  request: NextRequest,
  { params: _ }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    await _;
    const body = await request.json();
    const blockId = body?.blockId as string | undefined;
    const name = (body?.name as string | undefined)?.trim();
    if (!blockId || !name)
      return NextResponse.json(
        { error: "blockId ve daire adı zorunlu" },
        { status: 400 }
      );

    const last = await prisma.salesDaire.findFirst({
      where: { blockId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = (last?.order ?? -1) + 1;

    const daire = await prisma.salesDaire.create({
      data: { blockId, name, order },
    });
    return NextResponse.json({ daire }, { status: 201 });
  } catch (err) {
    console.error("Sales daire POST error:", err);
    return NextResponse.json({ error: "Eklenemedi" }, { status: 500 });
  }
}
