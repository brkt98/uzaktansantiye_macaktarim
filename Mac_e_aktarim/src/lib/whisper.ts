import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import https from "https";
import { createWriteStream } from "fs";

const MODELS_DIR = process.env.WHISPER_MODELS_DIR || "/app/models";
const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";
const MODEL_NAME = process.env.WHISPER_MODEL || "ggml-small.bin";
const MODEL_URL =
  process.env.WHISPER_MODEL_URL ||
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";

let downloading: Promise<string> | null = null;

async function ensureModel(): Promise<string> {
  await mkdir(MODELS_DIR, { recursive: true });
  const modelPath = path.join(MODELS_DIR, MODEL_NAME);
  if (existsSync(modelPath)) return modelPath;
  if (downloading) return downloading;
  downloading = new Promise<string>((resolve, reject) => {
    const file = createWriteStream(modelPath);
    const get = (url: string) => {
      https
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Model download failed: HTTP ${res.statusCode}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve(modelPath)));
        })
        .on("error", reject);
    };
    get(MODEL_URL);
  }).finally(() => {
    downloading = null;
  });
  return downloading;
}

/**
 * Transcribe a 16kHz mono WAV file using whisper.cpp CLI.
 * Returns Turkish text. Throws if model or binary missing.
 */
export async function transcribeWav(wavPath: string, language = "tr"): Promise<string> {
  const modelPath = await ensureModel();
  return new Promise((resolve, reject) => {
    const proc = spawn(WHISPER_BIN, [
      "-m",
      modelPath,
      "-f",
      wavPath,
      "-l",
      language,
      "-nt",
      "-otxt",
      "-of",
      wavPath.replace(/\.wav$/i, ""),
    ]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`whisper exited ${code}: ${stderr}`));
        return;
      }
      try {
        const { readFile } = await import("fs/promises");
        const txt = await readFile(wavPath.replace(/\.wav$/i, ".txt"), "utf-8");
        resolve(txt.trim());
      } catch {
        resolve(stdout.trim());
      }
    });
  });
}
