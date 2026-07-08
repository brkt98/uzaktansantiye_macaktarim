import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PATCH: blok adını güncelle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { blockId } = await params;
    const body = await request.json();
    const data: any = {};
    if (typeof body?.name === "string") data.name = body.name.trim();
    const block = await prisma.salesBlock.update({ where: { id: blockId }, data });
    return NextResponse.json({ block });
  } catch (err) {
    console.error("Sales block PATCH error:", err);
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 });
  }
}

// DELETE: blok ve içindeki tüm daireler/medyalar silinir
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { blockId } = await params;
    await prisma.salesBlock.delete({ where: { id: blockId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Sales block DELETE error:", err);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
