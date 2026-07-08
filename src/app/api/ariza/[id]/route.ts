import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// PATCH /api/ariza/[id] — güncelle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const {
      description,
      startDate,
      endDate,
      assignedPersonnel,
      siteName,
      siteId,
      blockId,
      floorId,
      unitId,
      isPeyzaj,
      status,
    } = body;

    const data: Record<string, unknown> = {};
    if (description !== undefined) data.description = String(description).trim();
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (assignedPersonnel !== undefined) data.assignedPersonnel = assignedPersonnel?.trim() || null;
    // siteId açıkça verildiyse (gerçek şantiyeye bağla, customSiteName temizle)
    if (siteId !== undefined && siteId) {
      data.siteId = siteId;
      data.customSiteName = null;
    } else if (siteName !== undefined) {
      const trimmed = String(siteName).trim();
      if (trimmed) {
        data.customSiteName = trimmed;
        data.siteId = null;
      }
    }
    if (blockId !== undefined) data.blockId = blockId || null;
    if (floorId !== undefined) data.floorId = floorId || null;
    if (unitId !== undefined) data.unitId = unitId || null;
    if (isPeyzaj !== undefined) data.isPeyzaj = !!isPeyzaj;
    if (status !== undefined && (status === "OPEN" || status === "RESOLVED")) data.status = status;
    // Auto-derive status if endDate provided and status not explicitly set
    if (endDate !== undefined && status === undefined) {
      data.status = endDate ? "RESOLVED" : "OPEN";
    }

    const ariza = await prisma.ariza.update({
      where: { id },
      data,
      include: {
        site: { select: { id: true, name: true } },
        block: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        media: { orderBy: { createdAt: "asc" } },
      },
    });

    return NextResponse.json({ ariza });
  } catch (error) {
    console.error("Ariza PATCH error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/ariza/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "SITE_CHIEF"])) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;

    // Delete media files from disk
    const media = await prisma.ariszaMedia.findMany({ where: { ariszaId: id } });
    for (const m of media) {
      try {
        const abs = path.resolve(path.join(UPLOAD_DIR, m.url));
        const base = path.resolve(UPLOAD_DIR);
        if (abs.startsWith(base + path.sep)) {
          await fs.unlink(abs).catch(() => {});
        }
      } catch {
        // ignore
      }
    }

    await prisma.ariza.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ariza DELETE error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
