import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ExcelJS from "exceljs";

// GET /api/teslimat/export - Excel olarak dışa aktar
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (siteId) where.siteId = siteId;
    if (search) {
      where.OR = [
        { irsaliyeNo: { contains: search, mode: "insensitive" } },
        { supplier: { contains: search, mode: "insensitive" } },
        { receivedBy: { contains: search, mode: "insensitive" } },
        { items: { some: { materialName: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const teslimatlar = await prisma.teslimat.findMany({
      where,
      include: {
        site: { select: { name: true } },
        items: true,
      },
      orderBy: { date: "desc" },
    });

    const workbook = new ExcelJS.Workbook();

    // Group by site
    const grouped = new Map<string, { siteName: string; items: typeof teslimatlar }>();
    for (const t of teslimatlar) {
      const key = t.siteId || "__no_site__";
      const siteName = t.site?.name || "Şantiye Belirtilmemiş";
      if (!grouped.has(key)) grouped.set(key, { siteName, items: [] });
      grouped.get(key)!.items.push(t);
    }

    const sheetColumns = [
      { header: "Tarih", key: "date", width: 14 },
      { header: "İrsaliye No", key: "irsaliyeNo", width: 18 },
      { header: "Tedarikçi", key: "supplier", width: 22 },
      { header: "Teslim Alan", key: "receivedBy", width: 18 },
      { header: "Malzeme", key: "materialName", width: 22 },
      { header: "Birim", key: "unit", width: 10 },
      { header: "Miktar", key: "quantity", width: 12 },
      { header: "Birim Fiyat (KDV Dahil)", key: "unitPrice", width: 18 },
      { header: "KDV %", key: "taxRate", width: 8 },
      { header: "KDV-siz Tutar", key: "netTotal", width: 16 },
      { header: "KDV Tutarı", key: "kdvTotal", width: 14 },
      { header: "Toplam (KDV Dahil)", key: "totalPrice", width: 18 },
      { header: "Notlar", key: "notes", width: 24 },
    ];

    for (const [, { siteName, items: siteTeslimatlar }] of grouped) {
      // Excel sheet name max 31 chars, no special chars
      const sheetName = siteName.substring(0, 31).replace(/[*?:/\\[\]]/g, "");
      const sheet = workbook.addWorksheet(sheetName);
      sheet.columns = sheetColumns;

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F2937" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };

      for (const teslimat of siteTeslimatlar) {
        for (const item of teslimat.items) {
          const gross = item.quantity * item.unitPrice;
          const taxRate = item.taxRate ?? 0;
          const net = gross / (1 + taxRate / 100);
          const kdv = gross - net;
          sheet.addRow({
            date: new Date(teslimat.date).toLocaleDateString("tr-TR"),
            irsaliyeNo: teslimat.irsaliyeNo,
            supplier: teslimat.supplier || "-",
            receivedBy: teslimat.receivedBy,
            materialName: item.materialName,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: taxRate,
            netTotal: net,
            kdvTotal: kdv,
            totalPrice: gross,
            notes: teslimat.notes || "",
          });
        }
      }

      sheet.getColumn("quantity").numFmt = "#,##0.##";
      sheet.getColumn("unitPrice").numFmt = "#,##0.00 ₺";
      sheet.getColumn("netTotal").numFmt = "#,##0.00 ₺";
      sheet.getColumn("kdvTotal").numFmt = "#,##0.00 ₺";
      sheet.getColumn("totalPrice").numFmt = "#,##0.00 ₺";
      sheet.getColumn("taxRate").numFmt = '0"%"';
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="teslimatlar_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Teslimat export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
