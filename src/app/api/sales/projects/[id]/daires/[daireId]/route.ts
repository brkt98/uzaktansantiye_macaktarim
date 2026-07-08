import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PATCH: { name?, status?, price?, reservedFor?, notes? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; daireId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { daireId } = await params;
    const body = await request.json();
    const data: any = {};
    if (typeof body?.name === "string") data.name = body.name.trim();
    if (typeof body?.status === "string") data.status = body.status;
    if (body?.price !== undefined)
      data.price = (body.price === null || body.price === "") ? null : Number(body.price);
    if (body?.reservedFor === null || typeof body?.reservedFor === "string")
      data.reservedFor = body.reservedFor;
    if (body?.notes === null || typeof body?.notes === "string")
      data.notes = body.notes;

    const daire = await prisma.salesDaire.update({ where: { id: daireId }, data });
    return NextResponse.json({ daire });
  } catch (err) {
    console.error("Sales daire PATCH error:", err);
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 });
  }
}

// DELETE
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; daireId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { daireId } = await params;
    await prisma.salesDaire.delete({ where: { id: daireId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Sales daire DELETE error:", err);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
