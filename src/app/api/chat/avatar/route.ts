import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// POST /api/chat/avatar  (multipart: file, target)
// target = "me" → kendi profil fotoğrafı; aksi halde conversationId → grup fotoğrafı (yalnızca yönetici).
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file") as File | null;
    const target = String(form.get("target") || "me");
    if (!file) return NextResponse.json({ error: "Dosya yok" }, { status: 400 });
    if (!(file.type || "").startsWith("image/")) {
      return NextResponse.json({ error: "Sadece resim yüklenebilir" }, { status: 400 });
    }

    // Grup fotoğrafı → grup + yönetici kontrolü
    if (target !== "me") {
      const conv = await prisma.conversation.findUnique({ where: { id: target }, select: { isGroup: true } });
      if (!conv || !conv.isGroup) return NextResponse.json({ error: "Geçersiz grup" }, { status: 400 });
      const p = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: target, userId: user.id } },
        select: { role: true },
      });
      if (!p) return NextResponse.json({ error: "Bu gruba erişiminiz yok" }, { status: 403 });
      if (p.role !== "admin") return NextResponse.json({ error: "Yalnızca grup yöneticisi değiştirebilir" }, { status: 403 });
    }

    const uploadDir = path.join(UPLOAD_DIR, "chat");
    await mkdir(uploadDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await maybeOptimizeImage(buffer, file.type, file.name);
    const ext = path.extname(optimized.fileName) || ".webp";
    const uniqueName = `${uuidv4()}${ext}`;
    await writeFile(path.join(uploadDir, uniqueName), optimized.buffer);
    if (optimized.thumbnail) {
      await writeFile(path.join(uploadDir, thumbFileName(uniqueName)), optimized.thumbnail.buffer);
    }
    const url = `/api/chat/media/${uniqueName}`;

    if (target === "me") {
      await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
    } else {
      await prisma.conversation.update({ where: { id: target }, data: { avatarUrl: url } });
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("chat avatar upload error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
