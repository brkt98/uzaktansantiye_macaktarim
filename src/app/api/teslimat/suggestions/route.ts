import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/teslimat/suggestions - Geçmiş malzeme adı ve tedarikçi önerileri
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [items, teslimatlar] = await Promise.all([
      prisma.teslimatItem.findMany({
        select: { materialName: true },
        distinct: ["materialName"],
        orderBy: { materialName: "asc" },
        take: 1000,
      }),
      prisma.teslimat.findMany({
        select: { supplier: true },
        where: { supplier: { not: null } },
        distinct: ["supplier"],
        orderBy: { supplier: "asc" },
        take: 500,
      }),
    ]);

    const materials = items
      .map((i) => i.materialName?.trim())
      .filter((s): s is string => !!s);
    const suppliers = teslimatlar
      .map((t) => t.supplier?.trim())
      .filter((s): s is string => !!s);

    return NextResponse.json({ materials, suppliers });
  } catch (error) {
    console.error("Teslimat suggestions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
