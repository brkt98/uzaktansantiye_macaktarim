import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import ExcelJS from "exceljs";

type WeekItem = { key: string; label: string; start: string; end: string };
type WeeklyEntry = {
  ad: string;
  soyad: string;
  tarih: string;
  giris: string;
  cikis: string;
};

const TR_DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const HEADER_BG = "FF1A1A2E";
const HEADER_FG = "FFFFFFFF";
const SUBHEADER_BG = "FF2C3E50";
const ODD_BG = "FFF8F9FA";
const EVEN_BG = "FFFFFFFF";
const ABSENT_BG = "FFFFE5E5";

function parseTrDate(s: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function formatDayHeader(d: Date): string {
  const dayName = TR_DAYS[(d.getDay() + 6) % 7];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dayName}\n${dd}.${mm}`;
}

function diffMinutes(giris: string, cikis: string): number {
  if (!giris || !cikis) return 0;
  const [gh, gm] = giris.split(":").map(Number);
  const [ch, cm] = cikis.split(":").map(Number);
  if (isNaN(gh) || isNaN(ch)) return 0;
  return Math.max(0, ch * 60 + cm - (gh * 60 + gm));
}

function formatHours(mins: number): string {
  if (mins <= 0) return "-";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}s ${String(m).padStart(2, "0")}dk`;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }

    const weekKey = request.nextUrl.searchParams.get("week");
    if (!weekKey) {
      return NextResponse.json({ error: "week parametresi gerekli" }, { status: 400 });
    }

    const data = await prisma.yurtAnkaSync.findUnique({ where: { id: "latest" } });
    if (!data) return NextResponse.json({ error: "Veri yok" }, { status: 404 });

    const weeks = (data.weeks as unknown as WeekItem[]) ?? [];
    const week = weeks.find((w) => w.key === weekKey);
    if (!week) return NextResponse.json({ error: "Hafta bulunamadı" }, { status: 404 });

    const weeklyData = (data.weeklyData as unknown as Record<string, WeeklyEntry[]>) ?? {};
    const entries = weeklyData[weekKey] ?? [];

    const start = parseTrDate(week.start) ?? parseTrDate(entries[0]?.tarih ?? "");
    const days: Date[] = [];
    if (start) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
      }
    }
    const dayKeys = days.map((d) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    });

    type PersonData = Record<string, { giris: string; cikis: string }>;
    const personnel = new Map<string, PersonData>();
    for (const e of entries) {
      const name = `${e.ad} ${e.soyad}`.trim();
      if (!personnel.has(name)) personnel.set(name, {});
      personnel.get(name)![e.tarih] = { giris: e.giris || "", cikis: e.cikis || "" };
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Meşale Grup";
    wb.created = new Date();
    const ws = wb.addWorksheet("Haftalık Rapor", {
      properties: { defaultRowHeight: 18 },
    });

    const totalCols = 1 + days.length * 2 + 1;
    ws.getColumn(1).width = 22;
    for (let i = 2; i <= 1 + days.length * 2; i++) ws.getColumn(i).width = 8;
    ws.getColumn(totalCols).width = 14;

    // Title
    ws.mergeCells(1, 1, 1, totalCols);
    const title = ws.getCell(1, 1);
    title.value = "Yurt Anka Cebeci — Haftalık Personel Raporu";
    title.font = { bold: true, size: 14, color: { argb: HEADER_FG } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    ws.getRow(1).height = 26;

    // Date range
    ws.mergeCells(2, 1, 2, totalCols);
    const sub = ws.getCell(2, 1);
    sub.value = `${week.start} – ${week.end}`;
    sub.font = { italic: true, color: { argb: HEADER_FG } };
    sub.alignment = { horizontal: "center", vertical: "middle" };
    sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEADER_BG } };

    // Day headers
    ws.mergeCells(3, 1, 4, 1);
    const nameHdr = ws.getCell(3, 1);
    nameHdr.value = "Personel";
    nameHdr.font = { bold: true, color: { argb: HEADER_FG } };
    nameHdr.alignment = { horizontal: "center", vertical: "middle" };
    nameHdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };

    days.forEach((d, idx) => {
      const c = 2 + idx * 2;
      ws.mergeCells(3, c, 3, c + 1);
      const cell = ws.getCell(3, c);
      cell.value = formatDayHeader(d);
      cell.font = { bold: true, color: { argb: HEADER_FG } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };

      const g = ws.getCell(4, c);
      g.value = "Giriş";
      const ck = ws.getCell(4, c + 1);
      ck.value = "Çıkış";
      [g, ck].forEach((x) => {
        x.font = { bold: true, size: 10, color: { argb: HEADER_FG } };
        x.alignment = { horizontal: "center", vertical: "middle" };
        x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEADER_BG } };
      });
    });

    ws.mergeCells(3, totalCols, 4, totalCols);
    const totalHdr = ws.getCell(3, totalCols);
    totalHdr.value = "Toplam Süre";
    totalHdr.font = { bold: true, color: { argb: HEADER_FG } };
    totalHdr.alignment = { horizontal: "center", vertical: "middle" };
    totalHdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    ws.getRow(3).height = 32;

    // Data rows
    let row = 5;
    let rowIdx = 0;
    const sorted = Array.from(personnel.keys()).sort((a, b) => a.localeCompare(b, "tr"));
    for (const name of sorted) {
      const data = personnel.get(name)!;
      const bg = rowIdx % 2 === 0 ? EVEN_BG : ODD_BG;
      const nameCell = ws.getCell(row, 1);
      nameCell.value = name;
      nameCell.font = { bold: true };
      nameCell.alignment = { vertical: "middle" };
      nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

      let weekMins = 0;
      dayKeys.forEach((dk, idx) => {
        const c = 2 + idx * 2;
        const day = data[dk];
        const giris = day?.giris ?? "";
        const cikis = day?.cikis ?? "";
        const mins = diffMinutes(giris, cikis);
        weekMins += mins;
        const present = !!(giris || cikis);
        const cellBg = present ? bg : ABSENT_BG;
        const gC = ws.getCell(row, c);
        gC.value = giris || "-";
        const cC = ws.getCell(row, c + 1);
        cC.value = cikis || "-";
        [gC, cC].forEach((x) => {
          x.alignment = { horizontal: "center", vertical: "middle" };
          x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cellBg } };
          x.font = { size: 10 };
        });
      });

      const totCell = ws.getCell(row, totalCols);
      totCell.value = formatHours(weekMins);
      totCell.font = { bold: true };
      totCell.alignment = { horizontal: "center", vertical: "middle" };
      totCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

      row++;
      rowIdx++;
    }

    // Borders
    for (let r = 1; r < row; r++) {
      for (let c = 1; c <= totalCols; c++) {
        ws.getCell(r, c).border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    const filename = `yurtanka_haftalik_${weekKey}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error("[YURTANKA REPORT]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
