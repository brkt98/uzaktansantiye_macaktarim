import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST: Bloka yeni blok ekle
// body: { name }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id: projectId } = await params;
    const body = await request.json();
    const name = (body?.name as string | undefined)?.trim();
    if (!name) return NextResponse.json({ error: "Blok adı zorunlu" }, { status: 400 });

    const last = await prisma.salesBlock.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = (last?.order ?? -1) + 1;

    const block = await prisma.salesBlock.create({
      data: { projectId, name, order },
      include: { daires: true },
    });
    return NextResponse.json({ block }, { status: 201 });
  } catch (err) {
    console.error("Sales block POST error:", err);
    return NextResponse.json({ error: "Eklenemedi" }, { status: 500 });
  }
}
