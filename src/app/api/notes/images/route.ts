import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const IMG_SUBDIR = "notes-images";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Dosya yok" }, { status: 400 });
    if (!file.type.startsWith("image/"))
      return NextResponse.json({ error: "Sadece fotograf" }, { status: 400 });

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || ".jpg").toLowerCase();

    const dir = path.join(UPLOAD_DIR, IMG_SUBDIR);
    await mkdir(dir, { recursive: true });
    const fileName = `${uuidv4()}${ext}`;
    const dest = path.join(dir, fileName);
    await writeFile(dest, buf);

    return NextResponse.json({ url: `/api/notes/images/${fileName}` });
  } catch (e) {
    console.error("notes image upload err", e);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}
