import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// Odeme CRUD + dekont (PaymentDocument) upload.
//
// GET ?buyerId=  -> { payments: [...] }
// POST (multipart): buyerId, amount, paidAt?, method?, notes?, file? (dekont 1 adet)
// POST (json):     { buyerId, amount, paidAt?, method?, notes? }
// PATCH json:      { paymentId, amount?, paidAt?, method?, notes? }
// DELETE ?paymentId= (cascade ile dokumanlar disk + DB silinir)

async function deletePaymentDocument(doc: { fileUrl: string }) {
  try {
    const fname = doc.fileUrl.split("/").pop();
    if (fname) {
      await unlink(path.join(UPLOAD_DIR, "payments", fname));
    }
  } catch {
    /* sessiz */
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const buyerId = searchParams.get("buyerId");
    if (!buyerId) return NextResponse.json({ error: "buyerId zorunlu" }, { status: 400 });

    const payments = await prisma.payment.findMany({
      where: { buyerId },
      orderBy: { paidAt: "desc" },
      include: { documents: true },
    });
    return NextResponse.json({ payments });
  } catch (e) {
    console.error("Payment GET error:", e);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const contentType = request.headers.get("content-type") || "";
    let buyerId: string | null = null;
    let amount: string | null = null;
    let paidAt: string | null = null;
    let method: string | null = null;
    let notes: string | null = null;
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const fd = await request.formData();
      buyerId = (fd.get("buyerId") as string) || null;
      amount = (fd.get("amount") as string) || null;
      paidAt = (fd.get("paidAt") as string) || null;
      method = (fd.get("method") as string) || null;
      notes = (fd.get("notes") as string) || null;
      file = (fd.get("file") as File) || null;
    } else {
      const body = await request.json();
      buyerId = body?.buyerId || null;
      amount = body?.amount != null ? String(body.amount) : null;
      paidAt = body?.paidAt || null;
      method = body?.method || null;
      notes = body?.notes || null;
    }

    if (!buyerId || !amount) {
      return NextResponse.json({ error: "buyerId & amount zorunlu" }, { status: 400 });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Gecersiz amount" }, { status: 400 });
    }

    const payment = await prisma.payment.create({
      data: {
        buyerId,
        amount: amountNum,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        method: method || null,
        notes: notes || null,
      },
    });

    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const optimized = await maybeOptimizeImage(buffer, file.type, file.name);
      const uploadDir = path.join(UPLOAD_DIR, "payments");
      await mkdir(uploadDir, { recursive: true });
      const ext = path.extname(optimized.fileName) || path.extname(file.name);
      const uniqueName = `${uuidv4()}${ext}`;
      await writeFile(path.join(uploadDir, uniqueName), optimized.buffer);
      if (optimized.thumbnail) {
        await writeFile(path.join(uploadDir, thumbFileName(uniqueName)), optimized.thumbnail.buffer);
      }
      await prisma.paymentDocument.create({
        data: {
          paymentId: payment.id,
          fileName: file.name,
          fileUrl: `/api/sales/payments/file/${uniqueName}`,
          mimeType: optimized.mimeType,
          fileSize: optimized.buffer.length,
        },
      });
    }

    const full = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: { documents: true },
    });
    return NextResponse.json({ payment: full }, { status: 201 });
  } catch (e) {
    console.error("Payment POST error:", e);
    return NextResponse.json({ error: "Kaydedilemedi" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const body = await request.json();
    const { paymentId, amount, paidAt, method, notes } = body || {};
    if (!paymentId) {
      return NextResponse.json({ error: "paymentId zorunlu" }, { status: 400 });
    }

    const data: any = {};
    if (amount !== undefined) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: "Gecersiz amount" }, { status: 400 });
      }
      data.amount = n;
    }
    if (paidAt !== undefined) data.paidAt = paidAt ? new Date(paidAt) : null;
    if (method !== undefined) data.method = method || null;
    if (notes !== undefined) data.notes = notes || null;

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data,
      include: { documents: true },
    });
    return NextResponse.json({ payment });
  } catch (e) {
    console.error("Payment PATCH error:", e);
    return NextResponse.json({ error: "Guncellenemedi" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get("paymentId");
    if (!paymentId) {
      return NextResponse.json({ error: "paymentId zorunlu" }, { status: 400 });
    }

    const docs = await prisma.paymentDocument.findMany({
      where: { paymentId },
    });
    for (const d of docs) await deletePaymentDocument(d);
    await prisma.payment.delete({ where: { id: paymentId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Payment DELETE error:", e);
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 });
  }
}
