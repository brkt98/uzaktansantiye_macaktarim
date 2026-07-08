import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isManagerOrAbove, isSiteChiefScoped, isAdmin } from "@/lib/auth";
import { memInvalidate } from "@/lib/memCache";

// Tek şantiye detayı
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

    const site = await prisma.constructionSite.findUnique({
      where: { id },
      include: {
        blocks: {
          orderBy: { order: "asc" },
          include: {
            floors: {
              orderBy: { order: "asc" },
              include: {
                units: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        },
        categories: {
          where: { parentCategoryId: null },
          orderBy: { order: "asc" },
          include: {
            subCategories: {
              orderBy: { order: "asc" },
              include: {
                subCategories: {
                  orderBy: { order: "asc" },
                  include: {
                    workItems: true,
                    subCategories: {
                      orderBy: { order: "asc" },
                    },
                  },
                },
                workItems: true,
              },
            },
            workItems: true,
          },
        },
        _count: {
          select: {
            costRecords: true,
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: "Şantiye bulunamadı" }, { status: 404 });
    }

    // Soft-deleted şantiyeye erişim engelle
    if (site.deletedAt) {
      return NextResponse.json({ error: "Şantiye bulunamadı" }, { status: 404 });
    }

    // SITE_CHIEF (daha üst rolü yoksa): yalnızca atanmış olduğu şantiyeyi görebilir
    if (isSiteChiefScoped(user.roles)) {
      const member = await prisma.siteMember.findFirst({
        where: { siteId: id, userId: user.id },
        select: { id: true },
      });
      if (!member) {
        return NextResponse.json({ error: "Bu şantiyeye erişim yetkiniz yok" }, { status: 403 });
      }
    }

    return NextResponse.json({ site });
  } catch (error) {
    console.error("Site GET error:", error);
    return NextResponse.json({ error: "Şantiye getirilirken hata oluştu" }, { status: 500 });
  }
}

// Şantiye güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isManagerOrAbove(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, address, status, startDate, endDate, siteType, blocks, categories, metraj } = body;

    // Temel alanları güncelle
    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (address !== undefined) updateData.address = address;
    if (status) updateData.status = status;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (siteType !== undefined) {
      const existing = await prisma.constructionSite.findUnique({ where: { id }, select: { config: true } });
      const oldConfig = (existing?.config as Record<string, unknown>) || {};
      updateData.config = { ...oldConfig, siteType: siteType || undefined };
    }
    if (metraj !== undefined) {
      const existing = await prisma.constructionSite.findUnique({ where: { id }, select: { config: true } });
      const oldConfig = (updateData.config as Record<string, unknown>) || (existing?.config as Record<string, unknown>) || {};
      updateData.config = { ...oldConfig, metraj: Array.isArray(metraj) ? metraj : [] };
    }

    const site = await prisma.constructionSite.update({
      where: { id },
      data: updateData,
    });

    // Blokları senkronize et
    if (blocks !== undefined) {
      const existing = await prisma.block.findMany({
        where: { siteId: id },
        include: { floors: { include: { units: true } } },
      });
      const existingIds = new Set(existing.map((b) => b.id));
      const incomingIds = new Set(blocks.filter((b: { id?: string }) => b.id).map((b: { id: string }) => b.id));

      // Silinen blokları kaldır
      for (const eb of existing) {
        if (!incomingIds.has(eb.id)) {
          await prisma.block.delete({ where: { id: eb.id } });
        }
      }

      // Blokları oluştur veya güncelle
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        let blockId: string;

        if (b.id && existingIds.has(b.id)) {
          await prisma.block.update({ where: { id: b.id }, data: { name: b.name, order: i } });
          blockId = b.id;
        } else {
          const created = await prisma.block.create({ data: { siteId: id, name: b.name, order: i } });
          blockId = created.id;
        }

        // Katları senkronize et
        if (b.floors) {
          const existingFloors = await prisma.floor.findMany({
            where: { blockId },
            include: { units: true },
          });
          const existingFloorIds = new Set(existingFloors.map((f) => f.id));
          const incomingFloorIds = new Set(b.floors.filter((f: { id?: string }) => f.id).map((f: { id: string }) => f.id));

          for (const ef of existingFloors) {
            if (!incomingFloorIds.has(ef.id)) {
              await prisma.floor.delete({ where: { id: ef.id } });
            }
          }

          for (let j = 0; j < b.floors.length; j++) {
            const f = b.floors[j];
            let floorId: string;

            if (f.id && existingFloorIds.has(f.id)) {
              await prisma.floor.update({ where: { id: f.id }, data: { name: f.name, order: j } });
              floorId = f.id;
            } else {
              const created = await prisma.floor.create({ data: { blockId, name: f.name, order: j } });
              floorId = created.id;
            }

            // Daireleri senkronize et
            if (f.units) {
              const existingUnits = await prisma.unit.findMany({ where: { floorId } });
              const existingUnitIds = new Set(existingUnits.map((u) => u.id));
              const incomingUnitIds = new Set(f.units.filter((u: { id?: string }) => u.id).map((u: { id: string }) => u.id));

              for (const eu of existingUnits) {
                if (!incomingUnitIds.has(eu.id)) {
                  await prisma.unit.delete({ where: { id: eu.id } });
                }
              }

              for (let k = 0; k < f.units.length; k++) {
                const u = f.units[k];
                if (u.id && existingUnitIds.has(u.id)) {
                  await prisma.unit.update({ where: { id: u.id }, data: { name: u.name, order: k } });
                } else {
                  await prisma.unit.create({ data: { floorId, name: u.name, order: k } });
                }
              }
            }
          }
        }
      }

      // ─── İnşaat Takip Tabloları Otomatik Senkronizasyon ───
      // Blok/kat/daire değişikliklerini inşaat tablolarına yansıt
      try {
        const globalDefaults = await prisma.constructionDefault.findUnique({ where: { id: "default" } });
        const tpl = (globalDefaults?.template as any) || { floors: [] };

        // Güncel blokları (yeni oluşturulanlar dahil) DB'den çek
        const currentBlocks = await prisma.block.findMany({
          where: { siteId: id },
          include: { floors: { include: { units: true }, orderBy: { name: "asc" } } },
        });

        // 1) Silinen blokların inşaat verilerini temizle
        const currentBlockIds = new Set(currentBlocks.map((b) => b.id));
        const deletedBlockIds = [...existingIds].filter((bid) => !currentBlockIds.has(bid));
        for (const dbid of deletedBlockIds) {
          await prisma.constructionFloor.deleteMany({ where: { siteId: id, blockId: dbid } });
          await prisma.constructionDefault.deleteMany({ where: { id: `ince_${id}_${dbid}` } });
        }

        // 2) Her blok için KABA_INSAAT, BINA_GENEL, PEYZAJ senkronizasyonu
        const FLOOR_TYPES = ["KABA_INSAAT", "BINA_GENEL", "PEYZAJ"] as const;
        for (const block of currentBlocks) {
          const realFloorNames = block.floors.map((f) => f.name);

          for (const cType of FLOOR_TYPES) {
            const tplFloors = ((tpl.floors || []) as any[]).filter((f: any) => f.type === cType);
            if (tplFloors.length === 0) continue;

            const katlarTpl = tplFloors.find((f: any) => f.isKatlar);
            const fixedFloorNames = new Set(
              tplFloors.filter((f: any) => !f.isKatlar).map((f: any) => f.name)
            );

            const existingCFloors = await prisma.constructionFloor.findMany({
              where: { siteId: id, type: cType, blockId: block.id },
              orderBy: { order: "asc" },
            });

            if (existingCFloors.length === 0) {
              // Tablo henüz oluşturulmamış → template'den tam oluştur
              let orderCounter = 0;
              for (const tplFloor of tplFloors) {
                if (tplFloor.isKatlar && realFloorNames.length > 0) {
                  for (const fname of realFloorNames) {
                    if (fixedFloorNames.has(fname)) continue;
                    const nf = await prisma.constructionFloor.create({
                      data: { siteId: id, type: cType, name: fname, order: orderCounter++, blockId: block.id },
                    });
                    for (let wi = 0; wi < (tplFloor.works || []).length; wi++) {
                      await prisma.constructionWork.create({
                        data: { floorId: nf.id, name: tplFloor.works[wi].name, order: wi },
                      });
                    }
                  }
                } else {
                  const nf = await prisma.constructionFloor.create({
                    data: { siteId: id, type: cType, name: tplFloor.name, order: orderCounter++, blockId: block.id },
                  });
                  for (let wi = 0; wi < (tplFloor.works || []).length; wi++) {
                    await prisma.constructionWork.create({
                      data: { floorId: nf.id, name: tplFloor.works[wi].name, order: wi },
                    });
                  }
                }
              }
            } else if (katlarTpl) {
              // Tablo var + "Katlar" şablonu var → kat ekleme/silme senkronize et
              const existingKatlarNames = new Set(
                existingCFloors.filter((cf) => !fixedFloorNames.has(cf.name)).map((cf) => cf.name)
              );
              const realKatlarNames = new Set(
                realFloorNames.filter((fn) => !fixedFloorNames.has(fn))
              );

              // Yeni katlar ekle
              let maxOrder = Math.max(0, ...existingCFloors.map((cf) => cf.order));
              for (const fname of realKatlarNames) {
                if (!existingKatlarNames.has(fname)) {
                  maxOrder++;
                  const nf = await prisma.constructionFloor.create({
                    data: { siteId: id, type: cType, name: fname, order: maxOrder, blockId: block.id },
                  });
                  for (let wi = 0; wi < (katlarTpl.works || []).length; wi++) {
                    await prisma.constructionWork.create({
                      data: { floorId: nf.id, name: katlarTpl.works[wi].name, order: wi },
                    });
                  }
                }
              }

              // Silinen katları kaldır
              for (const cf of existingCFloors) {
                if (!fixedFloorNames.has(cf.name) && !realKatlarNames.has(cf.name)) {
                  await prisma.constructionFloor.delete({ where: { id: cf.id } });
                }
              }
            }
          }

          // 3) İnce İşler (INCE_INSAAT) senkronizasyonu
          const allUnits = block.floors.flatMap((f) => f.units);
          const inceConfigId = `ince_${id}_${block.id}`;
          const inceConfig = await prisma.constructionDefault.findUnique({ where: { id: inceConfigId } });

          if (inceConfig) {
            // Config var → daire listesi güncelle
            const configData = inceConfig.template as any;
            const currentDaires = allUnits.map((u) => ({ id: u.id, name: u.name }));
            const currentUnitIds = new Set(allUnits.map((u) => u.id));

            // unitOverrides'dan silinen daireleri temizle
            const unitOverrides = configData.unitOverrides || {};
            const cleanedOverrides: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(unitOverrides)) {
              if (currentUnitIds.has(key)) cleanedOverrides[key] = val;
            }

            await prisma.constructionDefault.update({
              where: { id: inceConfigId },
              data: { template: { ...configData, daires: currentDaires, unitOverrides: cleanedOverrides } },
            });
          } else if (allUnits.length > 0) {
            // Config yok + daire var → İnce İşler oluştur
            const inceFloorTpl = ((tpl.floors || []) as any[]).find((f: any) => f.type === "INCE_INSAAT");
            const workNames: string[] = inceFloorTpl
              ? inceFloorTpl.works.map((w: any) => w.name)
              : [
                  "Atık su + temiz su borulama", "Elektrik borulama + kablo çekimi",
                  "Pencere ve balkon denizlik mermeri", "Alçı sıva", "Plastik Doğrama",
                  "Yerden ısıtma", "Şap", "Audio/Diafon", "Doğalgaz Borulama", "Asma tavan",
                  "Saten alçı + zımpara + boya", "Seramik (Duvar,Zemin,Derz)", "Laminat parke",
                  "Süpürgelik", "Elektrik aksesuar montajı", "Vitrifiye montajı", "Duşakabin",
                  "Korkuluk", "Mutfak dolap gövde", "Mutfak dolap kapak", "Mutfak tezgahı",
                  "Mutfak tezgah arası seramik", "Kombi Montajı", "Çelik kapı", "İç kapılar",
                  "Banyo dolabı", "Portmanto gövde kapak", "Katlanır cam", "Ankastre setler",
                ];

            // İnce İşler floor henüz yoksa oluştur
            const existingInceFloors = await prisma.constructionFloor.findMany({
              where: { siteId: id, type: "INCE_INSAAT", blockId: block.id },
            });
            if (existingInceFloors.length === 0) {
              const nf = await prisma.constructionFloor.create({
                data: { siteId: id, type: "INCE_INSAAT", name: "İnce İşler", order: 0, blockId: block.id },
              });
              for (let wi = 0; wi < workNames.length; wi++) {
                await prisma.constructionWork.create({
                  data: { floorId: nf.id, name: workNames[wi], order: wi },
                });
              }
            }

            // Daire config oluştur
            const daires = allUnits.map((u) => ({ id: u.id, name: u.name }));
            await prisma.constructionDefault.create({
              data: { id: inceConfigId, template: { daires } },
            });
          }
        }
      } catch (syncErr) {
        console.error("Construction auto-sync error:", syncErr);
        // Ana işlemi engellemeden devam et
      }
    }

    // Kategorileri senkronize et
    if (categories !== undefined) {
      const existingCats = await prisma.category.findMany({ where: { siteId: id } });
      const existingCatIds = new Set(existingCats.map((c) => c.id));

      // Gelen ID'leri topla
      const collectIds = (cats: { id?: string; children?: unknown[] }[]): Set<string> => {
        const ids = new Set<string>();
        for (const c of cats) {
          if (c.id) ids.add(c.id);
          if (c.children) {
            for (const childId of collectIds(c.children as { id?: string; children?: unknown[] }[])) {
              ids.add(childId);
            }
          }
        }
        return ids;
      };
      const incomingCatIds = collectIds(categories);

      // Silinenleri kaldır (en alt seviyeden başla)
      const toDelete = existingCats.filter((c) => !incomingCatIds.has(c.id));
      // Önce child'ları, sonra parent'ları sil
      const childFirst = toDelete.sort((a, b) => {
        if (a.parentCategoryId && !b.parentCategoryId) return -1;
        if (!a.parentCategoryId && b.parentCategoryId) return 1;
        return 0;
      });
      for (const c of childFirst) {
        await prisma.category.delete({ where: { id: c.id } }).catch(() => {});
      }

      // Kategori ağacını oluştur/güncelle
      const syncCategoryTree = async (
        cats: { id?: string; name: string; children?: unknown[]; config?: Record<string, string> }[],
        parentId: string | null
      ) => {
        for (let i = 0; i < cats.length; i++) {
          const c = cats[i];
          let catId: string;

          if (c.id && existingCatIds.has(c.id)) {
            await prisma.category.update({
              where: { id: c.id },
              data: { name: c.name, order: i, parentCategoryId: parentId, ...(c.config ? { config: c.config } : {}) },
            });
            catId = c.id;
          } else {
            const created = await prisma.category.create({
              data: {
                siteId: id, name: c.name, order: i, parentCategoryId: parentId,
                ...(c.config ? { config: c.config } : {}),
              },
            });
            catId = created.id;
          }

          if (c.children && (c.children as unknown[]).length > 0) {
            await syncCategoryTree(
              c.children as { id?: string; name: string; children?: unknown[]; config?: Record<string, string> }[],
              catId
            );
          }
        }
      };

      await syncCategoryTree(categories, null);
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "ConstructionSite",
        entityId: id,
        details: body,
      },
    });

    memInvalidate("sites:list");

    return NextResponse.json({ site });
  } catch (error) {
    console.error("Site PUT error:", error);
    return NextResponse.json({ error: "Şantiye güncellenirken hata oluştu" }, { status: 500 });
  }
}

// Şantiye sil (soft delete — çöp kutusuna taşı)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;

    // Soft delete: deletedAt tarihini ayarla
    await prisma.constructionSite.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: user.id,
        deletedByName: `${user.firstName} ${user.lastName}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "SOFT_DELETE",
        entityType: "ConstructionSite",
        entityId: id,
      },
    });

    memInvalidate("sites:list");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Site DELETE error:", error);
    return NextResponse.json({ error: "Şantiye silinirken hata oluştu" }, { status: 500 });
  }
}
