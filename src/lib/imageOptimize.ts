import sharp from "sharp";

const MAX_DIMENSION = 2400;
const WEBP_QUALITY = 85;
const THUMB_DIMENSION = 400;
const THUMB_QUALITY = 75;

export type OptimizeResult = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  optimized: boolean;
  thumbnail?: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  };
};

export function thumbFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return `${base}.thumb.webp`;
}

export async function maybeOptimizeImage(
  inputBuffer: Buffer,
  originalMime: string,
  originalName: string
): Promise<OptimizeResult> {
  if (!originalMime?.startsWith("image/")) {
    return { buffer: inputBuffer, mimeType: originalMime, fileName: originalName, optimized: false };
  }
  // Skip animated formats (gif). Webp continues to thumbnail-only path.
  if (originalMime === "image/gif") {
    return { buffer: inputBuffer, mimeType: originalMime, fileName: originalName, optimized: false };
  }
  try {
    const img = sharp(inputBuffer, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const isAlreadyWebp = originalMime === "image/webp";

    let outBuffer = inputBuffer;
    let outMime = originalMime;
    let outName = originalName;
    let didOptimize = false;

    if (!isAlreadyWebp) {
      const needsResize = w > MAX_DIMENSION || h > MAX_DIMENSION;
      let pipeline = sharp(inputBuffer, { failOn: "none" }).rotate();
      if (needsResize) {
        pipeline = pipeline.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
      }
      outBuffer = await pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer();
      outMime = "image/webp";
      outName = `${originalName.replace(/\.[^.]+$/, "")}.webp`;
      didOptimize = true;
    }

    // Thumbnail (400px webp q=75) — always produce for raster images
    let thumbnail: OptimizeResult["thumbnail"] | undefined;
    try {
      const thumbBuf = await sharp(inputBuffer, { failOn: "none" })
        .rotate()
        .resize({ width: THUMB_DIMENSION, height: THUMB_DIMENSION, fit: "inside", withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY, effort: 4 })
        .toBuffer();
      thumbnail = {
        buffer: thumbBuf,
        fileName: thumbFileName(outName),
        mimeType: "image/webp",
      };
    } catch {
      // ignore; main file still returned
    }

    return {
      buffer: outBuffer,
      mimeType: outMime,
      fileName: outName,
      optimized: didOptimize,
      thumbnail,
    };
  } catch {
    return { buffer: inputBuffer, mimeType: originalMime, fileName: originalName, optimized: false };
  }
}
