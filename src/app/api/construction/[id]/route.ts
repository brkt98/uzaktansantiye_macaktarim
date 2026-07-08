import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { maybeOptimizeImage } from "@/lib/imageOptimize";

// Hücre medyalarını getir veya hücreye medya yükle
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id: workId } = await params;
    const { searchParams } = new URL(request.url);
    const blockId = searchParams.get("blockId");
    const floorId = searchParams.get("floorId") || null;

    if (!blockId) {
      return NextResponse.json({ error: "blockId gerekli" }, { status: 400 });
    }

    const entry = await prisma.constructionEntry.findFirst({
      where: { workId, blockId, floorId: floorId ?? null },
      include: { media: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({
      entry: entry ? { id: entry.id, startDate: entry.startDate, endDate: entry.endDate, status: entry.status } : null,
      media: entry?.media || [],
    });
  } catch (error) {
    console.error("Construction entry GET error:", error);
    return NextResponse.json({ error: "Veri getirilirken hata oluştu" }, { status: 500 });
  }
}

// Medya yükle
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id: workId } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const blockId = formData.get("blockId") as string;
    const floorId = (formData.get("floorId") as string) || null;
    const title = (formData.get("title") as string) || null;
    const description = (formData.get("description") as string) || null;

    if (!file || !blockId) {
      return NextResponse.json({ error: "Dosya ve blockId gerekli" }, { status: 400 });
    }

    // Tamamlanmış iş kontrolü - USER rolü değişiklik yapamaz (ADMIN ve SUPER_ADMIN serbest)
    const existingCheck = await prisma.constructionEntry.findFirst({
      where: { workId, blockId, floorId: floorId ?? null },
    });
    if (existingCheck?.status === "COMPLETED" && !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Tamamlanmış işe medya eklenemez" }, { status: 403 });
    }

    // Entry yoksa oluştur
    let entry = await prisma.constructionEntry.findFirst({
      where: { workId, blockId, floorId: floorId ?? null },
      include: { media: true },
    });

    const isFirstMedia = !entry || entry.media.length === 0;

    if (!entry) {
      entry = await prisma.constructionEntry.create({
        data: { workId, blockId, floorId, startDate: new Date(), status: "IN_PROGRESS" },
        include: { media: true },
      });
    } else if (isFirstMedia && entry.status === "NOT_STARTED") {
      // İlk medya yüklenirken startDate ve status otomatik atanır - mevcut startDate varsa dokunma
      entry = await prisma.constructionEntry.update({
        where: { id: entry.id },
        data: { startDate: entry.startDate || new Date(), status: "IN_PROGRESS" },
        include: { media: true },
      });
    } else if (isFirstMedia && entry.status === "IN_PROGRESS") {
      // IN_PROGRESS'te medyası yokken yeniden yüklenirse sadece startDate boşsa damgala; tarihlere/duruma dokunma
      if (!entry.startDate) {
        entry = await prisma.constructionEntry.update({
          where: { id: entry.id },
          data: { startDate: new Date() },
          include: { media: true },
        });
      }
    }
    // COMPLETED entry'ye medya eklenmesi tarihleri/durumu DEĞİŞTİRMEZ.
    // Yeniden açmak için kullanıcı "İşi Devam Ettir" butonunu kullanmalıdır.

    // Dosya kaydet
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const optimized = await maybeOptimizeImage(buffer, file.type, file.name);

    const uploadDir = path.join(process.cwd(), "uploads", "construction");
    await mkdir(uploadDir, { recursive: true });

    const ext = path.extname(optimized.fileName) || path.extname(file.name);
    const uniqueId = uuidv4();
    const uniqueName = `${uniqueId}${ext}`;
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, optimized.buffer);

    if (optimized.thumbnail) {
      const thumbName = `${uniqueId}.thumb.webp`;
      await writeFile(path.join(uploadDir, thumbName), optimized.thumbnail.buffer);
    }

    const media = await prisma.constructionEntryMedia.create({
      data: {
        entryId: entry.id,
        fileName: file.name,
        fileUrl: `/api/construction/media/${uniqueName}`,
        mimeType: optimized.mimeType,
        fileSize: optimized.buffer.length,
        title,
        description,
      },
    });

    return NextResponse.json({ media: { ...media, entryId: entry.id }, entryStatus: entry.status, entryStartDate: entry.startDate }, { status: 201 });
  } catch (error) {
    console.error("Construction entry POST error:", error);
    return NextResponse.json({ error: "Dosya yüklenirken hata oluştu" }, { status: 500 });
  }
}

// Medya başlık/açıklama güncelle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const body = await request.json();
    const { mediaId, title, description, fileName, entryStartDate, entryEndDate, entryStatus, blockId, floorId } = body;

    // İş durumu güncelleme (İş Bitir / İşi Devam Ettir)
    if (entryStatus !== undefined) {
      const { id: workId } = await params;
      if (!blockId) {
        return NextResponse.json({ error: "blockId gerekli" }, { status: 400 });
      }
      // "İşi Devam Ettir" sadece ADMIN yapabilir
      if (entryStatus === "IN_PROGRESS") {
        const existingEntry = await prisma.constructionEntry.findFirst({
          where: { workId, blockId, floorId: floorId ?? null },
        });
        if (existingEntry?.status === "COMPLETED" && !isAdmin(user.roles)) {
          return NextResponse.json({ error: "Sadece yöneticiler tamamlanmış işi yeniden açabilir" }, { status: 403 });
        }
      }
      let entry = await prisma.constructionEntry.findFirst({
        where: { workId, blockId, floorId: floorId ?? null },
      });
      if (!entry) {
        entry = await prisma.constructionEntry.create({
          data: { workId, blockId, floorId },
        });
      }
      const statusUpdate: any = { status: entryStatus };
      if (entryStatus === "COMPLETED") {
        // Sadece bitiş tarihi yoksa otomatik ata
        if (!entry.endDate) {
          statusUpdate.endDate = new Date();
        }
        // Başlangıç tarihi yoksa fallback: mevcut endDate veya bugün (31-kayıt bug'ını önler)
        if (!entry.startDate) {
          statusUpdate.startDate = entry.endDate ?? new Date();
        }
      } else if (entryStatus === "IN_PROGRESS") {
        // İşi devam ettir → bitiş tarihi temizlenir; admin gerekirse sonradan düzenler
        statusUpdate.endDate = null;
      }
      const updated = await prisma.constructionEntry.update({
        where: { id: entry.id },
        data: statusUpdate,
      });
      return NextResponse.json({ entry: { id: updated.id, startDate: updated.startDate, endDate: updated.endDate, status: updated.status } });
    }

    // Entry tarih güncelleme
    if (entryStartDate !== undefined || entryEndDate !== undefined) {
      const { id: workId } = await params;
      if (!blockId) {
        return NextResponse.json({ error: "blockId gerekli" }, { status: 400 });
      }

      // 10 gün öncesi kontrolü — ADMIN/SUPER_ADMIN bu limite tabi değildir
      const isAdminForLimit = isAdmin(user.roles);
      if (!isAdminForLimit) {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        tenDaysAgo.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (entryStartDate) {
          const d = new Date(entryStartDate);
          if (d < tenDaysAgo || d > today) {
            return NextResponse.json({ error: "Başlangıç tarihi bugün ile 10 gün öncesi arasında olmalıdır" }, { status: 400 });
          }
        }
        if (entryEndDate) {
          const d = new Date(entryEndDate);
          if (d < tenDaysAgo || d > today) {
            return NextResponse.json({ error: "Bitiş tarihi bugün ile 10 gün öncesi arasında olmalıdır" }, { status: 400 });
          }
        }
      }

      let entry = await prisma.constructionEntry.findFirst({
        where: { workId, blockId, floorId: floorId ?? null },
      });
      if (!entry) {
        entry = await prisma.constructionEntry.create({
          data: { workId, blockId, floorId },
        });
      }

      // OVERWRITE GUARD: protect existing dates from accidental overwrite/null.
      // Only ADMIN/SUPER_ADMIN may clear an existing date or change it to a different day.
      const isAdminUser = isAdmin(user.roles);
      const sameDay = (a: Date | null | undefined, b: Date | null | undefined) => {
        if (!a || !b) return false;
        const da = new Date(a); const db = new Date(b);
        return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
      };
      if (!isAdminUser) {
        if (entryStartDate !== undefined && entry.startDate) {
          // existing startDate present
          if (entryStartDate === null || entryStartDate === "") {
            return NextResponse.json({ error: "Mevcut başlangıç tarihini sadece yöneticiler silebilir" }, { status: 403 });
          }
          if (!sameDay(new Date(entryStartDate), entry.startDate)) {
            return NextResponse.json({ error: "Mevcut başlangıç tarihini sadece yöneticiler değiştirebilir" }, { status: 403 });
          }
        }
        if (entryEndDate !== undefined && entry.endDate) {
          if (entryEndDate === null || entryEndDate === "") {
            return NextResponse.json({ error: "Mevcut bitiş tarihini sadece yöneticiler silebilir" }, { status: 403 });
          }
          if (!sameDay(new Date(entryEndDate), entry.endDate)) {
            return NextResponse.json({ error: "Mevcut bitiş tarihini sadece yöneticiler değiştirebilir" }, { status: 403 });
          }
        }
      }

      const entryUpdate: any = {};
      if (entryStartDate !== undefined) entryUpdate.startDate = entryStartDate ? new Date(entryStartDate) : null;
      if (entryEndDate !== undefined) entryUpdate.endDate = entryEndDate ? new Date(entryEndDate) : null;
      // No-op safety: if nothing actually changes, skip write
      if (Object.keys(entryUpdate).length === 0) {
        return NextResponse.json({ entry });
      }
      const updated = await prisma.constructionEntry.update({
        where: { id: entry.id },
        data: entryUpdate,
      });
      return NextResponse.json({ entry: updated });
    }

    if (!mediaId) {
      return NextResponse.json({ error: "mediaId gerekli" }, { status: 400 });
    }

    // Tamamlanmış iş kontrolü - USER rolü düzenleme yapamaz
    const mediaCheck = await prisma.constructionEntryMedia.findUnique({
      where: { id: mediaId },
      include: { entry: { select: { status: true } } },
    });
    if (mediaCheck?.entry.status === "COMPLETED" && !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Tamamlanmış işte düzenleme yapılamaz" }, { status: 403 });
    }

    const updateData: any = {
      title: title ?? null,
      description: description ?? null,
    };
    if (fileName !== undefined) {
      updateData.fileName = fileName;
    }

    const media = await prisma.constructionEntryMedia.update({
      where: { id: mediaId },
      data: updateData,
    });

    return NextResponse.json({ media });
  } catch (error) {
    console.error("Construction media PATCH error:", error);
    return NextResponse.json({ error: "Güncelleme hatası" }, { status: 500 });
  }
}

// Medya sil (çöp kutusuna taşı)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get("mediaId");

    if (!mediaId) {
      return NextResponse.json({ error: "mediaId gerekli" }, { status: 400 });
    }

    const media = await prisma.constructionEntryMedia.findUnique({
      where: { id: mediaId },
      include: {
        entry: {
          include: {
            work: {
              include: {
                floor: {
                  include: { site: { select: { id: true, name: true } } }
                }
              }
            }
          }
        }
      },
    });

    if (!media) {
      return NextResponse.json({ error: "Medya bulunamadı" }, { status: 404 });
    }

    // Tamamlanmış iş kontrolü - USER rolü silme yapamaz (ADMIN/SUPER_ADMIN serbest)
    if (media.entry.status === "COMPLETED" && !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Tamamlanmış işten medya silinemez" }, { status: 403 });
    }

    // Blok bilgisi
    const blockId = media.entry.blockId;
    let blockName: string | null = null;
    if (blockId) {
      const block = await prisma.block.findUnique({ where: { id: blockId }, select: { name: true } });
      blockName = block?.name || null;
    }

    const site = media.entry.work.floor.site;

    // Çöp kutusuna taşı
    await prisma.trashItem.create({
      data: {
        siteId: site.id,
        siteName: site.name,
        blockId: blockId,
        blockName: blockName,
        itemType: "construction_media",
        itemName: media.fileName,
        deletedBy: user.id,
        deletedByName: `${user.firstName} ${user.lastName}`,
        originalData: {
          mediaId: media.id,
          entryId: media.entryId,
          workId: media.entry.workId,
          blockId: media.entry.blockId,
          floorId: media.entry.floorId,
          fileName: media.fileName,
          fileUrl: media.fileUrl,
          mimeType: media.mimeType,
          fileSize: media.fileSize,
          title: media.title,
          description: media.description,
          floorName: media.entry.work.floor.name,
          workName: media.entry.work.name,
          constructionType: media.entry.work.floor.type,
        },
      },
    });

    // DB'den sil (dosya diskte kalıyor, çöp kutusundan geri yüklenebilir)
    await prisma.constructionEntryMedia.delete({
      where: { id: mediaId },
    });

    // Check remaining media count.
    // ÖNEMLİ: Son medya silinse bile mevcut tarihler ve durum KORUNUR.
    // Tarih veya durumu temizlemek isteyen admin bunu manuel yapmalıdır.
    // (Eski davranış: status=NOT_STARTED, startDate=null, endDate=null → veri kaybına yol açıyordu.)
    const remainingMedia = await prisma.constructionEntryMedia.count({
      where: { entryId: media.entryId },
    });

    return NextResponse.json({ success: true, remainingMedia, entryReset: false });
  } catch (error) {
    console.error("Construction entry DELETE error:", error);
    return NextResponse.json({ error: "Silme hatası" }, { status: 500 });
  }
}
