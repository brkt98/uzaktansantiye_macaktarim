import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { maybeOptimizeImage, thumbFileName } from "@/lib/imageOptimize";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

/** mimeType'tan sohbet mesaj tipi türet (text | image | video | audio | file). */
function typeFromMime(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

// POST /api/chat/media  (multipart: file, conversationId)
// Sohbet eki yükler (resim webp'ye optimize + thumbnail). Mesajı OLUŞTURMAZ —
// URL'yi döndürür; istemci socket message:send ile mesajı gönderir (realtime yayınlar).
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file") as File | null;
    const conversationId = String(form.get("conversationId") || "");
    if (!file) return NextResponse.json({ error: "Dosya yok" }, { status: 400 });
    if (!conversationId) return NextResponse.json({ error: "conversationId gerekli" }, { status: 400 });

    // Katılımcı kontrolü — yalnızca konuşmanın üyesi yükleyebilir
    const part = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      select: { id: true },
    });
    if (!part) return NextResponse.json({ error: "Bu konuşmaya erişiminiz yok" }, { status: 403 });

    const uploadDir = path.join(UPLOAD_DIR, "chat");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await maybeOptimizeImage(buffer, file.type || "application/octet-stream", file.name);

    const ext = path.extname(optimized.fileName) || path.extname(file.name) || "";
    const uniqueName = `${uuidv4()}${ext}`;
    await writeFile(path.join(uploadDir, uniqueName), optimized.buffer);
    if (optimized.thumbnail) {
      await writeFile(path.join(uploadDir, thumbFileName(uniqueName)), optimized.thumbnail.buffer);
    }

    return NextResponse.json({
      url: `/api/chat/media/${uniqueName}`,
      type: typeFromMime(optimized.mimeType),
      fileName: file.name,
      mimeType: optimized.mimeType,
      size: optimized.buffer.length,
    });
  } catch (error) {
    console.error("chat media upload error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
