import { stat } from "fs/promises";
import path from "path";

/**
 * Medya servis route'ları için paylaşılan thumbnail yardımcısı.
 * imageOptimize.ts yüklemede "<ad>.thumb.webp" (400px) üretir; bu yardımcı
 * istemci ?size=thumb derse VE thumbnail diskte VARSA onu servis ettirir.
 * Thumbnail yoksa orijinale düşülür (fallback) — ASLA orijinali değiştirmez/silmez.
 */

/** İstemci ?size=thumb ile küçük (thumbnail) sürüm istedi mi? */
export function isThumbRequest(reqUrl: string): boolean {
  try {
    return new URL(reqUrl).searchParams.get("size") === "thumb";
  } catch {
    return false;
  }
}

/**
 * Verilen dosyanın yanındaki "<ad>.thumb.webp" küçük sürümün mutlak yolunu
 * (varsa) döndürür; yoksa null. (imageOptimize.ts ile aynı adlandırma.)
 */
export async function existingThumbPath(originalAbsPath: string): Promise<string | null> {
  const dir = path.dirname(originalAbsPath);
  const bn = path.basename(originalAbsPath);
  const dot = bn.lastIndexOf(".");
  const stem = dot > 0 ? bn.slice(0, dot) : bn;
  if (stem.endsWith(".thumb")) return null; // zaten thumbnail
  const thumbAbs = path.join(dir, `${stem}.thumb.webp`);
  const ok = await stat(thumbAbs)
    .then(() => true)
    .catch(() => false);
  return ok ? thumbAbs : null;
}
