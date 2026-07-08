import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: Proje detayı (full tree)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;

    const project = await prisma.salesProject.findUnique({
      where: { id },
      include: {
        blocks: {
          orderBy: { order: "asc" },
          include: {
            floors: { orderBy: { order: "asc" } },
            daires: {
              orderBy: { order: "asc" },
              include: {
                _count: { select: { media: true } },
              },
            },
          },
        },
      },
    });
    if (!project) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    const allDaireIds = project.blocks.flatMap((b) => b.daires.map((d) => d.id));
    const [buyers, docs] = await Promise.all([
      prisma.buyer.findMany({
        where: { targetType: "daire", targetId: { in: allDaireIds } },
        include: { payments: { select: { amount: true } } },
      }),
      prisma.salesDocument.findMany({
        where: { targetType: "daire", targetId: { in: allDaireIds } },
        select: { targetId: true },
      }),
    ]);
    const buyerByDaire = new Map(buyers.map((b) => [b.targetId, b]));
    const docCountByDaire = new Map<string, number>();
    for (const d of docs) {
      docCountByDaire.set(d.targetId, (docCountByDaire.get(d.targetId) ?? 0) + 1);
    }

    const enriched = {
      ...project,
      blocks: project.blocks.map((b) => ({
        ...b,
        daires: b.daires.map((d) => {
          const buyer = buyerByDaire.get(d.id);
          const totalPaid = buyer
            ? buyer.payments.reduce((s, p) => s + Number(p.amount), 0)
            : 0;
          const priceNum = d.price ? Number(d.price) : null;
          const remaining = priceNum != null ? Math.max(0, priceNum - totalPaid) : null;
          return {
            ...d,
            price: d.price ? d.price.toString() : null,
            hasMedia: d._count.media > 0,
            hasDocuments: (docCountByDaire.get(d.id) ?? 0) > 0,
            buyerName: buyer?.name ?? null,
            buyerPhone: buyer?.phone ?? null,
            totalPaid: buyer ? totalPaid.toFixed(2) : null,
            remainingAmount: remaining != null ? remaining.toFixed(2) : null,
          };
        }),
      })),
    };

    return NextResponse.json({ project: enriched });
  } catch (err) {
    console.error("Sales project GET error:", err);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

// PUT: Proje adını/açıklamasını güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const data: any = {};
    if (typeof body?.name === "string") data.name = body.name.trim();
    if (typeof body?.description === "string" || body?.description === null)
      data.description = body.description;
    const project = await prisma.salesProject.update({ where: { id }, data });
    return NextResponse.json({ project });
  } catch (err) {
    console.error("Sales project PUT error:", err);
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 });
  }
}

// DELETE: Projeyi cop kutusuna tasi, sonra cascade ile aktif listeden kaldir
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;

    const project = await prisma.salesProject.findUnique({
      where: { id },
      include: {
        blocks: {
          orderBy: { order: "asc" },
          include: {
            daires: {
              orderBy: { order: "asc" },
              include: {
                media: { orderBy: { createdAt: "asc" } },
              },
            },
          },
        },
      },
    });

    if (!project) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.trashItem.create({
        data: {
          siteId: project.id,
          siteName: project.name,
          itemType: "sales_project",
          itemName: project.name,
          deletedBy: user.id,
          deletedByName: `${user.firstName} ${user.lastName}`,
          originalData: {
            sourceType: "standalone_project",
            project: {
              id: project.id,
              name: project.name,
              description: project.description,
              createdAt: project.createdAt.toISOString(),
              updatedAt: project.updatedAt.toISOString(),
            },
            blocks: project.blocks.map((block) => ({
              id: block.id,
              name: block.name,
              order: block.order,
              createdAt: block.createdAt.toISOString(),
              updatedAt: block.updatedAt.toISOString(),
              daires: block.daires.map((daire) => ({
                id: daire.id,
                name: daire.name,
                order: daire.order,
                status: daire.status,
                price: daire.price ? daire.price.toString() : null,
                reservedFor: daire.reservedFor,
                notes: daire.notes,
                createdAt: daire.createdAt.toISOString(),
                updatedAt: daire.updatedAt.toISOString(),
                media: daire.media.map((media) => ({
                  id: media.id,
                  fileName: media.fileName,
                  fileUrl: media.fileUrl,
                  mimeType: media.mimeType,
                  fileSize: media.fileSize,
                  title: media.title,
                  description: media.description,
                  createdAt: media.createdAt.toISOString(),
                })),
              })),
            })),
          },
        },
      });

      await tx.salesProject.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Sales project DELETE error:", err);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
