import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasAnyRole(user.roles, ["ADMIN", "SUPER_ADMIN", "MANAGER", "SITE_CHIEF", "MUHASEBE"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, mediaId } = await params;
    const media = await prisma.warehouseMaterialMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.warehouseMaterialId !== id) {
      return NextResponse.json({ error: "Medya bulunamadı" }, { status: 404 });
    }

    const abs = path.resolve(path.join(UPLOAD_DIR, media.url));
    const base = path.resolve(UPLOAD_DIR);
    if (abs.startsWith(base + path.sep)) {
      await fs.unlink(abs).catch(() => {});
    }

    await prisma.warehouseMaterialMedia.delete({ where: { id: mediaId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Warehouse material media delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
