import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs";
import path from "path";

const SYNC_API_KEY = process.env.STUDYANKA_API_KEY;
const REPORT_DIR = path.join(process.cwd(), "uploads", "studyanka_reports");

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");
    if (!SYNC_API_KEY) {
      return NextResponse.json({ error: "STUDYANKA_API_KEY ayarlanmamis" }, { status: 500 });
    }
    if (apiKey !== SYNC_API_KEY) {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });
    }

    const body = await request.json();
    const { fileName, data } = body;

    if (!fileName || !data) {
      return NextResponse.json({ error: "fileName ve data gerekli" }, { status: 400 });
    }

    const safeName = path.basename(fileName);
    if (!safeName.endsWith(".xlsx") || !safeName.startsWith("StudyAnka_Rapor_")) {
      return NextResponse.json({ error: "Gecersiz dosya adi" }, { status: 400 });
    }

    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

    const filePath = path.join(REPORT_DIR, safeName);
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[STUDYANKA REPORT POST]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.studyankaAccess) {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const fileName = `StudyAnka_Rapor_${today}.xlsx`;
    const filePath = path.join(REPORT_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Bugune ait rapor dosyasi henuz yok" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error("[STUDYANKA REPORT GET]", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}