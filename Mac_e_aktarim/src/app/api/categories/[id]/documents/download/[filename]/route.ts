import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id, filename } = await params;

    // Prevent path traversal
    const sanitized = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, "categories", id, sanitized);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    const fileBuffer = await readFile(filePath);
    const ext = sanitized.split(".").pop()?.toLowerCase() || "";

    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      txt: "text/plain",
      csv: "text/csv",
      zip: "application/zip",
      rar: "application/x-rar-compressed",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${sanitized}"`,
      },
    });
  } catch (error) {
    console.error("File download error:", error);
    return NextResponse.json({ error: "Dosya indirme hatası" }, { status: 500 });
  }
}
