import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import ExcelJS from "exceljs";

const CHECKIN_ACTION = "SITE_CHIEF_DAILY_CHECKIN";
const TIME_ZONE = "Europe/Istanbul";
const AUTO_LEAVE_HOUR = 23;
const AUTO_LEAVE_MINUTE = 50;
const AUTO_LEAVE_START_DATE = "2026-04-30";

type SiteChiefCheckinMode = "SITES" | "OFFSITE" | "ON_LEAVE";

type SelectedSite = {
  id: string;
  name: string;
};

type SyntheticPersonnelRow = {
  dateStr: string;
  siteId: string | null;
  allSiteName: string;
  blockName: string;
  typeName: string;
  floorName: string;
  daireName: string;
  workName: string;
  personnelName: string;
  company: string;
  durationName: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getTurkeyNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const part = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const hour = Number(part("hour"));
  const minute = Number(part("minute"));

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${part("year")}-${part("month")}-${part("day")}`,
  };
}

function getTurkeyDateKey(date: Date) {
  return getTurkeyNowParts(date).dateKey;
}

function isAfterAutoLeaveCutoff(parts: ReturnType<typeof getTurkeyNowParts>) {
  return parts.hour > AUTO_LEAVE_HOUR || (parts.hour === AUTO_LEAVE_HOUR && parts.minute >= AUTO_LEAVE_MINUTE);
}

function isFinalizedReportDate(dateKey: string, turkeyNow: ReturnType<typeof getTurkeyNowParts>) {
  if (dateKey < AUTO_LEAVE_START_DATE) return false;
  if (dateKey < turkeyNow.dateKey) return true;
  if (dateKey > turkeyNow.dateKey) return false;
  return isAfterAutoLeaveCutoff(turkeyNow);
}

function parseSelectedSites(value: unknown): SelectedSite[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isObject)
    .map((site) => {
      const id = asString(site.id);
      const name = asString(site.name);
      return id && name ? { id, name } : null;
    })
    .filter((site): site is SelectedSite => Boolean(site));
}

function makeChiefRow(params: {
  dateStr: string;
  siteId: string | null;
  allSiteName: string;
  workName: string;
  personnelName: string;
  durationName?: string;
}): SyntheticPersonnelRow {
  return {
    dateStr: params.dateStr,
    siteId: params.siteId,
    allSiteName: params.allSiteName,
    blockName: "-",
    typeName: "-",
    floorName: "-",
    daireName: "-",
    workName: params.workName,
    personnelName: params.personnelName,
    company: "-",
    durationName: params.durationName || "Tam Gün",
  };
}

function syntheticToSiteRow(row: SyntheticPersonnelRow) {
  return [
    row.dateStr,
    row.blockName,
    row.typeName,
    row.floorName,
    row.daireName,
    row.workName,
    row.personnelName,
    row.company,
    row.durationName,
  ];
}

function syntheticToAllRow(row: SyntheticPersonnelRow) {
  return [row.dateStr, row.allSiteName, ...syntheticToSiteRow(row).slice(1)];
}

function sortSyntheticRows(rows: SyntheticPersonnelRow[]) {
  return [...rows].sort((a, b) => {
    const byDate = a.dateStr.localeCompare(b.dateStr);
    if (byDate !== 0) return byDate;
    return a.personnelName.localeCompare(b.personnelName, "tr");
  });
}

// GET /api/personnel/export?siteId=X (opsiyonel)
// siteId verilmezse tum santiyeler, verilirse tek santiye
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    const siteWhere: Record<string, unknown> = { deletedAt: null };
    if (siteId) siteWhere.id = siteId;

    const sites = await prisma.constructionSite.findMany({
      where: siteWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (sites.length === 0) {
      return NextResponse.json({ error: "Şantiye bulunamadı" }, { status: 404 });
    }

    const siteIds = sites.map((s) => s.id);
    const siteIdSet = new Set(siteIds);

    const entries = await prisma.personnelEntry.findMany({
      where: siteId ? { siteId } : { siteId: { in: siteIds } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    const blockIds: string[] = [
      ...new Set(entries.filter((e: { blockId: string | null }) => e.blockId).map((e: { blockId: string | null }) => e.blockId!)),
    ];
    const blocks = blockIds.length > 0
      ? await prisma.block.findMany({ where: { id: { in: blockIds } }, select: { id: true, name: true } })
      : [];
    const blockNames = new Map(blocks.map((b) => [b.id, b.name]));

    const typeLabels: Record<string, string> = {
      KABA_INSAAT: "Kaba İnşaat",
      INCE_INSAAT: "İnce İnşaat",
      BINA_GENEL: "Bina Genel",
      PEYZAJ: "Peyzaj",
    };

    const durationLabels: Record<string, string> = {
      FULL_DAY: "Tam Gün",
      HALF_DAY: "Yarım Gün",
    };

    const siteNames = new Map(sites.map((s) => [s.id, s.name]));

    const checkinLogs = await prisma.auditLog.findMany({
      where: { action: CHECKIN_ACTION },
      select: {
        userId: true,
        createdAt: true,
        details: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            roles: true,
            isActive: true,
            siteMembers: { select: { siteId: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const siteChiefs = await prisma.user.findMany({
      where: { OR: [{ roles: { has: "SITE_CHIEF" } }, { role: "SITE_CHIEF" }], isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        siteMembers: {
          where: siteId ? { siteId } : {},
          select: { siteId: true },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    const checkedInKeys = new Set<string>();
    const reportDateKeys = new Set<string>(entries.map((entry) => new Date(entry.date).toISOString().split("T")[0]));
    const syntheticRows: SyntheticPersonnelRow[] = [];

    for (const log of checkinLogs) {
      if (!hasRole(log.user.roles.length > 0 ? log.user.roles : [log.user.role], "SITE_CHIEF")) continue;

      const details = isObject(log.details) ? log.details : {};
      const dateStr = asString(details.date) || getTurkeyDateKey(log.createdAt);
      const mode = asString(details.mode) as SiteChiefCheckinMode | null;
      const personnelName = `${log.user.firstName} ${log.user.lastName}`.trim();

      if (mode !== "SITES" && mode !== "OFFSITE" && mode !== "ON_LEAVE") continue;

      checkedInKeys.add(`${dateStr}|${log.userId}`);
      reportDateKeys.add(dateStr);

      if (mode === "SITES") {
        const selectedSites = parseSelectedSites(details.selectedSites);
        if (selectedSites.length === 0) continue;

        const selectedSiteNames = selectedSites.map((site) => site.name).join(", ");
        const scopedSelectedSites = selectedSites.filter((site) => siteIdSet.has(site.id));
        if (scopedSelectedSites.length === 0) continue;

        if (!siteId) {
          syntheticRows.push(makeChiefRow({
            dateStr,
            siteId: null,
            allSiteName: selectedSiteNames,
            workName: selectedSiteNames,
            personnelName,
          }));
        }

        for (const selectedSite of scopedSelectedSites) {
          syntheticRows.push(makeChiefRow({
            dateStr,
            siteId: selectedSite.id,
            allSiteName: selectedSite.name,
            workName: selectedSiteNames,
            personnelName,
          }));
        }
      }

      if (mode === "OFFSITE" && !siteId) {
        syntheticRows.push(makeChiefRow({
          dateStr,
          siteId: null,
          allSiteName: "Şantiye Harici",
          workName: asString(details.note) || "Şantiye Harici Çalışma",
          personnelName,
        }));
      }

      if (mode === "ON_LEAVE") {
        if (!siteId) {
          syntheticRows.push(makeChiefRow({
            dateStr,
            siteId: null,
            allSiteName: "İzinli",
            workName: "İzinli",
            personnelName,
            durationName: "İzinli",
          }));
        } else if (log.user.siteMembers.some((member) => member.siteId === siteId)) {
          syntheticRows.push(makeChiefRow({
            dateStr,
            siteId,
            allSiteName: siteNames.get(siteId) || "İzinli",
            workName: "İzinli",
            personnelName,
            durationName: "İzinli",
          }));
        }
      }
    }

    const turkeyNow = getTurkeyNowParts();
    if (isFinalizedReportDate(turkeyNow.dateKey, turkeyNow)) {
      reportDateKeys.add(turkeyNow.dateKey);
    }

    for (const dateStr of Array.from(reportDateKeys).sort()) {
      if (!isFinalizedReportDate(dateStr, turkeyNow)) continue;

      for (const chief of siteChiefs) {
        if (siteId && chief.siteMembers.length === 0) continue;
        if (checkedInKeys.has(`${dateStr}|${chief.id}`)) continue;

        const personnelName = `${chief.firstName} ${chief.lastName}`.trim();
        syntheticRows.push(makeChiefRow({
          dateStr,
          siteId: siteId || null,
          allSiteName: siteId ? siteNames.get(siteId) || "İzinli" : "İzinli",
          workName: "İzinli",
          personnelName,
          durationName: "İzinli",
        }));
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Uzaktan Şantiye";
    workbook.created = new Date();

    const isSingleSite = !!siteId;

    const styleHeader = (sheet: ExcelJS.Worksheet) => {
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
        cell.border = { bottom: { style: "thin" } };
      });
    };

    const toSiteRow = (entry: typeof entries[number]) => {
      const dateStr = new Date(entry.date).toISOString().split("T")[0];
      const blockName = entry.blockId ? (blockNames.get(entry.blockId) || "Peyzaj") : "Peyzaj";
      const typeName = typeLabels[entry.constructionType] || entry.constructionType;
      const durationName = durationLabels[entry.workDuration] || entry.workDuration;
      const isInce = entry.constructionType === "INCE_INSAAT";
      const daireDisplay = isInce ? (entry.floorName || "-") : "-";
      const floorDisplay = isInce ? "-" : (entry.floorName || "-");
      return [dateStr, blockName, typeName, floorDisplay, daireDisplay, entry.workName, entry.personnelName, entry.company || "-", durationName];
    };

    const siteHeaders = ["Tarih", "Blok", "İnşaat Türü", "Aşama/Kat", "Daire", "İş Adı", "Personel Adı", "Firma", "Çalışma"];
    const siteColWidths = [14, 14, 16, 16, 14, 28, 22, 20, 14];

    if (!isSingleSite) {
      const allHeaders = ["Tarih", "Şantiye", "Blok", "İnşaat Türü", "Aşama/Kat", "Daire", "İş Adı", "Personel Adı", "Firma", "Çalışma"];
      const allColWidths = [14, 22, 18, 16, 16, 14, 28, 22, 20, 14];
      const allSheet = workbook.addWorksheet("Tüm Şantiyeler");
      allSheet.columns = allColWidths.map((w, i) => ({ header: allHeaders[i], key: `col${i}`, width: w }));
      styleHeader(allSheet);

      const allSyntheticRows = sortSyntheticRows(syntheticRows.filter((row) => row.siteId === null));

      if (entries.length === 0 && allSyntheticRows.length === 0) {
        allSheet.addRow(["Kayıt bulunamadı"]);
      } else {
        for (const entry of entries) {
          const row = toSiteRow(entry);
          const siteName = siteNames.get(entry.siteId) || "-";
          allSheet.addRow([row[0], siteName, ...row.slice(1)]);
        }

        for (const row of allSyntheticRows) {
          allSheet.addRow(syntheticToAllRow(row));
        }
      }
    }

    const usedNames = new Set<string>(["Tüm Şantiyeler"]);
    for (const site of sites) {
      const siteEntries = entries.filter((entry) => entry.siteId === site.id);
      const siteSyntheticRows = sortSyntheticRows(syntheticRows.filter((row) => row.siteId === site.id));
      let safeName = site.name.replace(/[*?/\\[\]:]/g, "_").substring(0, 31) || "Santiye";
      if (usedNames.has(safeName)) {
        let suffix = 2;
        let candidate = `${safeName.substring(0, 28)} (${suffix})`;
        while (usedNames.has(candidate)) {
          suffix++;
          candidate = `${safeName.substring(0, 28)} (${suffix})`;
        }
        safeName = candidate;
      }
      usedNames.add(safeName);

      const sheet = workbook.addWorksheet(safeName);
      sheet.columns = siteColWidths.map((w, i) => ({ header: siteHeaders[i], key: `col${i}`, width: w }));
      styleHeader(sheet);

      if (siteEntries.length === 0 && siteSyntheticRows.length === 0) {
        sheet.addRow(["Kayıt bulunamadı"]);
      } else {
        for (const entry of siteEntries) {
          sheet.addRow(toSiteRow(entry));
        }

        for (const row of siteSyntheticRows) {
          sheet.addRow(syntheticToSiteRow(row));
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();

    const todayStr = turkeyNow.dateKey;

    const filename = siteId
      ? `personel_takip_${sites[0]?.name?.replace(/\s+/g, "_") || "santiye"}_${todayStr}.xlsx`
      : `personel_takip_tum_santiyeler_${todayStr}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error("Personnel export error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
