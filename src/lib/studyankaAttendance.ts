export type StudyankaAttendanceSummary = {
  UserID: string;
  UserName: string;
  DateKey: string;
  EntryDateTime: string;
  ExitDateTime: string | null;
  EntryTime: string;
  ExitTime: string | null;
  RecordCount: number;
};

type NormalizedAttendance = {
  userId: string;
  userName: string;
  dateTime: string;
  dateKey: string;
  sourceKey: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getIstanbulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")}`;
}

export function displayUserId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, "") : text;
}

const DEFAULT_USER_MAPPINGS: Record<string, string> = {
  "5": "Miray",
  "6": "Enes",
  "7": "Zeynep Hanım",
  "8": "Handan",
};

export function displayUserName(userId: string, userMappings?: Record<string, string>) {
  const map = userMappings ?? DEFAULT_USER_MAPPINGS;
  return map[userId] ?? "Yok";
}

// ID Belirleme'de tanımlı aktif personel listesi (haftalık tabloların satırlarını belirler)
export function getActivePersonnel(userMappings?: Record<string, string>): { id: string; name: string }[] {
  const map = userMappings ?? DEFAULT_USER_MAPPINGS;
  return Object.entries(map)
    .map(([id, name]) => ({ id: displayUserId(id), name: String(name ?? "").trim() }))
    .filter((p) => p.id && p.name);
}

function normalizeAttendanceRecord(record: unknown, userMappings?: Record<string, string>): NormalizedAttendance | null {
  if (!isObject(record)) return null;
  const dateTime = String(record.DateTime ?? "").trim();
  const userId = displayUserId(record.UserID);
  if (!dateTime || !userId) return null;

  const dateKey = dateTime.slice(0, 10);
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateKey)) return null;

  return {
    userId,
    userName: displayUserName(userId, userMappings),
    dateTime,
    dateKey,
    sourceKey: String(record.SourceKey ?? "").trim(),
  };
}

// --- Haftalık çalışma tablosu yardımcıları ---

export type WeeklyDayCell = {
  hasRecord: boolean;
  entryTime: string | null; // "HH:mm"
  exitTime: string | null; // "HH:mm"
  durationMinutes: number | null; // giriş+çıkış varsa süre, yoksa null
};

export type WeeklyPersonRow = {
  userId: string;
  userName: string;
  days: WeeklyDayCell[]; // 7 eleman: Pazartesi..Pazar
  totalMinutes: number;
};

export type WeeklyTable = {
  weekStartKey: string; // "YYYY/MM/DD" (Pazartesi)
  weekStart: Date;
  weekEnd: Date; // Pazar
  rows: WeeklyPersonRow[];
};

const TR_DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const TR_MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function getTrDayName(dayIndex: number) {
  return TR_DAY_NAMES[((dayIndex % 7) + 7) % 7];
}

export function getTrMonthName(monthIndex: number) {
  return TR_MONTH_NAMES[((monthIndex % 12) + 12) % 12];
}

// "YYYY/MM/DD HH:mm:ss" / "HH:mm:ss" -> dakika cinsinden gün içi süre
function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = String(time).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  return hours * 60 + minutes + seconds / 60;
}

// "YYYY/MM/DD" -> UTC tabanlı Date (TZ kaymasını önlemek için UTC)
function dateKeyToUtc(dateKey: string): Date | null {
  const match = dateKey.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

// Verilen tarihin Pazartesi başlangıçlı haftasının başını döndürür
function startOfWeekUtc(date: Date): Date {
  const day = date.getUTCDay(); // 0=Pazar..6=Cumartesi
  const offset = (day + 6) % 7; // Pazartesi'ye kadar geri
  const monday = new Date(date.getTime());
  monday.setUTCDate(monday.getUTCDate() - offset);
  return monday;
}

function utcDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

// Dakika -> "HH:mm" (saat 24'ü geçebilir, ör. haftalık 54:31)
export function formatMinutesAsHours(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Günlük özetleri, yalnızca verilen aktif personel için haftalık tablolara dönüştürür.
 * - Aktif personel listesi (ID Belirleme) satırları belirler: yeni eklenen otomatik gelir,
 *   kaldırılan kişi yeni tablolarda görünmez.
 * - Yalnızca en az bir kaydı olan haftalar üretilir; hafta içinde kaydı olmayan personel "İzin" olur.
 * - Haftalar en yeniden eskiye doğru sıralanır.
 */
export function buildWeeklyAttendance(
  summaries: StudyankaAttendanceSummary[],
  activePersonnel: { id: string; name: string }[],
): WeeklyTable[] {
  const activeIds = new Set(activePersonnel.map((p) => p.id));

  // weekKey -> userId -> dayIndex(0..6) -> summary
  const weeks = new Map<string, Map<string, Map<number, StudyankaAttendanceSummary>>>();

  for (const summary of summaries) {
    if (!activeIds.has(summary.UserID)) continue;
    const date = dateKeyToUtc(summary.DateKey);
    if (!date) continue;

    const dayIndex = (date.getUTCDay() + 6) % 7; // Pazartesi=0
    const weekKey = utcDateKey(startOfWeekUtc(date));

    let byUser = weeks.get(weekKey);
    if (!byUser) {
      byUser = new Map();
      weeks.set(weekKey, byUser);
    }
    let byDay = byUser.get(summary.UserID);
    if (!byDay) {
      byDay = new Map();
      byUser.set(summary.UserID, byDay);
    }
    // Aynı gün/kişi için tek özet vardır; yine de varsa üzerine yazma
    if (!byDay.has(dayIndex)) byDay.set(dayIndex, summary);
  }

  const tables: WeeklyTable[] = [];
  const sortedWeekKeys = Array.from(weeks.keys()).sort((a, b) => b.localeCompare(a)); // yeni -> eski

  for (const weekKey of sortedWeekKeys) {
    const byUser = weeks.get(weekKey)!;
    const weekStart = dateKeyToUtc(weekKey)!;
    const weekEnd = new Date(weekStart.getTime());
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

    const rows: WeeklyPersonRow[] = activePersonnel.map((person) => {
      const byDay = byUser.get(person.id);
      const days: WeeklyDayCell[] = [];
      let totalMinutes = 0;

      for (let d = 0; d < 7; d++) {
        const summary = byDay?.get(d);
        if (!summary) {
          days.push({ hasRecord: false, entryTime: null, exitTime: null, durationMinutes: null });
          continue;
        }
        const entryMin = timeToMinutes(summary.EntryTime);
        const exitMin = timeToMinutes(summary.ExitTime);
        let durationMinutes: number | null = null;
        if (entryMin !== null && exitMin !== null) {
          let diff = exitMin - entryMin;
          if (diff < 0) diff += 24 * 60; // gece yarısını geçen
          durationMinutes = diff;
          totalMinutes += diff;
        }
        days.push({
          hasRecord: true,
          entryTime: summary.EntryTime ? summary.EntryTime.slice(0, 5) : null,
          exitTime: summary.ExitTime ? summary.ExitTime.slice(0, 5) : null,
          durationMinutes,
        });
      }

      return { userId: person.id, userName: person.name, days, totalMinutes };
    });

    tables.push({ weekStartKey: weekKey, weekStart, weekEnd, rows });
  }

  return tables;
}

export function summarizeAttendanceByDay(records: unknown[], dateKeyFilter?: string, userMappings?: Record<string, string>) {
  const groups = new Map<string, NormalizedAttendance[]>();

  for (const record of records) {
    const normalized = normalizeAttendanceRecord(record, userMappings);
    if (!normalized) continue;
    if (dateKeyFilter && normalized.dateKey !== dateKeyFilter) continue;

    const key = `${normalized.dateKey}|${normalized.userId}`;
    const group = groups.get(key) || [];
    group.push(normalized);
    groups.set(key, group);
  }

  const summaries: StudyankaAttendanceSummary[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const dateCompare = a.dateTime.localeCompare(b.dateTime);
      if (dateCompare !== 0) return dateCompare;
      return a.sourceKey.localeCompare(b.sourceKey);
    });

    const entry = group[0];
    const exit = group.length > 1 ? group[group.length - 1] : null;
    summaries.push({
      UserID: entry.userId,
      UserName: entry.userName,
      DateKey: entry.dateKey,
      EntryDateTime: entry.dateTime,
      ExitDateTime: exit?.dateTime ?? null,
      EntryTime: entry.dateTime.slice(11, 19),
      ExitTime: exit?.dateTime.slice(11, 19) ?? null,
      RecordCount: group.length,
    });
  }

  return summaries.sort((a, b) => {
    const dateCompare = a.DateKey.localeCompare(b.DateKey);
    if (dateCompare !== 0) return dateCompare;
    return a.EntryDateTime.localeCompare(b.EntryDateTime);
  });
}
