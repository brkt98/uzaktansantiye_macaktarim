import { spawn } from "child_process";

/**
 * Convert input audio file (webm/ogg/m4a) to 16kHz mono WAV at outPath.
 * Requires ffmpeg in PATH.
 */
export function convertToWav16kMono(inputPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outPath,
    ]);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
}
