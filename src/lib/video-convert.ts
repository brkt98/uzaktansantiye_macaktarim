import { spawn } from "child_process";

export function convertToWebmFast(inputPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "34",
      "-deadline",
      "realtime",
      "-cpu-used",
      "5",
      "-row-mt",
      "1",
      "-c:a",
      "libopus",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      outPath,
    ]);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg webm exit ${code}: ${stderr}`));
    });
  });
}

export function imagesToSlideshow(
  imagePaths: string[],
  outPath: string,
  perImageSec = 3,
  audioPath?: string | null
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (imagePaths.length === 0) {
      reject(new Error("Resim listesi bos"));
      return;
    }
    const args: string[] = ["-y"];
    for (const p of imagePaths) {
      args.push("-loop", "1", "-t", String(perImageSec), "-i", p);
    }
    const hasAudio = !!audioPath;
    if (hasAudio) {
      args.push("-stream_loop", "-1", "-i", audioPath!);
    }
    const filter =
      imagePaths
        .map(
          (_p, i) =>
            // Foto'yu çerçeveye TAM doldur: arkada bulanık-büyütülmüş aynı foto, önde sığdırılmış net foto.
            // (Eski "pad" siyah barlarla dikey fotoları küçük gösteriyordu.)
            `[${i}:v]split=2[bgsrc${i}][fgsrc${i}];` +
            `[bgsrc${i}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2[bg${i}];` +
            `[fgsrc${i}]scale=1080:1920:force_original_aspect_ratio=decrease[fg${i}];` +
            `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[v${i}]`
        )
        .join(";") +
      ";" +
      imagePaths.map((_p, i) => `[v${i}]`).join("") +
      `concat=n=${imagePaths.length}:v=1:a=0[outv]`;
    args.push("-filter_complex", filter, "-map", "[outv]");
    if (hasAudio) {
      args.push(
        "-map",
        `${imagePaths.length}:a:0`,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest"
      );
    }
    args.push(
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-movflags",
      "+faststart",
      outPath
    );
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg slideshow exit ${code}: ${stderr}`));
    });
  });
}
