// Fotograflari PDF'e cevirme yardimci fonksiyonu.
// `sites/[id]/page.tsx` icindeki handleScannerConvert mantigi reusable hale getirildi.

export type ScannedImage = { data: string };

export async function imagesToPdfBlob(images: ScannedImage[]): Promise<Blob> {
  if (images.length === 0) throw new Error("Bos goruntu listesi");
  const { jsPDF } = await import("jspdf");

  const normalizeImage = (
    src: string
  ): Promise<{ dataUrl: string; w: number; h: number }> =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context yok"));
          return;
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 1.0);
        resolve({ dataUrl, w, h });
      };
      img.onerror = reject;
      img.src = src;
    });

  const PAGE_BASE = 210;
  const first = await normalizeImage(images[0].data);
  const firstOrient = first.w > first.h ? "landscape" : "portrait";
  const firstW = firstOrient === "landscape" ? PAGE_BASE * (first.w / first.h) : PAGE_BASE;
  const firstH = firstOrient === "landscape" ? PAGE_BASE : PAGE_BASE * (first.h / first.w);
  const pdf = new jsPDF({ orientation: firstOrient, unit: "mm", format: [firstW, firstH] });
  pdf.addImage(first.dataUrl, "JPEG", 0, 0, firstW, firstH);

  for (let i = 1; i < images.length; i++) {
    const { dataUrl, w, h } = await normalizeImage(images[i].data);
    const orient = w > h ? "landscape" : "portrait";
    const pageW = orient === "landscape" ? PAGE_BASE * (w / h) : PAGE_BASE;
    const pageH = orient === "landscape" ? PAGE_BASE : PAGE_BASE * (h / w);
    pdf.addPage([pageW, pageH], orient);
    pdf.addImage(dataUrl, "JPEG", 0, 0, pageW, pageH);
  }

  return pdf.output("blob");
}

export async function imagesToPdfFile(
  images: ScannedImage[],
  baseName = "Tarama"
): Promise<File> {
  const blob = await imagesToPdfBlob(images);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new window.File([blob], `${baseName}_${timestamp}.pdf`, {
    type: "application/pdf",
  });
}
