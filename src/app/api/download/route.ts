import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/db";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

function sanitizeFilename(name: string): string | null {
  const base = path.basename(name);
  if (base.includes("..") || base !== name) return null;
  return base;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const name = request.nextUrl.searchParams.get("name") || "dosya";
  const type = request.nextUrl.searchParams.get("type");
  const id = request.nextUrl.searchParams.get("id");
  const docId = request.nextUrl.searchParams.get("docId");
  const filename = request.nextUrl.searchParams.get("filename");

  // Personel SGK document download
  if (type === "personel" && id) {
    try {
      let relUrl: string | null = null;
      let displayName: string | null = null;

      if (docId) {
        const doc = await prisma.personnelDocument.findUnique({ where: { id: docId } });
        if (!doc || doc.personnelId !== id) {
          return NextResponse.json({ error: "File not found" }, { status: 404 });
        }
        relUrl = doc.url;
        displayName = doc.fileName;
      } else {
        const personnel = await prisma.sitePersonnel.findUnique({ where: { id } });
        if (!personnel?.sgkDocUrl) {
          return NextResponse.json({ error: "File not found" }, { status: 404 });
        }
        relUrl = personnel.sgkDocUrl;
      }

      const sgkPath = path.join(UPLOAD_DIR, relUrl);
      const resolvedPath = path.resolve(sgkPath);
      const resolvedBase = path.resolve(UPLOAD_DIR);
      if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      }
      if (!fs.existsSync(sgkPath)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      const fileBuffer = fs.readFileSync(sgkPath);
      const downloadName = filename || displayName || relUrl.split("/").pop() || "belge";
      const headers = new Headers();
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);
      headers.set("Content-Length", fileBuffer.length.toString());
      return new NextResponse(fileBuffer, { status: 200, headers });
    } catch (err) {
      console.error("Personel download error:", err);
      return NextResponse.json({ error: "Download failed" }, { status: 500 });
    }
  }

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  try {
    let fileBuffer: Buffer;
    let filePath: string | null = null;

    // Pattern: /api/annotations/{id}/media/{filename}
    // Disk:    UPLOAD_DIR/annotations/{id}/{filename}
    const mediaMatch = url.match(/^\/api\/annotations\/([^/]+)\/media\/(.+)$/);

    // Pattern: /api/annotations/{id}/checklist-media/{filename}
    // Disk:    UPLOAD_DIR/checklist-media/{id}/{filename}
    const checklistMediaMatch = url.match(/^\/api\/annotations\/([^/]+)\/checklist-media\/(.+)$/);

    // Pattern: /api/categories/{id}/documents/download/{filename}
    // Disk:    UPLOAD_DIR/categories/{id}/{filename}
    const categoryDocMatch = url.match(/^\/api\/categories\/([^/]+)\/documents\/download\/(.+)$/);

    // Pattern: /api/construction/media/{filename}
    // Disk:    UPLOAD_DIR/construction/{filename}
    const constructionMediaMatch = url.match(/^\/api\/construction\/media\/(.+)$/);

    if (checklistMediaMatch) {
      const annotationId = sanitizeFilename(checklistMediaMatch[1]);
      const filename = sanitizeFilename(decodeURIComponent(checklistMediaMatch[2]));
      if (!annotationId || !filename) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      filePath = path.join(UPLOAD_DIR, "checklist-media", annotationId, filename);
    } else if (mediaMatch) {
      const annotationId = sanitizeFilename(mediaMatch[1]);
      const filename = sanitizeFilename(decodeURIComponent(mediaMatch[2]));
      if (!annotationId || !filename) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      filePath = path.join(UPLOAD_DIR, "annotations", annotationId, filename);
    } else if (categoryDocMatch) {
      const categoryId = sanitizeFilename(categoryDocMatch[1]);
      const filename = sanitizeFilename(decodeURIComponent(categoryDocMatch[2]));
      if (!categoryId || !filename) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      filePath = path.join(UPLOAD_DIR, "categories", categoryId, filename);
    } else if (constructionMediaMatch) {
      const filename = sanitizeFilename(decodeURIComponent(constructionMediaMatch[1]));
      if (!filename) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      filePath = path.join(UPLOAD_DIR, "construction", filename);
    }

    if (filePath) {
      // Verify resolved path stays within UPLOAD_DIR
      const resolvedPath = path.resolve(filePath);
      const resolvedBase = path.resolve(UPLOAD_DIR);
      if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      }
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      fileBuffer = fs.readFileSync(filePath);
    } else if (url.startsWith("/")) {
      // Other local routes - fetch via internal URL
      const internalUrl = `http://localhost:${process.env.PORT || 4827}${url}`;
      const res = await fetch(internalUrl, {
        headers: { cookie: request.headers.get("cookie") || "" },
      });
      if (!res.ok) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      const arrayBuffer = await res.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      return NextResponse.json({ error: "Invalid URL" }, { status: 403 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
    headers.set("Content-Length", fileBuffer.length.toString());

    return new NextResponse(fileBuffer, { status: 200, headers });
  } catch (err) {
    console.error("Download error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
