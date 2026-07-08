import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUnreferencedPersonnelDocumentUrls, syncMatchedPersonnel } from "@/lib/personnel-sync";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// GET /api/personel/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;

    const personnel = await prisma.sitePersonnel.findUnique({
      where: { id },
    });

    if (!personnel) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    return NextResponse.json({ personnel });
  } catch (error) {
    console.error("Personnel get error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// PATCH /api/personel/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { firstName, lastName, company, tcNo, phone, position, notes, isActive } = body;

    // Validate TC No format if provided
    if (tcNo !== undefined && tcNo !== null && tcNo !== "" && !/^\d{11}$/.test(tcNo)) {
      return NextResponse.json({ error: "TC Kimlik No 11 haneli olmalıdır" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (firstName !== undefined) data.firstName = firstName.trim();
    if (lastName !== undefined) data.lastName = lastName.trim();
    if (company !== undefined) data.company = company?.trim() || null;
    if (tcNo !== undefined) data.tcNo = tcNo?.trim() || null;
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (position !== undefined) data.position = position?.trim() || null;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (isActive !== undefined) data.isActive = isActive;

    const personnel = await prisma.sitePersonnel.update({
      where: { id },
      data,
    });

    await syncMatchedPersonnel(personnel.id);

    const syncedPersonnel = await prisma.sitePersonnel.findUnique({
      where: { id },
      include: { documents: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json({ personnel: syncedPersonnel || personnel });
  } catch (error) {
    console.error("Personnel update error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE /api/personel/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const { id } = await params;

    const personnel = await prisma.sitePersonnel.findUnique({
      where: { id },
      include: { documents: true },
    });
    if (!personnel) {
      return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    }

    const documentUrls = Array.from(new Set([
      ...personnel.documents.map((doc) => doc.url),
      ...(personnel.sgkDocUrl ? [personnel.sgkDocUrl] : []),
    ]));

    await prisma.sitePersonnel.delete({ where: { id } });

    const unreferencedUrls = await getUnreferencedPersonnelDocumentUrls(documentUrls);

    // Delete physical files only when no personnel record points to them anymore.
    for (const relUrl of unreferencedUrls) {
      try {
        const filePath = path.join(UPLOAD_DIR, relUrl);
        const resolvedBase = path.resolve(UPLOAD_DIR);
        const resolvedFile = path.resolve(filePath);
        if (resolvedFile.startsWith(resolvedBase)) {
          await fs.unlink(resolvedFile).catch(() => {});
        }
      } catch {
        // Ignore file delete errors
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Personnel delete error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
