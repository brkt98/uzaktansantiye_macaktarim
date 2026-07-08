import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "crypto";

// Custom (kullanıcı tarafından şantiye şefi sayfasından eklenen) iş kalemlerini yönetir.
// Storage:
//  - Non-INCE (KABA_INSAAT, BINA_GENEL, PEYZAJ, RUHSAT_ISKAN):
//      ConstructionWork doğrudan oluşturulur (seçilen floor altında).
//      Custom olduğunu izlemek için ConstructionDefault id=`cw_${type}_${siteId}_${blockId}`
//      template = { items: [{ id: workId, name, floorId }] }
//  - INCE_INSAAT:
//      ConstructionDefault id=`ince_${siteId}_${blockId}` template.unitOverrides[daireId].added[]
//      listesine isim eklenir. Mevcut /api/construction GET zaten eksik ConstructionWork'leri
//      otomatik oluşturuyor. Custom işaret için aynı template altında customNames: string[]
//      tutuyoruz (silmek için).

const NON_INCE_TYPES = ["KABA_INSAAT", "BINA_GENEL", "PEYZAJ", "RUHSAT_ISKAN"];

function customKey(type: string, siteId: string, blockId: string) {
  return `cw_${type}_${siteId}_${blockId}`;
}

// GET ?siteId=&blockId=&type=
// Döner: { customWorkIds: string[] }  (non-INCE)
//      veya { customNames: string[] } (INCE)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const blockId = searchParams.get("blockId");
    const type = searchParams.get("type");

    if (!siteId || !blockId || !type) {
      return NextResponse.json({ error: "siteId, blockId, type gerekli" }, { status: 400 });
    }

    if (type === "INCE_INSAAT") {
      const cfg = await prisma.constructionDefault.findUnique({
        where: { id: `ince_${siteId}_${blockId}` },
      });
      const tpl = (cfg?.template as any) || {};
      return NextResponse.json({ customNames: (tpl.customNames as string[]) || [] });
    }

    if (!NON_INCE_TYPES.includes(type)) {
      return NextResponse.json({ error: "Geçersiz type" }, { status: 400 });
    }

    const cfg = await prisma.constructionDefault.findUnique({
      where: { id: customKey(type, siteId, blockId) },
    });
    const tpl = (cfg?.template as any) || {};
    const items = (tpl.items as { id: string; name: string; floorId: string }[]) || [];
    return NextResponse.json({ customWorkIds: items.map((i) => i.id), items });
  } catch (error) {
    console.error("custom-works GET error:", error);
    return NextResponse.json({ error: "Veri getirilirken hata oluştu" }, { status: 500 });
  }
}

// POST { siteId, blockId, type, name, floorId? (non-INCE), daireIds? (INCE: string[] | "ALL") }
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });

    const body = await request.json();
    const { siteId, blockId, type, name } = body || {};
    if (!siteId || !blockId || !type || !name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "siteId, blockId, type, name gerekli" }, { status: 400 });
    }
    const trimmed = name.trim();

    // ============ INCE ============
    if (type === "INCE_INSAAT") {
      const cfgKey = `ince_${siteId}_${blockId}`;

      // Önce daire config'i hazırla / init et (GET ile aynı mantık)
      let cfg = await prisma.constructionDefault.findUnique({ where: { id: cfgKey } });
      const needInit = !cfg || !Array.isArray((cfg.template as any)?.daires) || ((cfg.template as any)?.daires?.length ?? 0) === 0;
      if (needInit) {
        const blockUnits = await prisma.unit.findMany({
          where: { floor: { blockId } },
          select: { id: true, name: true },
        });
        const initDaires = blockUnits.length > 0
          ? blockUnits.map(u => ({ id: u.id, name: u.name }))
          : Array.from({ length: 16 }, (_, i) => ({ id: randomUUID(), name: `Daire ${i + 1}` }));
        if (cfg) {
          const tpl0 = (cfg.template as any) || {};
          tpl0.daires = initDaires;
          await prisma.constructionDefault.update({ where: { id: cfgKey }, data: { template: tpl0 } });
        } else {
          await prisma.constructionDefault.create({
            data: { id: cfgKey, template: { daires: initDaires } },
          });
        }
        cfg = await prisma.constructionDefault.findUnique({ where: { id: cfgKey } });
      }

      let daireIds: string[] = [];
      if (body.daireIds === "ALL" || body.daireIds === undefined || body.daireIds === null) {
        const tpl = (cfg?.template as any) || {};
        const daires = (tpl.daires as { id: string; name: string }[]) || [];
        daireIds = daires.map((d) => d.id);
      } else if (Array.isArray(body.daireIds)) {
        daireIds = body.daireIds.filter((d: any) => typeof d === "string");
      }

      if (daireIds.length === 0) {
        return NextResponse.json({ error: "Daire bulunamadı / seçilmedi" }, { status: 400 });
      }

      const existing = cfg;
      const tpl = ((existing?.template as any) || {}) as {
        daires?: { id: string; name: string }[];
        unitOverrides?: Record<string, { added?: string[]; removed?: string[] }>;
        customNames?: string[];
      };

      tpl.unitOverrides = tpl.unitOverrides || {};
      for (const did of daireIds) {
        const ov = tpl.unitOverrides[did] || { added: [], removed: [] };
        ov.added = ov.added || [];
        if (!ov.added.includes(trimmed)) ov.added.push(trimmed);
        // Eğer removed listesindeyse çıkar
        if (ov.removed?.includes(trimmed)) ov.removed = ov.removed.filter((n) => n !== trimmed);
        tpl.unitOverrides[did] = ov;
      }
      tpl.customNames = tpl.customNames || [];
      if (!tpl.customNames.includes(trimmed)) tpl.customNames.push(trimmed);

      await prisma.constructionDefault.upsert({
        where: { id: cfgKey },
        update: { template: tpl as any },
        create: { id: cfgKey, template: tpl as any },
      });

      return NextResponse.json({ ok: true, name: trimmed, daireIds });
    }

    // ============ Non-INCE ============
    if (!NON_INCE_TYPES.includes(type)) {
      return NextResponse.json({ error: "Geçersiz type" }, { status: 400 });
    }
    const { floorId } = body;
    if (!floorId) return NextResponse.json({ error: "floorId gerekli" }, { status: 400 });

    // Floor doğrula
    let floor = await prisma.constructionFloor.findUnique({ where: { id: floorId } });
    if (!floor) return NextResponse.json({ error: "Floor bulunamadı" }, { status: 400 });
    if (floor.siteId !== siteId || floor.type !== type) {
      return NextResponse.json({ error: "Geçersiz floorId (site/tip uyuşmuyor)" }, { status: 400 });
    }

    // Eğer floor başka bir bloğa aitse hata
    if (floor.blockId && floor.blockId !== blockId) {
      return NextResponse.json({ error: "Geçersiz floorId (blok uyuşmuyor)" }, { status: 400 });
    }

    // Eğer floor blockId=null ise (site geneli fallback) → bloğa özel kopya oluştur
    if (floor.blockId === null) {
      const siteFloors = await prisma.constructionFloor.findMany({
        where: { siteId, type, blockId: null },
        include: { works: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      });

      const nameToNewId: Record<string, string> = {};
      for (const sf of siteFloors) {
        const nf = await prisma.constructionFloor.create({
          data: { siteId, type, name: sf.name, order: sf.order, blockId },
        });
        nameToNewId[sf.name] = nf.id;
        for (const w of sf.works) {
          await prisma.constructionWork.create({
            data: { floorId: nf.id, name: w.name, order: w.order },
          });
        }
      }

      const newFloorId = nameToNewId[floor.name];
      if (!newFloorId) {
        return NextResponse.json({ error: "Bloğa özel kat oluşturulamadı" }, { status: 500 });
      }
      const newFloor = await prisma.constructionFloor.findUnique({ where: { id: newFloorId } });
      if (!newFloor) {
        return NextResponse.json({ error: "Bloğa özel kat bulunamadı" }, { status: 500 });
      }
      floor = newFloor;
    }

    // En yüksek order'ı bul
    const last = await prisma.constructionWork.findFirst({
      where: { floorId: floor.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const newOrder = (last?.order ?? -1) + 1;

    const work = await prisma.constructionWork.create({
      data: { floorId: floor.id, name: trimmed, order: newOrder },
    });

    // Custom listesine ekle
    const cfgKey = customKey(type, siteId, blockId);
    const existing = await prisma.constructionDefault.findUnique({ where: { id: cfgKey } });
    const tpl = ((existing?.template as any) || {}) as {
      items?: { id: string; name: string; floorId: string }[];
    };
    tpl.items = tpl.items || [];
    tpl.items.push({ id: work.id, name: trimmed, floorId: floor.id });

    await prisma.constructionDefault.upsert({
      where: { id: cfgKey },
      update: { template: tpl as any },
      create: { id: cfgKey, template: tpl as any },
    });

    return NextResponse.json({ ok: true, work });
  } catch (error) {
    console.error("custom-works POST error:", error);
    return NextResponse.json({ error: "Eklenirken hata oluştu" }, { status: 500 });
  }
}

// DELETE
//  Non-INCE: ?siteId=&blockId=&type=&workId=
//  INCE:     ?siteId=&blockId=&type=INCE_INSAAT&name=&daireId=  (tek daireden çıkar)
//            ?siteId=&blockId=&type=INCE_INSAAT&name=&all=1     (tüm dairelerden çıkar + customNames'den sil)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const blockId = searchParams.get("blockId");
    const type = searchParams.get("type");

    if (!siteId || !blockId || !type) {
      return NextResponse.json({ error: "siteId, blockId, type gerekli" }, { status: 400 });
    }

    if (type === "INCE_INSAAT") {
      const name = searchParams.get("name");
      if (!name) return NextResponse.json({ error: "name gerekli" }, { status: 400 });
      const cfgKey = `ince_${siteId}_${blockId}`;
      const existing = await prisma.constructionDefault.findUnique({ where: { id: cfgKey } });
      if (!existing) return NextResponse.json({ ok: true });
      const tpl = ((existing.template as any) || {}) as {
        unitOverrides?: Record<string, { added?: string[]; removed?: string[] }>;
        customNames?: string[];
      };

      const daireId = searchParams.get("daireId");
      const all = searchParams.get("all") === "1";
      tpl.unitOverrides = tpl.unitOverrides || {};

      if (all || !daireId) {
        // Tüm dairelerden çıkar
        for (const did of Object.keys(tpl.unitOverrides)) {
          const ov = tpl.unitOverrides[did];
          if (ov?.added) ov.added = ov.added.filter((n) => n !== name);
        }
        tpl.customNames = (tpl.customNames || []).filter((n) => n !== name);
        // ConstructionWork'ü de sil (entries cascade)
        const work = await prisma.constructionWork.findFirst({
          where: { name, floor: { siteId, type: "INCE_INSAAT", blockId } },
        });
        if (work) {
          await prisma.constructionWork.delete({ where: { id: work.id } });
        }
      } else {
        // Sadece bu daireden çıkar
        const ov = tpl.unitOverrides[daireId];
        if (ov?.added) ov.added = ov.added.filter((n) => n !== name);
        tpl.unitOverrides[daireId] = ov || { added: [], removed: [] };
      }

      await prisma.constructionDefault.update({
        where: { id: cfgKey },
        data: { template: tpl as any },
      });

      return NextResponse.json({ ok: true });
    }

    // Non-INCE
    if (!NON_INCE_TYPES.includes(type)) {
      return NextResponse.json({ error: "Geçersiz type" }, { status: 400 });
    }
    const workId = searchParams.get("workId");
    if (!workId) return NextResponse.json({ error: "workId gerekli" }, { status: 400 });

    // Custom kaydı bul
    const cfgKey = customKey(type, siteId, blockId);
    const existing = await prisma.constructionDefault.findUnique({ where: { id: cfgKey } });
    if (existing) {
      const tpl = ((existing.template as any) || {}) as {
        items?: { id: string; name: string; floorId: string }[];
      };
      tpl.items = (tpl.items || []).filter((i) => i.id !== workId);
      await prisma.constructionDefault.update({
        where: { id: cfgKey },
        data: { template: tpl as any },
      });
    }

    // ConstructionWork sil (entries + media cascade ile silinir)
    try {
      await prisma.constructionWork.delete({ where: { id: workId } });
    } catch {
      // Zaten silinmişse görmezden gel
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("custom-works DELETE error:", error);
    return NextResponse.json({ error: "Silinirken hata oluştu" }, { status: 500 });
  }
}
