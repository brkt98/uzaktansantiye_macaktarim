import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// DELETE /api/personnel/[id] — tek personel kaydını sil
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.personnelEntry.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Personnel DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH /api/personnel/[id] — personel kaydını güncelle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { personnelName, company, workDuration } = body;

    const data: Record<string, unknown> = {};
    if (personnelName !== undefined) data.personnelName = personnelName;
    if (company !== undefined) data.company = company || null;
    if (workDuration !== undefined) data.workDuration = workDuration;

    const entry = await prisma.personnelEntry.update({
      where: { id },
      data,
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Personnel PATCH error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
