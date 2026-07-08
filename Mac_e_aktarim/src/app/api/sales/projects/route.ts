import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: Tüm sales projeleri listele
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const projects = await prisma.salesProject.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        blocks: {
          include: {
            daires: {
              select: { id: true, status: true, _count: { select: { media: true } } },
            },
          },
        },
      },
    });

    const result = projects.map((p) => {
      const allDaires = p.blocks.flatMap((b) => b.daires);
      const totalUnits = allDaires.length;
      const sold = allDaires.filter((d) => d.status === "SOLD").length;
      const reserved = allDaires.filter((d) => d.status === "RESERVED").length;
      const available = allDaires.filter((d) => d.status === "AVAILABLE").length;
      const mediaCount = allDaires.reduce((sum, d) => sum + d._count.media, 0);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: p.createdAt,
        blockCount: p.blocks.length,
        totalUnits,
        sold,
        reserved,
        available,
        mediaCount,
      };
    });

    return NextResponse.json({ projects: result });
  } catch (err) {
    console.error("Sales projects GET error:", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

// POST: Yeni proje oluştur
// body (yeni): { name, description?, blocks: [{ name, floors: [{ name, daires: [{ name }] }] }] }
// body (eski geriye uyumlu): { name, description?, blocks: [{ name, daires: [{ name }] }] }
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await request.json();
    const name = (body?.name as string | undefined)?.trim();
    const description = (body?.description as string | undefined) ?? null;
    const blocks = Array.isArray(body?.blocks) ? body.blocks : [];

    if (!name) {
      return NextResponse.json({ error: "Proje adı zorunlu" }, { status: 400 });
    }

    // İki aşamalı: proje + bloklar + katlar üst seviyede oluştur,
    // sonra daire'leri floorId ile (varsa) bağla.
    const project = await prisma.salesProject.create({
      data: {
        name,
        description,
        blocks: {
          create: blocks.map((b: any, bi: number) => ({
            name: String(b?.name ?? `Blok ${bi + 1}`).trim() || `Blok ${bi + 1}`,
            order: bi,
          })),
        },
      },
      include: { blocks: true },
    });

    // Block isim -> id mapping
    const blockById = new Map(project.blocks.map((b) => [b.name + "::" + b.order, b.id]));

    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      const blockName = String(b?.name ?? `Blok ${bi + 1}`).trim() || `Blok ${bi + 1}`;
      const blockId = blockById.get(blockName + "::" + bi);
      if (!blockId) continue;

      const hasFloors = Array.isArray(b?.floors) && b.floors.length > 0;

      if (hasFloors) {
        for (let fi = 0; fi < b.floors.length; fi++) {
          const f = b.floors[fi];
          const floorName = String(f?.name ?? `Kat ${fi + 1}`).trim() || `Kat ${fi + 1}`;
          const floor = await prisma.salesFloor.create({
            data: { blockId, name: floorName, order: fi },
          });
          const daires = Array.isArray(f?.daires) ? f.daires : [];
          if (daires.length > 0) {
            await prisma.salesDaire.createMany({
              data: daires.map((d: any, di: number) => ({
                blockId,
                floorId: floor.id,
                name: String(d?.name ?? `Daire ${di + 1}`).trim() || `Daire ${di + 1}`,
                order: di,
              })),
            });
          }
        }
      } else {
        // Geriye uyumlu: floors yoksa flat daires
        const daires = Array.isArray(b?.daires) ? b.daires : [];
        if (daires.length > 0) {
          await prisma.salesDaire.createMany({
            data: daires.map((d: any, di: number) => ({
              blockId,
              name: String(d?.name ?? `Daire ${di + 1}`).trim() || `Daire ${di + 1}`,
              order: di,
            })),
          });
        }
      }
    }

    const full = await prisma.salesProject.findUnique({
      where: { id: project.id },
      include: {
        blocks: {
          include: {
            floors: { include: { daires: true }, orderBy: { order: "asc" } },
            daires: true,
          },
        },
      },
    });

    return NextResponse.json({ project: full }, { status: 201 });
  } catch (err) {
    console.error("Sales project POST error:", err);
    return NextResponse.json({ error: "Oluşturulamadı" }, { status: 500 });
  }
}
