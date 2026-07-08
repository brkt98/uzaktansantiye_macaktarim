/* Dosyayı cihaza indirir.
   - Capacitor (APK/iOS): blob'u base64'e çevirip Filesystem ile Documents'a yazar → telefonda kalıcı.
   - Web: blob + <a download>.
   Aynı-köken cookie ile fetch (auth korumalı medya için credentials: include).
   Başarıda kullanıcıya gösterilecek bir mesaj döndürür (web'de boş), hata fırlatır. */

async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sanitizeName(name: string): string {
  const base = (name || "dosya").replace(/[\\/:*?"<>|]+/g, "_").trim();
  return base || "dosya";
}

export async function downloadFile(url: string, fileName: string): Promise<string> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("İndirilemedi");
  const blob = await res.blob();
  const safe = sanitizeName(fileName);

  if (await isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: safe,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return `"${safe}" Belgeler klasörüne indirildi.`;
  }

  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
  return "";
}
