import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// GET /api/trash — list all trash items (admin only)
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    const siteId = req.nextUrl.searchParams.get("siteId");

    // 30-day auto cleanup: permanently delete items older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expiredItems = await prisma.trashItem.findMany({
      where: { deletedAt: { lt: thirtyDaysAgo } },
    });

    // For expired items, delete physical files too
    for (const item of expiredItems) {
      await permanentlyDeleteFiles(item);
    }

    if (expiredItems.length > 0) {
      await prisma.trashItem.deleteMany({
        where: { id: { in: expiredItems.map(i => i.id) } },
      });
    }

    const items = await prisma.trashItem.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { deletedAt: "desc" },
    });

    // Soft-deleted şantiyeleri de çöp kutusuna dahil et
    const deletedSitesWhere: Record<string, unknown> = { deletedAt: { not: null } };
    if (siteId) deletedSitesWhere.id = siteId;
    const deletedSites = await prisma.constructionSite.findMany({
      where: deletedSitesWhere,
      include: {
        _count: {
          select: { blocks: true, categories: true },
        },
      },
      orderBy: { deletedAt: "desc" },
    });

    return NextResponse.json({ items, deletedSites });
  } catch (error) {
    console.error("Trash list error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

async function permanentlyDeleteFiles(item: { itemType: string; originalData: unknown }) {
  const data = item.originalData as Record<string, unknown>;
  const path = await import("path");
  const { unlink } = await import("fs/promises");
  const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

  try {
    if (item.itemType === "construction_media") {
      // Construction media file
      const fileUrl = data.fileUrl as string;
      if (fileUrl) {
        const fileName = fileUrl.split("/").pop();
        if (fileName) {
          const filePath = path.join(process.cwd(), "uploads", "construction", fileName);
          try { await unlink(filePath); } catch {}
        }
      }
    } else if (item.itemType === "category_document") {
      // Category document file (only if not a copy)
      if (!data.sourceDocumentId) {
        const fileUrl = data.fileUrl as string;
        const fileName = fileUrl?.split("/").pop();
        if (fileName) {
          const categoryId = data.categoryId as string;
          const urlCategoryId = fileUrl?.split("/categories/")[1]?.split("/")[0] || categoryId;
          const filePath = path.join(UPLOAD_DIR, "categories", urlCategoryId, path.basename(fileName));
          try { await unlink(filePath); } catch {}
        }
      }
    } else if (item.itemType === "sales_project") {
      const sourceType = data.sourceType as string | undefined;
      if (sourceType === "standalone_project") {
        const blocks = (data.blocks || []) as {
          daires?: { media?: { fileUrl?: string }[] }[];
        }[];
        for (const block of blocks) {
          for (const daire of block.daires || []) {
            for (const media of daire.media || []) {
              const fileName = media.fileUrl?.split("/").pop();
              if (fileName) {
                const filePath = path.join(UPLOAD_DIR, "sales", path.basename(fileName));
                try { await unlink(filePath); } catch {}
              }
            }
          }
        }
      }
    } else if (item.itemType === "annotation") {
      // Annotation media files
      const media = (data.media || []) as { fileUrl: string }[];
      const checklistMedia = (data.checklistMedia || []) as { fileUrl: string }[];
      for (const m of [...media, ...checklistMedia]) {
        try {
          const filePath = path.join(UPLOAD_DIR, m.fileUrl.replace(/^\/uploads\//, ''));
          await unlink(filePath);
        } catch {}
      }
    }
  } catch {}
}
