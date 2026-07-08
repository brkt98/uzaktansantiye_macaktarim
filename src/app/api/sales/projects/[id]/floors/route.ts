import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// SalesFloor CRUD (pure-sales projects).
//
// GET                        -> { blocks: [{ id, name, floors: [...] }] }
// POST   { blockId, name }   -> { floor }
// PATCH  { floorId, name }   -> { floor }
// DELETE ?floorId=           -> { success }

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const blocks = await prisma.salesBlock.findMany({
      where: { projectId: id },
      orderBy: { order: "asc" },
      include: {
        floors: {
          orderBy: { order: "asc" },
          include: { daires: { orderBy: { order: "asc" } } },
        },
      },
    });
    return NextResponse.json({ blocks });
  } catch (e) {
    console.error("SalesFloor GET error:", e);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { blockId, name } = body || {};
    if (!blockId || !name || !String(name).trim()) {
      return NextResponse.json(
        { error: "blockId & name zorunlu" },
        { status: 400 }
      );
    }

    const block = await prisma.salesBlock.findFirst({
      where: { id: blockId, projectId: id },
    });
    if (!block) {
      return NextResponse.json({ error: "Blok bulunamadi" }, { status: 404 });
    }

    const max = await prisma.salesFloor.aggregate({
      where: { blockId },
      _max: { order: true },
    });
    const nextOrder = (max._max.order ?? -1) + 1;

    const floor = await prisma.salesFloor.create({
      data: { blockId, name: String(name).trim(), order: nextOrder },
    });
    return NextResponse.json({ floor }, { status: 201 });
  } catch (e) {
    console.error("SalesFloor POST error:", e);
    return NextResponse.json({ error: "Olusturulamadi" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await request.json();
    const { floorId, name, order } = body || {};
    if (!floorId) {
      return NextResponse.json({ error: "floorId zorunlu" }, { status: 400 });
    }

    const data: any = {};
    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ error: "name bos olamaz" }, { status: 400 });
      }
      data.name = String(name).trim();
    }
    if (order !== undefined) data.order = Number(order);

    const floor = await prisma.salesFloor.update({
      where: { id: floorId },
      data,
    });
    return NextResponse.json({ floor });
  } catch (e) {
    console.error("SalesFloor PATCH error:", e);
    return NextResponse.json({ error: "Guncellenemedi" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const floorId = searchParams.get("floorId");
    if (!floorId) {
      return NextResponse.json({ error: "floorId zorunlu" }, { status: 400 });
    }

    await prisma.salesFloor.delete({ where: { id: floorId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("SalesFloor DELETE error:", e);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
