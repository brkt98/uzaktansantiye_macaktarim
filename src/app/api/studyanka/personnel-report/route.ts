import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  summarizeAttendanceByDay,
  buildWeeklyAttendance,
  getActivePersonnel,
  getTrDayName,
  getTrMonthName,
  formatMinutesAsHours,
  type WeeklyTable,
} from "@/lib/studyankaAttendance";
import ExcelJS from "exceljs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.studyankaAccess) {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const [data, userIdConfig] = await Promise.all([
      prisma.studyankaSync.findUnique({ where: { id: "latest" } }),
      prisma.studyankaSync.findUnique({ where: { id: "user_id_config" } }),
    ]);
    const summary = isObject(data?.summary) ? data.summary : {};
    const records = Array.isArray(summary.attendanceRecords) ? summary.attendanceRecords : [];

    const userMappings =
      userIdConfig?.prices !== null &&
      userIdConfig?.prices !== undefined &&
      typeof userIdConfig.prices === "object" &&
      !Array.isArray(userIdConfig.prices)
        ? (userIdConfig.prices as Record<string, string>)
        : undefined;

    const attendanceSummaries = summarizeAttendanceByDay(records, undefined, userMappings);

    if (attendanceSummaries.length === 0) {
      return NextResponse.json({ error: "Henuz indirilecek personel kaydi yok" }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Mesale Grup";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("Personel Takip");

    worksheet.columns = [
      { header: "Kullanıcı ID", key: "UserID", width: 16 },
      { header: "Kullanıcı Adı", key: "UserName", width: 24 },
      { header: "Giriş Saati", key: "EntryDateTime", width: 22 },
      { header: "Çıkış Saati", key: "ExitDateTime", width: 22 },
    ];

    for (const record of attendanceSummaries) {
      worksheet.addRow({
        UserID: record.UserID,
        UserName: record.UserName,
        EntryDateTime: record.EntryDateTime,
        ExitDateTime: record.ExitDateTime || null,
      });
    }

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      row.height = rowNumber === 1 ? 24 : 22;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
    });
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = { from: "A1", to: "D1" };

    // --- 2. Sayfa: Haftalık Çalışma Tablosu ---
    const activePersonnel = getActivePersonnel(userMappings);
    const weeklyTables = buildWeeklyAttendance(attendanceSummaries, activePersonnel);
    buildWeeklySheet(workbook, weeklyTables);

    const buffer = await workbook.xlsx.writeBuffer();
    const today = new Date().toISOString().slice(0, 10);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="StudyAnka_Personel_Takip_${today}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    console.error("[STUDYANKA PERSONNEL REPORT]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Renk paleti
const C = {
  white: "FFFFFFFF",
  dark: "FF1F2937", // başlık koyu
  weekTitle: "FF065F46", // hafta başlığı (yeşil)
  dayHeader: "FF10B981", // gün başlıkları
  subHeader: "FFD1FAE5", // Giriş/Çıkış arka plan
  duration: "FFF3F4F6", // süre satırı
  izin: "FFFEF3C7", // İzin
  totalHeader: "FF065F46",
  totalCell: "FFECFDF5",
  name: "FFF9FAFB",
  border: "FFD1D5DB",
};

function formatDdMmYyyy(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}.${m}.${date.getUTCFullYear()}`;
}

// "YYYY/MM/DD" (Pazartesi) + gün indeksi -> "4 Mayıs 2026 Pazartesi"
function formatDayHeader(weekStart: Date, dayIndex: number): string {
  const date = new Date(weekStart.getTime());
  date.setUTCDate(date.getUTCDate() + dayIndex);
  return `${date.getUTCDate()} ${getTrMonthName(date.getUTCMonth())} ${date.getUTCFullYear()} ${getTrDayName(dayIndex)}`;
}

function thinBorder() {
  const side = { style: "thin" as const, color: { argb: C.border } };
  return { top: side, left: side, bottom: side, right: side };
}

function buildWeeklySheet(workbook: ExcelJS.Workbook, tables: WeeklyTable[]) {
  const sheet = workbook.addWorksheet("Haftalık Çalışma");

  const NAME_COL = 1;
  const FIRST_DAY_COL = 2; // gün 0'ın Giriş sütunu
  const LAST_DAY_COL = FIRST_DAY_COL + 7 * 2 - 1; // = 15 (gün 6'nın Çıkış sütunu)
  const TOTAL_COL = LAST_DAY_COL + 1; // = 16

  // Sütun genişlikleri (tüm tablolarda ortak)
  sheet.getColumn(NAME_COL).width = 16;
  for (let col = FIRST_DAY_COL; col <= LAST_DAY_COL; col++) {
    sheet.getColumn(col).width = 9;
  }
  sheet.getColumn(TOTAL_COL).width = 14;

  if (tables.length === 0) {
    const cell = sheet.getCell(1, 1);
    cell.value = "Henüz haftalık çalışma verisi yok.";
    cell.font = { italic: true, color: { argb: "FF6B7280" } };
    return;
  }

  let row = 1;

  for (const table of tables) {
    // Hafta başlığı (tüm sütunlara yayılmış)
    sheet.mergeCells(row, NAME_COL, row, TOTAL_COL);
    const titleCell = sheet.getCell(row, NAME_COL);
    titleCell.value = `HAFTA: ${formatDdMmYyyy(table.weekStart)} – ${formatDdMmYyyy(table.weekEnd)}`;
    titleCell.font = { bold: true, size: 12, color: { argb: C.white } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.weekTitle } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(row).height = 24;
    const titleRow = row;
    row++;

    const dayHeaderRow = row;
    const subHeaderRow = row + 1;

    // "Personel" başlığı (2 satıra yayılmış)
    sheet.mergeCells(dayHeaderRow, NAME_COL, subHeaderRow, NAME_COL);
    const personHeader = sheet.getCell(dayHeaderRow, NAME_COL);
    personHeader.value = "Personel";
    personHeader.font = { bold: true, color: { argb: C.white } };
    personHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.dark } };
    personHeader.alignment = { horizontal: "center", vertical: "middle" };

    // Gün başlıkları + Giriş/Çıkış
    for (let d = 0; d < 7; d++) {
      const left = FIRST_DAY_COL + d * 2;
      const right = left + 1;

      sheet.mergeCells(dayHeaderRow, left, dayHeaderRow, right);
      const dayCell = sheet.getCell(dayHeaderRow, left);
      dayCell.value = formatDayHeader(table.weekStart, d);
      dayCell.font = { bold: true, size: 10, color: { argb: C.white } };
      dayCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.dayHeader } };
      dayCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      const girisCell = sheet.getCell(subHeaderRow, left);
      girisCell.value = "Giriş";
      const cikisCell = sheet.getCell(subHeaderRow, right);
      cikisCell.value = "Çıkış";
      for (const c of [girisCell, cikisCell]) {
        c.font = { bold: true, size: 9, color: { argb: C.dark } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.subHeader } };
        c.alignment = { horizontal: "center", vertical: "middle" };
      }
    }

    // "Haftalık Toplam" başlığı (2 satıra yayılmış)
    sheet.mergeCells(dayHeaderRow, TOTAL_COL, subHeaderRow, TOTAL_COL);
    const totalHeader = sheet.getCell(dayHeaderRow, TOTAL_COL);
    totalHeader.value = "Haftalık Toplam";
    totalHeader.font = { bold: true, color: { argb: C.white } };
    totalHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalHeader } };
    totalHeader.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    sheet.getRow(dayHeaderRow).height = 30;
    sheet.getRow(subHeaderRow).height = 18;
    row += 2;

    // Personel satırları (her kişi 2 satır: üst = giriş/çıkış, alt = süre)
    for (const person of table.rows) {
      const r1 = row;
      const r2 = row + 1;

      // İsim (2 satıra yayılmış)
      sheet.mergeCells(r1, NAME_COL, r2, NAME_COL);
      const nameCell = sheet.getCell(r1, NAME_COL);
      nameCell.value = person.userName;
      nameCell.font = { bold: true, color: { argb: C.dark } };
      nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.name } };
      nameCell.alignment = { horizontal: "center", vertical: "middle" };

      for (let d = 0; d < 7; d++) {
        const left = FIRST_DAY_COL + d * 2;
        const right = left + 1;
        const day = person.days[d];

        if (!day.hasRecord) {
          // İzin: günün 4 hücresini birleştir
          sheet.mergeCells(r1, left, r2, right);
          const izinCell = sheet.getCell(r1, left);
          izinCell.value = "İzin";
          izinCell.font = { italic: true, bold: true, color: { argb: "FF92400E" } };
          izinCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.izin } };
          izinCell.alignment = { horizontal: "center", vertical: "middle" };
          continue;
        }

        // Üst satır: giriş / çıkış
        const girisCell = sheet.getCell(r1, left);
        girisCell.value = day.entryTime ?? "-";
        const cikisCell = sheet.getCell(r1, right);
        cikisCell.value = day.exitTime ?? "-";
        for (const c of [girisCell, cikisCell]) {
          c.alignment = { horizontal: "center", vertical: "middle" };
          c.font = { size: 10, color: { argb: C.dark } };
        }

        // Alt satır: o günkü çalışma süresi (birleştirilmiş)
        sheet.mergeCells(r2, left, r2, right);
        const durCell = sheet.getCell(r2, left);
        durCell.value = day.durationMinutes !== null ? formatMinutesAsHours(day.durationMinutes) : "-";
        durCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.duration } };
        durCell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
        durCell.alignment = { horizontal: "center", vertical: "middle" };
      }

      // Haftalık toplam (2 satıra yayılmış)
      sheet.mergeCells(r1, TOTAL_COL, r2, TOTAL_COL);
      const totalCell = sheet.getCell(r1, TOTAL_COL);
      totalCell.value = formatMinutesAsHours(person.totalMinutes);
      totalCell.font = { bold: true, size: 12, color: { argb: C.totalHeader } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalCell } };
      totalCell.alignment = { horizontal: "center", vertical: "middle" };

      sheet.getRow(r1).height = 20;
      sheet.getRow(r2).height = 20;
      row += 2;
    }

    // Tablo genelinde kenarlık uygula
    for (let r = titleRow; r < row; r++) {
      for (let c = NAME_COL; c <= TOTAL_COL; c++) {
        sheet.getCell(r, c).border = thinBorder();
      }
    }

    // Tablolar arası boşluk
    row += 2;
  }
}
