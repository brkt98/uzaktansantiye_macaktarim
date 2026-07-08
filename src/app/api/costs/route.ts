import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, canAccessFinance } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    if (!siteId) {
      return NextResponse.json({ error: "siteId gereklidir" }, { status: 400 });
    }

    const costs = await prisma.costRecord.findMany({
      where: { siteId },
      orderBy: { date: "desc" },
      include: {
        category: { select: { name: true } },
        creator: { select: { firstName: true, lastName: true } },
        documents: true,
      },
    });

    // Özet hesapla
    const summary = {
      totalExpense: costs.filter((c: { type: string }) => c.type === "EXPENSE" || c.type === "INVOICE").reduce((sum: number, c: { amount: number }) => sum + c.amount, 0),
      totalIncome: costs.filter((c: { type: string }) => c.type === "INCOME").reduce((sum: number, c: { amount: number }) => sum + c.amount, 0),
      totalPayment: costs.filter((c: { type: string }) => c.type === "PAYMENT").reduce((sum: number, c: { amount: number }) => sum + c.amount, 0),
      unpaidCount: costs.filter((c: { isPaid: boolean; type: string }) => !c.isPaid && (c.type === "EXPENSE" || c.type === "INVOICE")).length,
    };

    return NextResponse.json({ costs, summary });
  } catch (error) {
    console.error("Costs GET error:", error);
    return NextResponse.json({ error: "Maliyetler getirilirken hata oluştu" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canAccessFinance(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { siteId, categoryId, type, amount, description, vendor, date, dueDate, isPaid } = body;

    if (!siteId || !amount) {
      return NextResponse.json({ error: "siteId ve amount gereklidir" }, { status: 400 });
    }

    const cost = await prisma.costRecord.create({
      data: {
        siteId,
        categoryId,
        type: type || "EXPENSE",
        amount: parseFloat(amount),
        description,
        vendor,
        date: date ? new Date(date) : new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        isPaid: isPaid || false,
        createdBy: user.id,
      },
    });

    return NextResponse.json({ cost }, { status: 201 });
  } catch (error) {
    console.error("Costs POST error:", error);
    return NextResponse.json({ error: "Maliyet kaydı oluşturulurken hata oluştu" }, { status: 500 });
  }
}
