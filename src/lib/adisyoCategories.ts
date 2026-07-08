// OTOMATİK ÜRETİLDİ — kategoriler_study_anka.xlsx'ten (ürün adı → kategori).
// StudyAnka kafe için manuel kategori gruplaması. Güncellemek için Excel'i yeniden işleyin.

const RAW: [string, string][] = [
  ["CHURCHILL", "Su-Soda Grubu"],
  ["Dimes Meyve Suları", "Su-Soda Grubu"],
  ["SODA", "Su-Soda Grubu"],
  ["SU", "Su-Soda Grubu"],
  ["Espresso Shot", "Kahve Grubu"],
  ["ŞURUP", "Kahve Grubu"],
  ["100", "Kahve Grubu"],
  ["70 TL", "Kahve Grubu"],
  ["Corny Çeşitleri", "Kasa Önü Ürünleri"],
  ["PASTEL RENKLİ KALEM", "Kasa Önü Ürünleri"],
  ["Züber Çeşitleri", "Kasa Önü Ürünleri"],
  ["Çeçil Peynirli Sandviç", "Sandviç Grubu"],
  ["Fiesta Sandviç", "Sandviç Grubu"],
  ["Haşhaşlı Dört Peynirli", "Sandviç Grubu"],
  ["Hindi Füme Baget", "Sandviç Grubu"],
  ["HİNDİ FÜMELİ PANİNİ", "Sandviç Grubu"],
  ["Americano", "Kahve Grubu"],
  ["Bitki Çayları", "Çay ve Türk Kahvesi Grubu"],
  ["Cafe Mocha", "Kahve Grubu"],
  ["Cappuccino", "Kahve Grubu"],
  ["Caramel Macchiato", "Kahve Grubu"],
  ["Chai Tea Latte", "Kahve Grubu"],
  ["Çay", "Çay ve Türk Kahvesi Grubu"],
  ["Double Espresso", "Kahve Grubu"],
  ["Duble Çay", "Çay ve Türk Kahvesi Grubu"],
  ["Duble Türk Kahvesi", "Çay ve Türk Kahvesi Grubu"],
  ["Filtre Kahve", "Kahve Grubu"],
  ["Flat White", "Kahve Grubu"],
  ["Latte", "Kahve Grubu"],
  ["Salep", "Kahve Grubu"],
  ["Sıcak Çikolata", "Kahve Grubu"],
  ["Single Espresso", "Kahve Grubu"],
  ["Türk Kahvesi", "Çay ve Türk Kahvesi Grubu"],
  ["White Mocha Chocolate", "Kahve Grubu"],
  ["Berry Hibiscus", "Kahve Grubu"],
  ["Cool Lime", "Kahve Grubu"],
  ["Ice Americano", "Kahve Grubu"],
  ["Ice Caramel Latte", "Kahve Grubu"],
  ["Ice Caramel Macchiato", "Kahve Grubu"],
  ["Ice Latte", "Kahve Grubu"],
  ["Ice Mocha", "Kahve Grubu"],
  ["Ice White Mocha", "Kahve Grubu"],
  ["Soğuk Filtre Kahve", "Kahve Grubu"],
  ["Ananas Badem", "Tatlı Grubu"],
  ["Bardak Kurabiye", "Tatlı Grubu"],
  ["ÇİKOLATALI PASTA CUP", "Tatlı Grubu"],
  ["Dilim Kek", "Tatlı Grubu"],
  ["Fıstıklı Cup", "Tatlı Grubu"],
  ["FRAMBUAZLI CHEESECAKE", "Tatlı Grubu"],
  ["KARAMELLİ ROCHER PASTA", "Tatlı Grubu"],
  ["MİRA VİSTA", "Tatlı Grubu"],
  ["MOZAİK PASTA", "Tatlı Grubu"],
  ["Muffin Kek", "Tatlı Grubu"],
  ["ORMAN MEYVELİ CUP", "Tatlı Grubu"],
  ["PROFİTEROL CUP", "Tatlı Grubu"],
  ["KEÇELİ KALEM", "Kasa Önü Ürünleri"],
  ["Matcha Tea Latte", "Kahve Grubu"],
  ["BROWNİE CAKE", "Tatlı Grubu"],
  ["SOS", "Kahve Grubu"],
  ["CAM ŞİŞE", "Kasa Önü Ürünleri"],
  ["Beyaz Çikolatalı Brownie", "Tatlı Grubu"],
  ["Frambuazlı Fıstıklı Pasta", "Tatlı Grubu"],
  ["Kara Orman", "Tatlı Grubu"],
  ["Cookies Latte", "Kahve Grubu"],
  ["Salted Caramel Latte", "Kahve Grubu"],
  ["Toffee Nut Latte", "Kahve Grubu"],
  ["Vanilla Latte", "Kahve Grubu"],
  ["Ice Salted Caramel Latte", "Kahve Grubu"],
  ["Ice Vanilla Latte", "Kahve Grubu"],
  ["Ice Toffee Nut Latte", "Kahve Grubu"],
  ["LOTUS CHEESECAKE", "Tatlı Grubu"],
  ["Ice Pumpkin Spice", "Kahve Grubu"],
  ["Avşar Meyveli Soda", "Su-Soda Grubu"],
  ["Beyoğlu Gazoz", "Su-Soda Grubu"],
  ["Juss Ice Tea", "Su-Soda Grubu"],
  ["Tamek Meyve Suyu", "Su-Soda Grubu"],
  ["French Press", "Kasa Önü Ürünleri"],
  ["STUDY ANKA FİLTRE KAHVE", "Kasa Önü Ürünleri"],
  ["Ice Cookies Latte", "Kasa Önü Ürünleri"],
  ["Fıstık Rüyası", "Tatlı Grubu"],
  ["Limonlu Cheescake", "Tatlı Grubu"],
  ["LOTUS PASTA", "Tatlı Grubu"],
  // Sonradan elle eklendi (Excel'de yoktu):
  ["DEVİL°S MY BLACK", "Tatlı Grubu"],
  ["Study Anka Kurabiye", "Tatlı Grubu"],
  // Dondurma kategorisi (Adisyo'da 2026-07'de açıldı):
  ["Karamel Dondurma", "Dondurma"],
  ["Çilekli Dondurma", "Dondurma"],
  ["Limonlu Dondurma", "Dondurma"],
  ["Balbademli Dondurma", "Dondurma"],
  ["Böğürtlen Dondurma", "Dondurma"],
  ["Kakaolu Dondurma", "Dondurma"],
  ["Portakal Dondurma", "Dondurma"],
  ["Kavunlu Dondurma", "Dondurma"],
];

// Türkçe büyük/küçük + noktalı/noktasız İ/ı + aksanları katlayan normalize.
// "CHURCHILL"=="CHURCHİLL", "Türk Kahvesi"=="TÜRK KAHVESİ" eşleşsin diye.
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_TO_CATEGORY = new Map<string, string>();
for (const [name, cat] of RAW) NAME_TO_CATEGORY.set(norm(name), cat);

export const UNCATEGORIZED = "Diğer";

// Ürün adından kategori. Eşleşmezse "Diğer".
export function categoryForProduct(name: string | undefined | null): string {
  if (!name) return UNCATEGORIZED;
  return NAME_TO_CATEGORY.get(norm(name)) ?? UNCATEGORIZED;
}

// Grafikte sabit sıralama (ciroya göre de sıralanır ama renk tutarlılığı için referans).
export const CATEGORY_ORDER = [
  "Kahve Grubu",
  "Çay ve Türk Kahvesi Grubu",
  "Tatlı Grubu",
  "Sandviç Grubu",
  "Su-Soda Grubu",
  "Kasa Önü Ürünleri",
  "Dondurma",
  UNCATEGORIZED,
];
