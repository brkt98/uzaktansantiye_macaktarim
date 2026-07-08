import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// POST /api/trash/[id] — restore a trash item (admin only)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    const { id } = await params;

    const trashItem = await prisma.trashItem.findUnique({ where: { id } });
    if (!trashItem) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    if (trashItem.itemType === "annotation") {
      return await restoreAnnotation(trashItem);
    } else if (trashItem.itemType === "construction_media") {
      return await restoreConstructionMedia(trashItem);
    } else if (trashItem.itemType === "category_document") {
      return await restoreCategoryDocument(trashItem);
    } else if (trashItem.itemType === "sales_project") {
      return await restoreSalesProject(trashItem);
    }

    return NextResponse.json({ error: "Bilinmeyen öğe türü" }, { status: 400 });
  } catch (error) {
    console.error("Trash restore error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

async function restoreAnnotation(trashItem: { id: string; originalData: unknown }) {
  const data = trashItem.originalData as {
    id: string;
    documentId: string;
    pageNumber: number;
    xPercent: number;
    yPercent: number;
    label: string | null;
    color: string | null;
    pinSize: string | null;
    unitId: string | null;
    createdBy: string;
    media: { fileName: string; fileUrl: string; mimeType: string; fileSize: number; title: string | null; description: string | null }[];
    checklistMedia: { checklistItemId: string; fileName: string; fileUrl: string; mimeType: string; fileSize: number }[];
  };

  const doc = await prisma.document.findUnique({ where: { id: data.documentId } });
  if (!doc) {
    return NextResponse.json({ error: "Belge artık mevcut değil, geri yükleme yapılamaz" }, { status: 400 });
  }

  const annotation = await prisma.pdfAnnotation.create({
    data: {
      documentId: data.documentId,
      pageNumber: data.pageNumber,
      xPercent: data.xPercent,
      yPercent: data.yPercent,
      label: data.label,
      color: data.color,
      pinSize: data.pinSize,
      unitId: data.unitId,
      createdBy: data.createdBy,
    },
  });

  for (const m of data.media || []) {
    await prisma.annotationMedia.create({
      data: {
        annotationId: annotation.id,
        fileName: m.fileName,
        fileUrl: m.fileUrl,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        title: m.title,
        description: m.description,
      },
    });
  }

  for (const cm of data.checklistMedia || []) {
    await prisma.unitChecklistMedia.create({
      data: {
        annotationId: annotation.id,
        checklistItemId: cm.checklistItemId,
        fileName: cm.fileName,
        fileUrl: cm.fileUrl,
        mimeType: cm.mimeType,
        fileSize: cm.fileSize,
      },
    });
  }

  await prisma.trashItem.delete({ where: { id: trashItem.id } });
  return NextResponse.json({ success: true, restoredId: annotation.id });
}

async function restoreConstructionMedia(trashItem: { id: string; originalData: unknown }) {
  const data = trashItem.originalData as {
    mediaId: string;
    entryId: string;
    workId: string;
    blockId: string;
    floorId: string | null;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSize: number;
    title: string | null;
    description: string | null;
  };

  // Work hala var mı kontrol et
  const work = await prisma.constructionWork.findUnique({ where: { id: data.workId } });
  if (!work) {
    return NextResponse.json({ error: "İş kalemi artık mevcut değil, geri yükleme yapılamaz" }, { status: 400 });
  }

  // Entry var mı kontrol et, yoksa yeniden oluştur
  let entry = await prisma.constructionEntry.findFirst({
    where: { workId: data.workId, blockId: data.blockId, floorId: data.floorId ?? null },
  });

  if (!entry) {
    entry = await prisma.constructionEntry.create({
      data: { workId: data.workId, blockId: data.blockId, floorId: data.floorId },
    });
  }

  // Medyayı tekrar oluştur (dosya hala diskte)
  const media = await prisma.constructionEntryMedia.create({
    data: {
      entryId: entry.id,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      title: data.title,
      description: data.description,
    },
  });

  await prisma.trashItem.delete({ where: { id: trashItem.id } });
  return NextResponse.json({ success: true, restoredId: media.id });
}

async function restoreCategoryDocument(trashItem: { id: string; originalData: unknown }) {
  const data = trashItem.originalData as {
    documentId: string;
    categoryId: string;
    blockId: string | null;
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number | null;
    mimeType: string | null;
    docGroup: string | null;
    sourceDocumentId: string | null;
    uploadedBy: string;
    copies: {
      id: string;
      categoryId: string;
      blockId: string | null;
      fileName: string;
      fileUrl: string;
      fileType: string;
      fileSize: number | null;
      mimeType: string | null;
      docGroup: string | null;
      uploadedBy: string;
    }[];
  };

  // Kategori hala var mı kontrol et
  const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!category) {
    return NextResponse.json({ error: "Kategori artık mevcut değil, geri yükleme yapılamaz" }, { status: 400 });
  }

  // Dokümanı geri oluştur
  const document = await prisma.document.create({
    data: {
      categoryId: data.categoryId,
      blockId: data.blockId,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileType: data.fileType as "PDF" | "PHOTO" | "DOCUMENT" | "OTHER" | "INVOICE",
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      docGroup: data.docGroup,
      sourceDocumentId: data.sourceDocumentId,
      uploadedBy: data.uploadedBy,
    },
  });

  // Kopyaları da geri oluştur
  for (const copy of data.copies || []) {
    // Kopyanın kategorisi hala var mı
    const copyCategory = await prisma.category.findUnique({ where: { id: copy.categoryId } });
    if (copyCategory) {
      await prisma.document.create({
        data: {
          categoryId: copy.categoryId,
          blockId: copy.blockId,
          fileName: copy.fileName,
          fileUrl: copy.fileUrl,
          fileType: copy.fileType as "PDF" | "PHOTO" | "DOCUMENT" | "OTHER" | "INVOICE",
          fileSize: copy.fileSize,
          mimeType: copy.mimeType,
          docGroup: copy.docGroup,
          sourceDocumentId: document.id,
          uploadedBy: copy.uploadedBy,
        },
      });
    }
  }

  await prisma.trashItem.delete({ where: { id: trashItem.id } });
  return NextResponse.json({ success: true, restoredId: document.id });
}

type SalesProjectTrashData = {
  sourceType?: "standalone_project" | "site_sales_card";
  siteId?: string;
  project?: {
    id?: string;
    name?: string;
    description?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
  blocks?: {
    id?: string;
    name?: string;
    order?: number;
    createdAt?: string;
    updatedAt?: string;
    daires?: {
      id?: string;
      name?: string;
      order?: number;
      status?: string;
      price?: string | null;
      reservedFor?: string | null;
      notes?: string | null;
      createdAt?: string;
      updatedAt?: string;
      media?: {
        id?: string;
        fileName?: string;
        fileUrl?: string;
        mimeType?: string;
        fileSize?: number;
        title?: string | null;
        description?: string | null;
        createdAt?: string;
      }[];
    }[];
  }[];
};

function parseStoredDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function jsonConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function salesStatus(value: unknown): "AVAILABLE" | "RESERVED" | "SOLD" {
  return value === "RESERVED" || value === "SOLD" ? value : "AVAILABLE";
}

async function restoreSalesProject(trashItem: { id: string; siteId: string; itemName: string | null; originalData: unknown }) {
  const data = trashItem.originalData as SalesProjectTrashData;

  if (data.sourceType === "site_sales_card") {
    const siteId = data.siteId || trashItem.siteId;
    const site = await prisma.constructionSite.findUnique({
      where: { id: siteId },
      select: { config: true },
    });

    if (!site) {
      return NextResponse.json({ error: "Santiye artik mevcut degil, geri yukleme yapilamaz" }, { status: 400 });
    }

    const currentConfig = jsonConfig(site.config);
    await prisma.$transaction(async (tx) => {
      await tx.constructionSite.update({
        where: { id: siteId },
        data: { config: { ...currentConfig, salesHiddenFromSales: false } },
      });
      await tx.trashItem.delete({ where: { id: trashItem.id } });
    });

    return NextResponse.json({ success: true, restoredId: siteId });
  }

  if (data.sourceType !== "standalone_project" || !data.project) {
    return NextResponse.json({ error: "Satis projesi verisi eksik" }, { status: 400 });
  }

  const oldProjectId = data.project.id;
  const existing = oldProjectId
    ? await prisma.salesProject.findUnique({ where: { id: oldProjectId }, select: { id: true } })
    : null;
  const preserveIds = Boolean(oldProjectId && !existing);

  const restored = await prisma.$transaction(async (tx) => {
    const project = await tx.salesProject.create({
      data: {
        ...(preserveIds ? { id: oldProjectId } : {}),
        name: data.project?.name || trashItem.itemName || "Geri Yuklenen Satis Projesi",
        description: data.project?.description ?? null,
        ...(parseStoredDate(data.project?.createdAt) ? { createdAt: parseStoredDate(data.project?.createdAt) } : {}),
        blocks: {
          create: (data.blocks || []).map((block, blockIndex) => ({
            ...(preserveIds && block.id ? { id: block.id } : {}),
            name: block.name || `Blok ${blockIndex + 1}`,
            order: block.order ?? blockIndex,
            ...(parseStoredDate(block.createdAt) ? { createdAt: parseStoredDate(block.createdAt) } : {}),
            daires: {
              create: (block.daires || []).map((daire, daireIndex) => ({
                ...(preserveIds && daire.id ? { id: daire.id } : {}),
                name: daire.name || `Daire ${daireIndex + 1}`,
                order: daire.order ?? daireIndex,
                status: salesStatus(daire.status),
                price: daire.price ?? null,
                reservedFor: daire.reservedFor ?? null,
                notes: daire.notes ?? null,
                ...(parseStoredDate(daire.createdAt) ? { createdAt: parseStoredDate(daire.createdAt) } : {}),
                media: {
                  create: (daire.media || []).map((media) => ({
                    ...(preserveIds && media.id ? { id: media.id } : {}),
                    fileName: media.fileName || "dosya",
                    fileUrl: media.fileUrl || "",
                    mimeType: media.mimeType || "application/octet-stream",
                    fileSize: media.fileSize || 0,
                    title: media.title ?? null,
                    description: media.description ?? null,
                    ...(parseStoredDate(media.createdAt) ? { createdAt: parseStoredDate(media.createdAt) } : {}),
                  })),
                },
              })),
            },
          })),
        },
      },
      select: { id: true },
    });

    await tx.trashItem.delete({ where: { id: trashItem.id } });
    return project;
  });

  return NextResponse.json({ success: true, restoredId: restored.id });
}

// DELETE /api/trash/[id] — permanently delete (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    const { id } = await params;

    const trashItem = await prisma.trashItem.findUnique({ where: { id } });
    if (!trashItem) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    // Dosyaları diskten sil
    await permanentlyDeleteFiles(trashItem);

    await prisma.trashItem.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trash permanent delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

async function permanentlyDeleteFiles(item: { itemType: string; originalData: unknown }) {
  const data = item.originalData as Record<string, unknown>;
  const { unlink } = await import("fs/promises");

  try {
    if (item.itemType === "construction_media") {
      const fileUrl = data.fileUrl as string;
      if (fileUrl) {
        const fileName = fileUrl.split("/").pop();
        if (fileName) {
          const filePath = path.join(process.cwd(), "uploads", "construction", fileName);
          try { await unlink(filePath); } catch {}
        }
      }
    } else if (item.itemType === "category_document") {
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
      const salesData = data as SalesProjectTrashData;
      if (salesData.sourceType === "standalone_project") {
        const mediaItems = (salesData.blocks || []).flatMap(block =>
          (block.daires || []).flatMap(daire => daire.media || [])
        );
        for (const media of mediaItems) {
          const fileName = media.fileUrl?.split("/").pop();
          if (fileName) {
            const filePath = path.join(UPLOAD_DIR, "sales", path.basename(fileName));
            try { await unlink(filePath); } catch {}
          }
        }
      }
    } else if (item.itemType === "annotation") {
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
