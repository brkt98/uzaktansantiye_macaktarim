import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isManagerOrAbove, isSiteChiefScoped } from "@/lib/auth";
import { memCached, memInvalidate } from "@/lib/memCache";

// Tüm şantiyeleri listele
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { deletedAt: null };
    if (status) where.status = status;
    // Yalnızca Şantiye Şefi (daha üst rolü olmayan) sadece kendine atanmış şantiyeleri görür.
    // Çoklu rolde (örn. SITE_CHIEF + MANAGER) yetki genişler, kısıtlama uygulanmaz.
    const siteChiefScoped = isSiteChiefScoped(user.roles);
    if (siteChiefScoped) {
      where.members = { some: { userId: user.id } };
    }

    const cacheKey = `sites:list:${status ?? "all"}:${siteChiefScoped ? user.id : "global"}`;
    const sites = await memCached(cacheKey, 10 * 60 * 1000, () =>
      prisma.constructionSite.findMany({
        where,
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
          },
          _count: {
            select: {
              blocks: true,
              categories: true,
              costRecords: true,
              sitePersonnel: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    );

    return NextResponse.json({ sites });
  } catch (error) {
    console.error("Sites GET error:", error);
    return NextResponse.json({ error: "Şantiyeler getirilirken hata oluştu" }, { status: 500 });
  }
}

// Yeni şantiye oluştur
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isManagerOrAbove(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, address, startDate, endDate, siteType, blocks, categories, metraj } = body;

    if (!name) {
      return NextResponse.json({ error: "Şantiye adı gereklidir" }, { status: 400 });
    }

    const site = await prisma.constructionSite.create({
      data: {
        name,
        description,
        address,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        config: {
          ...(siteType ? { siteType } : {}),
          ...(blocks?.some((b: { squareMeters?: string }) => b.squareMeters)
            ? { blockSquareMeters: blocks.reduce((acc: Record<string, string>, b: { name: string; squareMeters?: string }) => {
                if (b.squareMeters) acc[b.name] = b.squareMeters;
                return acc;
              }, {}) }
            : {}),
          ...(Array.isArray(metraj) && metraj.length > 0 ? { metraj } : {}),
        },
      },
    });

    // Varsayılan blokları oluştur
    if (blocks && blocks.length > 0) {
      for (let i = 0; i < blocks.length; i++) {
        const block = await prisma.block.create({
          data: {
            siteId: site.id,
            name: blocks[i].name,
            order: i,
          },
        });

        // Varsayılan kat ve daireleri oluştur
        if (blocks[i].floors) {
          for (let j = 0; j < blocks[i].floors.length; j++) {
            const floor = await prisma.floor.create({
              data: {
                blockId: block.id,
                name: blocks[i].floors[j].name,
                order: j,
              },
            });

            if (blocks[i].floors[j].units) {
              for (let k = 0; k < blocks[i].floors[j].units.length; k++) {
                await prisma.unit.create({
                  data: {
                    floorId: floor.id,
                    name: blocks[i].floors[j].units[k].name,
                    order: k,
                  },
                });
              }
            }
          }
        }
      }
    }

    // Varsayılan kategorileri oluştur
    if (categories && categories.length > 0) {
      for (let i = 0; i < categories.length; i++) {
        await createCategoryTree(site.id, categories[i], null, i);
      }
    }

    // Varsayılan daire kontrol listesi oluştur
    const defaultChecklist = [
      { name: "Mutfak İşleri", children: [] as string[] },
      { name: "Odalar", children: [] as string[] },
      { name: "Islak Zemin", children: [] as string[] },
      { name: "Balkon", children: [] as string[] },
    ];
    for (let i = 0; i < defaultChecklist.length; i++) {
      const parent = await prisma.unitChecklistTemplate.create({
        data: { siteId: site.id, name: defaultChecklist[i].name, order: i },
      });
      for (let j = 0; j < defaultChecklist[i].children.length; j++) {
        await prisma.unitChecklistTemplate.create({
          data: { siteId: site.id, name: defaultChecklist[i].children[j], parentId: parent.id, order: j },
        });
      }
    }

    // Varsayılan inşaat şablonunu yeni şantiyeye kopyala
    try {
      const constructionDefault = await prisma.constructionDefault.findUnique({ where: { id: "default" } });
      if (constructionDefault) {
        const template = constructionDefault.template as { floors?: { name: string; type: string; order: number; works: { name: string; order: number }[] }[] };
        if (template?.floors) {
          for (const floorTpl of template.floors) {
            const floor = await prisma.constructionFloor.create({
              data: {
                siteId: site.id,
                name: floorTpl.name,
                type: floorTpl.type || "KABA_INSAAT",
                order: floorTpl.order,
              },
            });
            for (const workTpl of floorTpl.works || []) {
              await prisma.constructionWork.create({
                data: {
                  floorId: floor.id,
                  name: workTpl.name,
                  order: workTpl.order,
                },
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("Construction defaults copy error:", e);
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "ConstructionSite",
        entityId: site.id,
        details: { name },
      },
    });

    memInvalidate("sites:list");

    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    console.error("Sites POST error:", error);
    return NextResponse.json({ error: "Şantiye oluşturulurken hata oluştu" }, { status: 500 });
  }
}

// Yardımcı: Kategori ağacını oluştur
async function createCategoryTree(
  siteId: string,
  categoryData: { name: string; children?: any[]; workItems?: any[]; config?: Record<string, string> },
  parentId: string | null,
  order: number
) {
  const category = await prisma.category.create({
    data: {
      siteId,
      name: categoryData.name,
      parentCategoryId: parentId,
      order,
      ...(categoryData.config ? { config: categoryData.config } : {}),
    },
  });

  if (categoryData.children) {
    for (let i = 0; i < categoryData.children.length; i++) {
      await createCategoryTree(siteId, categoryData.children[i], category.id, i);
    }
  }

  if (categoryData.workItems) {
    for (let i = 0; i < categoryData.workItems.length; i++) {
      await prisma.workItem.create({
        data: {
          categoryId: category.id,
          name: categoryData.workItems[i].name,
          imageUrl: categoryData.workItems[i].imageUrl,
        },
      });
    }
  }
}
