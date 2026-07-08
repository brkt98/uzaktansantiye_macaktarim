import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getIstanbulDateKey } from "@/lib/studyankaAttendance";

const SYNC_API_KEY = process.env.STUDYANKA_API_KEY;

type AttendanceRecord = {
  Machine?: string | number;
  UserID?: string | number;
  UserName?: string;
  VerifyMode?: string | number;
  DateTime?: string;
  VerifyRaw?: string;
  SourceKey?: string;
  FirstSeenAt?: string;
  TerminalCode?: string;
};

type NormalizedAttendanceRecord = ReturnType<typeof normalizeRecord>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function padUserId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /^\d+$/.test(text) ? text.padStart(6, "0") : text;
}

function normalizeRecord(record: AttendanceRecord, terminalCode: string) {
  const machine = String(record.Machine ?? "").trim() || "1";
  const userId = padUserId(record.UserID);
  const dateTime = String(record.DateTime ?? "").trim();
  const verifyModeRaw = String(record.VerifyMode ?? "").trim();
  const verifyMode = /^\d+$/.test(verifyModeRaw) ? verifyModeRaw.padStart(2, "0") : verifyModeRaw;
  const sourceKey = String(record.SourceKey ?? "").trim() || `${terminalCode}|${machine}|${userId}|${dateTime}`;

  return {
    Machine: machine,
    UserID: userId,
    UserName: String(record.UserName ?? "").trim(),
    VerifyMode: verifyMode || "01",
    DateTime: dateTime,
    VerifyRaw: String(record.VerifyRaw ?? "").trim(),
    SourceKey: sourceKey,
    FirstSeenAt: String(record.FirstSeenAt ?? "").trim() || new Date().toISOString(),
    TerminalCode: terminalCode,
  };
}

function normalizeIncomingRecords(incoming: unknown[], terminalCode: string) {
  const records: NormalizedAttendanceRecord[] = [];
  const sourceKeys = new Set<string>();

  for (const item of incoming) {
    if (!isObject(item)) continue;
    const normalized = normalizeRecord(item as AttendanceRecord, terminalCode);
    if (!normalized.UserID || !normalized.DateTime || !normalized.SourceKey) continue;
    records.push(normalized);
    sourceKeys.add(normalized.SourceKey);
  }

  return { records, sourceKeys: Array.from(sourceKeys) };
}

function mergeRecords(existing: unknown, incoming: AttendanceRecord[], terminalCode: string) {
  const map = new Map<string, NormalizedAttendanceRecord>();

  if (Array.isArray(existing)) {
    for (const item of existing) {
      if (!isObject(item)) continue;
      const normalized = normalizeRecord(item as AttendanceRecord, String(item.TerminalCode ?? terminalCode));
      if (normalized.UserID && normalized.DateTime) map.set(normalized.SourceKey, normalized);
    }
  }

  for (const item of incoming) {
    if (!isObject(item)) continue;
    const normalized = normalizeRecord(item, terminalCode);
    if (normalized.UserID && normalized.DateTime) map.set(normalized.SourceKey, normalized);
  }

  return Array.from(map.values()).sort((a, b) => {
    const dateCompare = a.DateTime.localeCompare(b.DateTime);
    if (dateCompare !== 0) return dateCompare;
    return a.UserID.localeCompare(b.UserID);
  });
}

function attendanceFields(summary: Record<string, unknown>) {
  if (!Array.isArray(summary.attendanceRecords)) return {};
  return {
    attendanceRecords: summary.attendanceRecords,
    totalAttendance: summary.totalAttendance,
    terminalCode: summary.terminalCode,
    lastUploadAt: summary.lastUploadAt,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiKey = request.headers.get("x-api-key") || body?.token;

    if (!SYNC_API_KEY) {
      console.error("[STUDYANKA SYNC] STUDYANKA_API_KEY env ayarlanmamis");
      return NextResponse.json({ error: "STUDYANKA_API_KEY ayarlanmamis" }, { status: 500 });
    }
    if (apiKey !== SYNC_API_KEY) {
      const received = apiKey ? `${String(apiKey).slice(0, 6)}...(${String(apiKey).length})` : "yok";
      const expected = `${SYNC_API_KEY.slice(0, 6)}...(${SYNC_API_KEY.length})`;
      console.warn(`[STUDYANKA SYNC] Yetkisiz: gelen=${received} beklenen=${expected}`);
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });
    }

    const current = await prisma.studyankaSync.findUnique({ where: { id: "latest" } });
    const currentSummary = isObject(current?.summary) ? current.summary : {};
    const incomingRecords = Array.isArray(body.records) ? body.records : null;

    if (incomingRecords) {
      const terminalCode = String(body.terminalCode ?? "studyAnka-001");
      const existingRecords = Array.isArray(currentSummary.attendanceRecords)
        ? currentSummary.attendanceRecords
        : [];
      const normalizedIncoming = normalizeIncomingRecords(incomingRecords, terminalCode);
      const attendanceRecords = mergeRecords(existingRecords, normalizedIncoming.records, terminalCode);
      const storedKeys = new Set(attendanceRecords.map((record) => record.SourceKey));
      const acceptedSourceKeys = normalizedIncoming.sourceKeys.filter((key) => storedKeys.has(key));
      const missingSourceKeys = normalizedIncoming.sourceKeys.filter((key) => !storedKeys.has(key));

      const summary = {
        ...currentSummary,
        ...(isObject(body.summary) ? body.summary : {}),
        terminalCode,
        totalAttendance: attendanceRecords.length,
        lastUploadAt: new Date().toISOString(),
        attendanceRecords,
      };

      await prisma.studyankaSync.upsert({
        where: { id: "latest" },
        update: {
          rooms: Array.isArray(current?.rooms) ? current.rooms : [],
          prices: isObject(current?.prices) ? current.prices : {},
          summary,
          syncedAt: new Date(),
        },
        create: {
          id: "latest",
          rooms: [],
          prices: {},
          summary,
          syncedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: missingSourceKeys.length === 0,
        ok: missingSourceKeys.length === 0,
        count: attendanceRecords.length,
        receivedCount: normalizedIncoming.sourceKeys.length,
        storedCount: attendanceRecords.length,
        acceptedSourceKeys,
        missingSourceKeys,
      });
    }

    const { rooms, prices, summary } = body;
    if (!rooms || !Array.isArray(rooms)) {
      return NextResponse.json({ error: "records veya rooms alani gerekli" }, { status: 400 });
    }

    // Per-type daily usage tracking based on baslangic transitions
    const todayKey = getIstanbulDateKey();
    const prevTodayKey = typeof currentSummary.todayKey === "string" ? currentSummary.todayKey : "";
    const sameDay = prevTodayKey === todayKey;

    const prevTracking: Record<string, string> =
      sameDay && isObject(currentSummary.roomSessionTracking)
        ? (currentSummary.roomSessionTracking as Record<string, string>)
        : {};
    let kabinUsedToday: number =
      sameDay && typeof currentSummary.kabinUsedToday === "number"
        ? (currentSummary.kabinUsedToday as number)
        : 0;
    let toplantiUsedToday: number =
      sameDay && typeof currentSummary.toplantiUsedToday === "number"
        ? (currentSummary.toplantiUsedToday as number)
        : 0;

    const newTracking: Record<string, string> = { ...prevTracking };
    for (const room of rooms) {
      const r = room as Record<string, unknown>;
      const key = String(r.key ?? "");
      const baslangic = String(r.baslangic ?? "-");
      const type = String(r.type ?? "");
      const lastSeen = prevTracking[key] ?? "-";
      if (baslangic !== "-" && baslangic !== lastSeen) {
        if (type === "kabin") kabinUsedToday++;
        else if (type === "toplanti" || type === "alttoplanti") toplantiUsedToday++;
      }
      newTracking[key] = baslangic;
    }

    const incomingSummary = isObject(summary) ? summary : {};
    const nextSummary = {
      ...incomingSummary,
      ...attendanceFields(currentSummary),
      todayKey,
      kabinUsedToday,
      toplantiUsedToday,
      roomSessionTracking: newTracking,
    };

    await prisma.studyankaSync.upsert({
      where: { id: "latest" },
      update: {
        rooms,
        prices: prices || {},
        summary: nextSummary,
        syncedAt: new Date(),
      },
      create: {
        id: "latest",
        rooms,
        prices: prices || {},
        summary: nextSummary,
        syncedAt: new Date(),
      },
    });

    const priceConfig = await prisma.studyankaSync.findUnique({ where: { id: "price_config" } });

    return NextResponse.json({
      success: true,
      ok: true,
      ...(priceConfig ? { priceUpdate: priceConfig.prices } : {}),
    });
  } catch (error: unknown) {
    console.error("[STUDYANKA SYNC]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
