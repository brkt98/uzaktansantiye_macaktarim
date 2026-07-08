import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "104857600"); // 100MB

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
  "dwg", "dxf", "zip", "rar", "7z", "txt", "csv",
]);

function getFileType(mimeType: string): "PDF" | "PHOTO" | "DOCUMENT" | "OTHER" {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "PHOTO";
  if (mimeType.includes("word") || mimeType.includes("excel") || mimeType.includes("spreadsheet") || mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "DOCUMENT";
  return "OTHER";
}

// GET - List documents for a category
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await params;
    const group = request.nextUrl.searchParams.get("group");
    const blockId = request.nextUrl.searchParams.get("blockId");

    const where: Record<string, unknown> = { categoryId: id };
    if (group) where.docGroup = group;
    if (blockId) where.blockId = blockId;
    else where.blockId = null;

    const documents = await prisma.document.findMany({
      where,
      include: {
        uploader: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Documents GET error:", error);
    return NextResponse.json({ error: "Dosyalar getirilirken hata oluştu" }, { status: 500 });
  }
}

// POST - Upload a document to a category
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await params;

    // Verify category exists
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      return NextResponse.json({ error: "Kategori bulunamadı" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Dosya seçilmedi" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Dosya boyutu çok büyük (max 50MB)" }, { status: 400 });
    }

    // Validate extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Desteklenmeyen dosya formatı: .${ext}` }, { status: 400 });
    }

    // Create upload directory
    const categoryDir = path.join(UPLOAD_DIR, "categories", id);
    await mkdir(categoryDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const baseName = `${timestamp}_${sanitizedName}`;

    // Write file (optimize if image)
    const bytes = await file.arrayBuffer();
    const optimized = await maybeOptimizeImage(Buffer.from(bytes), file.type, baseName);
    const fileName = optimized.fileName;
    const filePath = path.join(categoryDir, fileName);
    await writeFile(filePath, optimized.buffer);
    if (optimized.thumbnail) {
      await writeFile(path.join(categoryDir, thumbFileName(fileName)), optimized.thumbnail.buffer);
    }

    // Save to database
    const docGroup = formData.get("group") as string | null;
    const blockId = formData.get("blockId") as string | null;
    const fileUrl = `/api/categories/${id}/documents/download/${fileName}`;
    const document = await prisma.document.create({
      data: {
        categoryId: id,
        fileName: file.name,
        fileUrl,
        fileType: getFileType(optimized.mimeType),
        fileSize: optimized.buffer.length,
        mimeType: optimized.mimeType,
        uploadedBy: user.id,
        ...(docGroup ? { docGroup } : {}),
        ...(blockId ? { blockId } : {}),
      },
    });

    // Ruhsatlandırma Uygulama Projesi otomatik kopya oluşturma
    if (docGroup === "uygulama") {
      await createRuhsatCopies(category, document.id, file.name, fileUrl, getFileType(optimized.mimeType), optimized.buffer.length, optimized.mimeType, user.id, blockId);
    }

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json({ error: "Dosya yüklenirken hata oluştu" }, { status: 500 });
  }
}

// DELETE - Delete a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id: categoryId } = await params;
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: "Dosya ID gerekli" }, { status: 400 });
    }

    // Verify document exists and belongs to this category
    const doc = await prisma.document.findFirst({
      where: { id: documentId, categoryId },
      include: {
        category: {
          include: { site: { select: { id: true, name: true } } }
        },
        block: { select: { id: true, name: true } },
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    // Kopyaları kaydet (geri yüklemede tekrar oluşturulacak)
    const copies = await prisma.document.findMany({
      where: { sourceDocumentId: documentId },
    });

    // Çöp kutusuna taşı
    await prisma.trashItem.create({
      data: {
        siteId: doc.category?.site?.id || "",
        siteName: doc.category?.site?.name || null,
        blockId: doc.block?.id || doc.blockId || null,
        blockName: doc.block?.name || null,
        itemType: "category_document",
        itemName: doc.fileName,
        deletedBy: user.id,
        deletedByName: `${user.firstName} ${user.lastName}`,
        originalData: {
          documentId: doc.id,
          categoryId: doc.categoryId,
          blockId: doc.blockId,
          fileName: doc.fileName,
          fileUrl: doc.fileUrl,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          docGroup: doc.docGroup,
          sourceDocumentId: doc.sourceDocumentId,
          uploadedBy: doc.uploadedBy,
          copies: copies.map(c => ({
            id: c.id,
            categoryId: c.categoryId,
            blockId: c.blockId,
            fileName: c.fileName,
            fileUrl: c.fileUrl,
            fileType: c.fileType,
            fileSize: c.fileSize,
            mimeType: c.mimeType,
            docGroup: c.docGroup,
            uploadedBy: c.uploadedBy,
          })),
          categoryName: doc.category?.name || null,
        },
      },
    });

    // Kopyaları sil
    for (const copy of copies) {
      await prisma.document.delete({ where: { id: copy.id } });
    }

    // DB'den sil (dosya diskte kalıyor)
    await prisma.document.delete({ where: { id: documentId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Document delete error:", error);
    return NextResponse.json({ error: "Dosya silinirken hata oluştu" }, { status: 500 });
  }
}

// PATCH - Rename a document
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id: categoryId } = await params;
    const { documentId, fileName } = await request.json();

    if (!documentId || !fileName) {
      return NextResponse.json({ error: "Dosya ID ve yeni ad gerekli" }, { status: 400 });
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, categoryId },
    });

    if (!doc) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { fileName },
    });

    // Eğer orijinal bir Ruhsatlandırma dosyasıysa, kopyaların adlarını güncelle
    const copies = await prisma.document.findMany({
      where: { sourceDocumentId: documentId },
      include: { category: true },
    });
    for (const copy of copies) {
      const catName = copy.category?.name || "";
      const ext = fileName.match(/\.[^/.]+$/)?.[0] || "";
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      const copyName = `${nameWithoutExt} - ${catName}${ext}`;
      await prisma.document.update({
        where: { id: copy.id },
        data: { fileName: copyName },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Document rename error:", error);
    return NextResponse.json({ error: "Dosya adı değiştirilirken hata oluştu" }, { status: 500 });
  }
}

// Ruhsatlandırma kategorisine yüklenen dosyaların Kaba İnşaat ve İnce İşler'e otomatik kopyalarını oluştur
async function createRuhsatCopies(
  category: { id: string; name: string; parentCategoryId: string | null; siteId: string },
  sourceDocId: string,
  originalFileName: string,
  fileUrl: string,
  fileType: "PDF" | "PHOTO" | "DOCUMENT" | "OTHER",
  fileSize: number,
  mimeType: string,
  uploadedBy: string,
  blockId: string | null
) {
  try {
    // Ruhsatlandırma kategorisi mi kontrol et (kendisi veya herhangi bir ata)
    let isRuhsat = category.name.toLowerCase().includes("ruhsat");
    let ruhsatCategoryId = isRuhsat ? category.id : null;
    let currentCat = category;

    // Yukarı doğru yürü - ata kategorilerde "ruhsat" var mı?
    while (!isRuhsat && currentCat.parentCategoryId) {
      const parent = await prisma.category.findUnique({
        where: { id: currentCat.parentCategoryId },
        select: { id: true, name: true, parentCategoryId: true, siteId: true },
      });
      if (!parent) break;
      if (parent.name.toLowerCase().includes("ruhsat")) {
        isRuhsat = true;
        ruhsatCategoryId = parent.id;
      }
      currentCat = parent;
    }

    if (!isRuhsat) return;

    // Ruhsatlandırma'nın üst kategorisini (Kaba İnşaat) bul
    const ruhsatCat = await prisma.category.findUnique({
      where: { id: ruhsatCategoryId! },
      select: { parentCategoryId: true, siteId: true },
    });

    if (!ruhsatCat?.parentCategoryId) return;
    const parentCatId = ruhsatCat.parentCategoryId;

    // Aynı site'daki tüm block-scope root kategorileri bul (Kaba İnşaat, İnce İşler)
    const blockCategories = await prisma.category.findMany({
      where: {
        siteId: category.siteId,
        parentCategoryId: null,
      },
    });

    // scope=block olan root kategorileri filtrele
    const targetCategories = blockCategories.filter(
      (c) => c.config && typeof c.config === "object" && (c.config as Record<string, unknown>).scope === "block"
    );

    if (targetCategories.length === 0) return;

    // Dosya adından uzantıyı ayır
    const ext = originalFileName.match(/\.[^/.]+$/)?.[0] || "";
    const nameWithoutExt = originalFileName.replace(/\.[^/.]+$/, "");

    // Her hedef kategoride (Kaba İnşaat, İnce İşler) bir kopya oluştur
    for (const targetCat of targetCategories) {
      const copyName = `${nameWithoutExt} - ${targetCat.name}${ext}`;
      await prisma.document.create({
        data: {
          categoryId: targetCat.id,
          fileName: copyName,
          fileUrl, // Aynı fiziksel dosyaya işaret eder
          fileType,
          fileSize,
          mimeType,
          uploadedBy,
          sourceDocumentId: sourceDocId,
          ...(blockId ? { blockId } : {}),
        },
      });
    }
  } catch (error) {
    console.error("Ruhsat copy creation error:", error);
    // Kopya oluşturma hatası ana yüklemeyi engellemez
  }
}


