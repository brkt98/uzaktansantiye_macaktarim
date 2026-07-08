/* Native kamera (Capacitor Camera). Foto çeker, File döner.
   Web / eklenti yoksa / iptal → null (çağıran tarafı <input capture> file picker'a düşer). */

export async function takeNativePhoto(): Promise<File | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 82,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      allowEditing: false,
      saveToGallery: false,
    });
    if (!photo?.webPath) return null;
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    const fmt = photo.format || "jpeg";
    return new File([blob], `foto_${Date.now()}.${fmt}`, { type: blob.type || `image/${fmt === "jpg" ? "jpeg" : fmt}` });
  } catch {
    return null; // iptal/izin yok/eklenti yok → çağıran fallback'e düşer
  }
}
