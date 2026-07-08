import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "crypto";

// Doğal sıralama: "Daire 1, Daire 2, ..., Daire 10" şeklinde sayısal sıralama
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

const DEFAULT_INCE_WORKS = [
  "Atık su + temiz su borulama", "Elektrik borulama + kablo çekimi",
  "Pencere ve balkon denizlik mermeri", "Alçı sıva", "Plastik Doğrama",
  "Yerden ısıtma", "Şap", "Audio/Diafon", "Doğalgaz Borulama", "Asma tavan",
  "Saten alçı + zımpara + boya", "Seramik (Duvar,Zemin,Derz)", "Laminat parke",
  "Süpürgelik", "Elektrik aksesuar montajı", "Vitrifiye montajı", "Duşakabin",
  "Korkuluk", "Mutfak dolap gövde", "Mutfak dolap kapak", "Mutfak tezgahı",
  "Mutfak tezgah arası seramik", "Kombi Montajı", "Çelik kapı", "İç kapılar",
  "Banyo dolabı", "Portmanto gövde kapak", "Katlanır cam", "Ankastre setler",
];

const DEFAULT_RUHSAT_ISKAN = [
  // Tek grup: Belgeler (Ruhsat + İskan birleştirildi)
  { name: "Belgeler", works: ["Yapı Denetim", "Saski Ruhsat", "Ruhsat Evrakı", "Abonelikler", "SGK", "Vergi Dairesi", "Saski İskan", "Kurumlar", "İskan Evrakı"] },
  { name: "Hazırlık", works: ["Aplikasyon-Likhap", "İmar Durumu", "Zemin Etüdü", "Haritacı"] },
  { name: "Proje", works: ["Mimari Proje", "Statik Proje", "Mekanik Proje", "Elektrik Projesi", "Uygulama Projesi"] },
];

// Şantiye + blok bazlı inşaat verilerini getir
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const blockId = searchParams.get("blockId");
    const type = searchParams.get("type") || "KABA_INSAAT";

    if (!siteId) {
      return NextResponse.json({ error: "siteId gerekli" }, { status: 400 });
    }

    const isInceInsaat = type === "INCE_INSAAT";

    // blockId varsa önce blok-spesifik floor'ları getir, yoksa site geneli (blockId null olanlar) fallback
    let floors = await prisma.constructionFloor.findMany({
      where: { siteId, type, blockId: blockId || null },
      orderBy: { order: "asc" },
      include: {
        works: {
          orderBy: { order: "asc" },
          include: {
            entries: (!isInceInsaat && blockId)
              ? {
                  where: { blockId },
                  include: { media: { orderBy: { createdAt: "asc" } } },
                }
              : false,
          },
        },
      },
    });

    // Fallback: blockId verildi ama blok-spesifik floor bulunamadıysa, site geneli floor'ları getir
    let fallback = false;
    if (blockId && floors.length === 0) {
      floors = await prisma.constructionFloor.findMany({
        where: { siteId, type, blockId: null },
        orderBy: { order: "asc" },
        include: {
          works: {
            orderBy: { order: "asc" },
            include: {
              entries: (!isInceInsaat && blockId)
                ? {
                    where: { blockId },
                    include: { media: { orderBy: { createdAt: "asc" } } },
                  }
                : false,
            },
          },
        },
      });
      fallback = true;
    }

    // İnce İnşaat: blok-spesifik floor yoksa otomatik oluştur (fallback site-level olsa bile)
    if (isInceInsaat && blockId) {
      const blockSpecificFloors = await prisma.constructionFloor.findMany({
        where: { siteId, type: "INCE_INSAAT", blockId },
        select: { id: true },
      });
      if (blockSpecificFloors.length === 0) {
        const existingConfig = await prisma.constructionDefault.findUnique({
          where: { id: `ince_${siteId}_${blockId}` },
        });
        // Eğer site-level "İnce İşler" varsa onun işlerini kopyala (custom dahil), yoksa default'tan al
        const siteLevelFloors = await prisma.constructionFloor.findMany({
          where: { siteId, type: "INCE_INSAAT", blockId: null },
          include: { works: { orderBy: { order: "asc" } } },
        });
        let workNames: string[];
        if (siteLevelFloors.length > 0 && siteLevelFloors[0].works.length > 0) {
          workNames = siteLevelFloors[0].works.map((w: any) => w.name);
        } else {
          const globalDefaults = await prisma.constructionDefault.findUnique({ where: { id: "default" } });
          const tpl = globalDefaults?.template as any;
          const inceFloorTpl = (tpl?.floors || []).find((f: any) => f.type === "INCE_INSAAT");
          workNames = inceFloorTpl ? inceFloorTpl.works.map((w: any) => w.name) : DEFAULT_INCE_WORKS;
        }

        // Daireleri bloğun gerçek unit'lerinden al
        const blockUnits = await prisma.unit.findMany({
          where: { floor: { blockId } },
          select: { id: true, name: true },
        });
        const daireNames = blockUnits.length > 0
          ? blockUnits.map(u => ({ id: u.id, name: u.name })).sort((a, b) => naturalCompare(a.name, b.name))
          : Array.from({ length: 16 }, (_, i) => ({ id: randomUUID(), name: `Daire ${i + 1}` }));

        // Floor + works oluştur (block-specific)
        const newFloor = await prisma.constructionFloor.create({
          data: { siteId, type: "INCE_INSAAT", name: "İnce İşler", order: 0, blockId },
        });
        for (let i = 0; i < workNames.length; i++) {
          await prisma.constructionWork.create({
            data: { floorId: newFloor.id, name: workNames[i], order: i },
          });
        }

        // Daire config oluştur (varsa template'i koru, sadece daires alanını ekle)
        const daires = daireNames;
        if (existingConfig) {
          const tpl0 = (existingConfig.template as any) || {};
          if (!Array.isArray(tpl0.daires) || tpl0.daires.length === 0) {
            tpl0.daires = daires;
            await prisma.constructionDefault.update({
              where: { id: `ince_${siteId}_${blockId}` },
              data: { template: tpl0 },
            });
          }
        } else {
          await prisma.constructionDefault.create({
            data: { id: `ince_${siteId}_${blockId}`, template: { daires } },
          });
        }

        // Re-fetch (her zaman block-specific)
        floors = await prisma.constructionFloor.findMany({
          where: { siteId, type: "INCE_INSAAT", blockId },
          orderBy: { order: "asc" },
          include: { works: { orderBy: { order: "asc" } } },
        }) as any;
        fallback = false;
      } else if (fallback) {
        // Block-specific floor zaten vardı ama önceki fetch fallback ile geldi — yeniden block-specific çek
        floors = await prisma.constructionFloor.findMany({
          where: { siteId, type: "INCE_INSAAT", blockId },
          orderBy: { order: "asc" },
          include: { works: { orderBy: { order: "asc" } } },
        }) as any;
        fallback = false;
      }
    }

    // Kaba İnşaat / Peyzaj / Ruhsat-İskan: otomatik varsayılan oluştur (henüz veri yoksa)
    if (!isInceInsaat && blockId && floors.length === 0) {
      const globalDefaults = await prisma.constructionDefault.findUnique({ where: { id: "default" } });
      const tpl = globalDefaults?.template as any;
      let tplFloors = (tpl?.floors || []).filter((f: any) => f.type === type);

      // Ruhsat-İskan için şablonda tanım yoksa dahili default kullan
      if (tplFloors.length === 0 && type === "RUHSAT_ISKAN") {
        tplFloors = DEFAULT_RUHSAT_ISKAN.map((g, i) => ({
          name: g.name,
          type: "RUHSAT_ISKAN",
          order: i,
          works: g.works.map((w, wi) => ({ name: w, order: wi })),
        }));
      }

      if (tplFloors.length > 0) {
        // Bloğun gerçek katlarını al (Katlar genişletmesi için)
        const blockFloors = await prisma.floor.findMany({
          where: { blockId },
          orderBy: { name: 'asc' },
          select: { name: true },
        });

        // Sabit kat isimlerini topla (Katlar genişletmesinde tekrar olmasın)
        const fixedFloorNames = new Set(
          tplFloors.filter((f: any) => !f.isKatlar).map((f: any) => f.name)
        );

        let orderCounter = 0;
        for (const tplFloor of tplFloors) {
          if (tplFloor.isKatlar && blockFloors.length > 0) {
            // "Katlar" şablon grubunu bloğun gerçek katlarına genişlet
            for (const bf of blockFloors) {
              if (fixedFloorNames.has(bf.name)) continue; // sabit tanımlı katları atla
              const newFloor = await prisma.constructionFloor.create({
                data: { siteId, type, name: bf.name, order: orderCounter++, blockId },
              });
              for (let i = 0; i < tplFloor.works.length; i++) {
                await prisma.constructionWork.create({
                  data: { floorId: newFloor.id, name: tplFloor.works[i].name, order: i },
                });
              }
            }
          } else {
            // Normal floor (Hafriyat, Yalıtım, Temel, Çatı, Peyzaj, Ruhsat-İskan grupları)
            const newFloor = await prisma.constructionFloor.create({
              data: { siteId, type, name: tplFloor.name, order: orderCounter++, blockId },
            });
            if (tplFloor.works.length > 0) {
              for (let i = 0; i < tplFloor.works.length; i++) {
                await prisma.constructionWork.create({
                  data: { floorId: newFloor.id, name: tplFloor.works[i].name, order: i },
                });
              }
            }
          }
        }

        // Re-fetch with entries
        floors = await prisma.constructionFloor.findMany({
          where: { siteId, type, blockId },
          orderBy: { order: "asc" },
          include: {
            works: {
              orderBy: { order: "asc" },
              include: {
                entries: {
                  where: { blockId },
                  include: { media: { orderBy: { createdAt: "asc" } } },
                },
              },
            },
          },
        });
        fallback = false;
      }
    }

    // İnce İnşaat: daire listesi + tüm entry'lerin medya sayıları
    if (isInceInsaat && blockId) {
      let daireConfig = await prisma.constructionDefault.findUnique({
        where: { id: `ince_${siteId}_${blockId}` },
      });

      // Daire config yok veya boşsa otomatik oluştur (floors zaten varsa bile)
      let needInit = !daireConfig;
      if (daireConfig) {
        const tpl0 = (daireConfig.template as any) || {};
        if (!Array.isArray(tpl0.daires) || tpl0.daires.length === 0) needInit = true;
      }
      if (needInit) {
        const blockUnits = await prisma.unit.findMany({
          where: { floor: { blockId } },
          select: { id: true, name: true },
        });
        const initDaires = blockUnits.length > 0
          ? blockUnits.map(u => ({ id: u.id, name: u.name })).sort((a, b) => naturalCompare(a.name, b.name))
          : Array.from({ length: 16 }, (_, i) => ({ id: randomUUID(), name: `Daire ${i + 1}` }));

        if (daireConfig) {
          const tpl0 = (daireConfig.template as any) || {};
          tpl0.daires = initDaires;
          await prisma.constructionDefault.update({
            where: { id: `ince_${siteId}_${blockId}` },
            data: { template: tpl0 },
          });
          daireConfig = await prisma.constructionDefault.findUnique({
            where: { id: `ince_${siteId}_${blockId}` },
          });
        } else {
          daireConfig = await prisma.constructionDefault.create({
            data: { id: `ince_${siteId}_${blockId}`, template: { daires: initDaires } },
          });
        }
      }

      const tplData = daireConfig?.template as any;
      const rawDaires = tplData?.daires || [];
      // Daireleri fiziksel Unit.order'a göre sırala
      const daireIds = rawDaires.map((d: any) => d.id).filter(Boolean);
      const unitOrders = daireIds.length > 0 ? await prisma.unit.findMany({
        where: { id: { in: daireIds } },
        select: { id: true, order: true, floor: { select: { order: true } } },
      }) : [];
      const orderMap = new Map(unitOrders.map((u: any) => [u.id, (u.floor?.order ?? 0) * 10000 + (u.order ?? 0)]));
      const daires = [...rawDaires].sort((a: any, b: any) => {
        const oa = orderMap.get(a.id) ?? 99999;
        const ob = orderMap.get(b.id) ?? 99999;
        if (oa !== ob) return oa - ob;
        return naturalCompare(a.name, b.name);
      });
      const unitOverrides = tplData?.unitOverrides || {};

      // Auto-create ConstructionWork records for per-daire added works
      const allAddedNames = new Set<string>();
      for (const ov of Object.values(unitOverrides as Record<string, { added?: string[]; removed?: string[] }>)) {
        for (const name of (ov.added || [])) allAddedNames.add(name);
      }
      if (allAddedNames.size > 0 && floors.length > 0) {
        const existingWorkNames = new Set(floors.flatMap((f: any) => (f.works || []).map((w: any) => w.name)));
        const targetFloorId = floors[0].id;
        let maxOrder = Math.max(0, ...floors.flatMap((f: any) => (f.works || []).map((w: any) => w.order)));
        let created = false;
        for (const name of allAddedNames) {
          if (!existingWorkNames.has(name)) {
            maxOrder++;
            await prisma.constructionWork.create({ data: { floorId: targetFloorId, name, order: maxOrder } });
            created = true;
          }
        }
        if (created) {
          floors = await prisma.constructionFloor.findMany({
            where: { siteId, type: "INCE_INSAAT", blockId },
            orderBy: { order: "asc" },
            include: { works: { orderBy: { order: "asc" } } },
          }) as any;
        }
      }

      const workIds = floors.flatMap((f: any) => f.works.map((w: any) => w.id));
      const allEntries: Record<string, { mediaCount: number; status: string }> = {};

      if (workIds.length > 0) {
        const entries = await prisma.constructionEntry.findMany({
          where: {
            workId: { in: workIds },
            blockId,
            floorId: { not: null },
          },
          include: { media: { select: { id: true } } },
        });
        for (const entry of entries) {
          if (entry.floorId) {
            allEntries[`${entry.workId}:${entry.floorId}`] = { mediaCount: entry.media.length, status: entry.status };
          }
        }
      }

      return NextResponse.json({ floors, daires, allEntries, unitOverrides, fallback });
    }

    return NextResponse.json({ floors, fallback });
  } catch (error) {
    console.error("Construction GET error:", error);
    return NextResponse.json({ error: "Veri getirilirken hata oluştu" }, { status: 500 });
  }
}

// Şantiye inşaat yapısını güncelle (kat/iş ekleme çıkarma)
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { siteId, type, floors, blockId, daires } = body;

    if (!siteId || !type || !Array.isArray(floors)) {
      return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
    }

    // İnce İnşaat daire listesini kaydet
    if (type === "INCE_INSAAT" && daires && blockId) {
      const template: any = { daires };
      if (body.unitOverrides) {
        template.unitOverrides = body.unitOverrides;
      }
      await prisma.constructionDefault.upsert({
        where: { id: `ince_${siteId}_${blockId}` },
        create: { id: `ince_${siteId}_${blockId}`, template },
        update: { template },
      });
    }

    // Mevcut floor ID'lerini topla (blockId bazlı)
    const existingFloors = await prisma.constructionFloor.findMany({
      where: { siteId, type, blockId: blockId || null },
      include: { works: true },
    });
    const existingFloorIds = new Set(existingFloors.map((f) => f.id));
    const existingWorkIds = new Set(existingFloors.flatMap((f) => f.works.map((w) => w.id)));

    const incomingFloorIds = new Set<string>();
    const incomingWorkIds = new Set<string>();

    for (let i = 0; i < floors.length; i++) {
      const floorData = floors[i];
      let floorId: string;

      if (floorData.id && existingFloorIds.has(floorData.id)) {
        // Mevcut floor'u güncelle
        await prisma.constructionFloor.update({
          where: { id: floorData.id },
          data: { name: floorData.name, order: i },
        });
        floorId = floorData.id;
      } else {
        // Yeni floor oluştur
        const newFloor = await prisma.constructionFloor.create({
          data: { siteId, type, name: floorData.name, order: i, blockId: blockId || null },
        });
        floorId = newFloor.id;
      }
      incomingFloorIds.add(floorId);

      // Works
      if (Array.isArray(floorData.works) && floorData.works.length > 0) {
        for (let j = 0; j < floorData.works.length; j++) {
          const workData = floorData.works[j];
          let workId: string;

          if (workData.id && existingWorkIds.has(workData.id)) {
            await prisma.constructionWork.update({
              where: { id: workData.id },
              data: { name: workData.name, order: j, floorId },
            });
            workId = workData.id;
          } else {
            const newWork = await prisma.constructionWork.create({
              data: { floorId, name: workData.name, order: j },
            });
            workId = newWork.id;
          }
          incomingWorkIds.add(workId);
        }
      }
    }

    // İnce İnşaat: per-daire eklenen işler için ConstructionWork kayıtları oluştur
    if (type === "INCE_INSAAT" && body.unitOverrides && blockId) {
      const allAddedNames = new Set<string>();
      for (const ov of Object.values(body.unitOverrides as Record<string, { added?: string[]; removed?: string[] }>)) {
        for (const name of (ov.added || [])) allAddedNames.add(name);
      }
      if (allAddedNames.size > 0) {
        const firstFloorId = incomingFloorIds.values().next().value;
        if (firstFloorId) {
          const existingPerDaireWorks = await prisma.constructionWork.findMany({
            where: { floorId: firstFloorId, name: { in: [...allAddedNames] } },
          });
          const existingByName = new Map(existingPerDaireWorks.map(w => [w.name, w]));
          let maxOrder = 9000;
          for (const name of allAddedNames) {
            const existing = existingByName.get(name);
            if (existing) {
              incomingWorkIds.add(existing.id);
            } else {
              const newWork = await prisma.constructionWork.create({
                data: { floorId: firstFloorId, name, order: maxOrder++ },
              });
              incomingWorkIds.add(newWork.id);
            }
          }
        }
      }
    }

    // Silinenleri temizle
    const worksToDelete = [...existingWorkIds].filter((id) => !incomingWorkIds.has(id));
    const floorsToDelete = [...existingFloorIds].filter((id) => !incomingFloorIds.has(id));

    if (worksToDelete.length > 0) {
      await prisma.constructionWork.deleteMany({ where: { id: { in: worksToDelete } } });
    }
    if (floorsToDelete.length > 0) {
      await prisma.constructionFloor.deleteMany({ where: { id: { in: floorsToDelete } } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Construction PUT error:", error);
    return NextResponse.json({ error: "Güncelleme hatası" }, { status: 500 });
  }
}
