import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { convertToWav16kMono } from "@/lib/audio-convert";
import { transcribeWav } from "@/lib/whisper";

export const runtime = "nodejs";
export const maxDuration = 120;

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const AUDIO_SUBDIR = "notes-audio";

// POST multipart: file (webm/ogg/m4a/wav), persist?=true
// Returns { transcript, audioUrl? }
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    const persist = fd.get("persist") === "true";
    const audioOnly = fd.get("audioOnly") === "true";
    if (!file) return NextResponse.json({ error: "Ses dosyasi yok" }, { status: 400 });

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || ".webm").toLowerCase();

    // Hem audioOnly hem normal mod transkripsiyon yapar. Fark sadece audioOnly
    // bayraginin response'da donmesi (UI inline audio player gostermek icin).

    const tmpDir = path.join(os.tmpdir(), "whisper-" + uuidv4());
    await mkdir(tmpDir, { recursive: true });
    const inPath = path.join(tmpDir, "in" + ext);
    const wavPath = path.join(tmpDir, "audio.wav");
    await writeFile(inPath, buf);

    try {
      await convertToWav16kMono(inPath, wavPath);
    } catch (e) {
      console.error("ffmpeg error", e);
      return NextResponse.json(
        { error: "Ses donusturulemedi. ffmpeg yuklu mu?" },
        { status: 500 }
      );
    }

    let transcript = "";
    try {
      transcript = await transcribeWav(wavPath, "tr");
    } catch (e) {
      console.error("whisper error", e);
      return NextResponse.json(
        {
          error:
            "Transkripsiyon hazirlaniyor. Model henuz indirilmedi olabilir, 1 dk sonra tekrar deneyin.",
        },
        { status: 503 }
      );
    }

    let audioUrl: string | undefined;
    // audioOnly modunda audio dosyasi her zaman saklanir. Persist normal modu kontrol eder.
    if (persist || audioOnly) {
      const dir = path.join(UPLOAD_DIR, AUDIO_SUBDIR);
      await mkdir(dir, { recursive: true });
      const fileName = `${uuidv4()}${ext}`;
      const dest = path.join(dir, fileName);
      await writeFile(dest, buf);
      audioUrl = `/api/notes/audio/${fileName}`;
    }

    // cleanup tmp
    for (const p of [inPath, wavPath, wavPath.replace(/\.wav$/, ".txt")]) {
      try {
        await unlink(p);
      } catch {}
    }

    return NextResponse.json({ transcript, audioUrl, audioOnly });
  } catch (e) {
    console.error("transcribe error", e);
    return NextResponse.json({ error: "Hata" }, { status: 500 });
  }
}
