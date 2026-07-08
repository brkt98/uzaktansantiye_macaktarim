/* Native paylaşım (Capacitor Share). Dosyayı önbelleğe alıp paylaşım sayfasını açar.
   Web'de navigator.share veya yeni sekme. Eklenti yoksa false döner. */

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = String(reader.result || "");
      const i = r.indexOf(",");
      resolve(i >= 0 ? r.slice(i + 1) : r);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function shareFile(url: string, name: string): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const safe = (name || "dosya").replace(/[\\/:*?"<>|]+/g, "_").trim() || "dosya";

    if (!Capacitor.isNativePlatform()) {
      if (typeof navigator !== "undefined" && navigator.share) { await navigator.share({ title: safe, url }); return true; }
      window.open(url, "_blank");
      return true;
    }

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return false;
    const blob = await res.blob();
    const base64 = await blobToBase64(blob);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const w = await Filesystem.writeFile({ path: safe, data: base64, directory: Directory.Cache, recursive: true });
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: safe, files: [w.uri] });
    return true;
  } catch {
    return false;
  }
}
