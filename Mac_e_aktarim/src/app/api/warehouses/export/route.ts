import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ExcelJS from "exceljs";

// GET /api/warehouses/export - Depo verilerini Excel olarak dışa aktar (her depo ayrı sayfa)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const warehouses = await prisma.warehouse.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        materials: {
          include: { material: true },
          orderBy: { material: { name: "asc" } },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();

    for (const wh of warehouses) {
      const sheet = workbook.addWorksheet(wh.name);

      sheet.columns = [
        { header: "Malzeme Adı", key: "name", width: 30 },
        { header: "Birim", key: "unit", width: 12 },
        { header: "Mevcut Stok", key: "quantity", width: 14 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F2937" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };

      for (const wm of wh.materials) {
        sheet.addRow({
          name: wm.material.name,
          unit: wm.material.unit,
          quantity: wm.quantity,
        });
      }

      sheet.getColumn("quantity").numFmt = "#,##0.##";
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="depo_stok_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Warehouse export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
