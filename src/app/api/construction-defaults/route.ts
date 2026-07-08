import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// Varsayılan inşaat şablonunu getir
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    let defaults = await prisma.constructionDefault.findUnique({
      where: { id: "default" },
    });

    if (!defaults) {
      // Yoksa varsayılan şablonu oluştur
      const template = getDefaultTemplate();
      defaults = await prisma.constructionDefault.create({
        data: { id: "default", template },
      });
    }

    return NextResponse.json({ template: defaults.template });
  } catch (error) {
    console.error("Construction defaults GET error:", error);
    return NextResponse.json({ error: "Şablon getirilirken hata oluştu" }, { status: 500 });
  }
}

// Varsayılan şablonu güncelle (sadece admin)
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { template } = body;

    if (!template || !Array.isArray(template.floors)) {
      return NextResponse.json({ error: "Geçersiz şablon formatı" }, { status: 400 });
    }

    const updated = await prisma.constructionDefault.upsert({
      where: { id: "default" },
      update: { template },
      create: { id: "default", template },
    });

    return NextResponse.json({ template: updated.template });
  } catch (error) {
    console.error("Construction defaults PUT error:", error);
    return NextResponse.json({ error: "Şablon güncellenirken hata oluştu" }, { status: 500 });
  }
}

function getDefaultTemplate() {
  return {
    floors: [
      {
        name: "Hafriyat", type: "KABA_INSAAT", order: 0,
        works: [
          { name: "Temel kazı", order: 0 },
          { name: "Dolgu", order: 1 },
          { name: "Grobeton", order: 2 },
        ],
      },
      {
        name: "Yalıtım", type: "KABA_INSAAT", order: 1,
        works: [
          { name: "Temelaltı Yalıtım", order: 0 },
          { name: "Perde Duvar Yalıtım", order: 1 },
          { name: "Drenaj", order: 2 },
          { name: "Su Tahliye Rögarı", order: 3 },
        ],
      },
      {
        name: "Temel", type: "KABA_INSAAT", order: 2,
        works: [
          { name: "Temel Kalıp", order: 0 },
          { name: "Temel Demir", order: 1 },
          { name: "Temel Topraklama", order: 2 },
          { name: "Temel Beton", order: 3 },
        ],
      },
      {
        name: "Katlar", type: "KABA_INSAAT", order: 3, isKatlar: true,
        works: [
          { name: "Kalıp - Hasır", order: 0 },
          { name: "Kalıp - Kolon", order: 1 },
          { name: "Demir - Hasır", order: 2 },
          { name: "Demir - Kolon", order: 3 },
          { name: "Beton - Hasır", order: 4 },
          { name: "Beton - Demir", order: 5 },
          { name: "Elektrik Hasır Borulama", order: 6 },
          { name: "Duvar Örümü", order: 7 },
        ],
      },
      {
        name: "Çatı", type: "KABA_INSAAT", order: 4,
        works: [
          { name: "Asan. Kulesi", order: 0 },
          { name: "Ahşap karkas", order: 1 },
          { name: "Tahta / OSB", order: 2 },
          { name: "Membran", order: 3 },
          { name: "Kiremit / Sandviç panel", order: 4 },
          { name: "Oluk", order: 5 },
          { name: "Yağmur iniş boruları", order: 6 },
          { name: "Çatı arası ısı yalıtım", order: 7 },
        ],
      },
      // İnce İnşaat iş kalemleri (tek floor altında tüm işler)
      {
        name: "İnce İşler", type: "INCE_INSAAT", order: 0,
        works: [
          { name: "Atık su + temiz su borulama", order: 0 },
          { name: "Elektrik borulama + kablo çekimi", order: 1 },
          { name: "Pencere ve balkon denizlik mermeri", order: 2 },
          { name: "Alçı sıva", order: 3 },
          { name: "Plastik Doğrama", order: 4 },
          { name: "Yerden ısıtma", order: 5 },
          { name: "Şap", order: 6 },
          { name: "Audio/Diafon", order: 7 },
          { name: "Doğalgaz Borulama", order: 8 },
          { name: "Asma tavan", order: 9 },
          { name: "Saten alçı + zımpara + boya", order: 10 },
          { name: "Seramik (Duvar,Zemin,Derz)", order: 11 },
          { name: "Laminat parke", order: 12 },
          { name: "Süpürgelik", order: 13 },
          { name: "Elektrik aksesuar montajı", order: 14 },
          { name: "Vitrifiye montajı", order: 15 },
          { name: "Duşakabin", order: 16 },
          { name: "Korkuluk", order: 17 },
          { name: "Mutfak dolap gövde", order: 18 },
          { name: "Mutfak dolap kapak", order: 19 },
          { name: "Mutfak tezgahı", order: 20 },
          { name: "Mutfak tezgah arası seramik", order: 21 },
          { name: "Kombi Montajı", order: 22 },
          { name: "Çelik kapı", order: 23 },
          { name: "İç kapılar", order: 24 },
          { name: "Banyo dolabı", order: 25 },
          { name: "Portmanto gövde kapak", order: 26 },
          { name: "Katlanır cam", order: 27 },
          { name: "Ankastre setler", order: 28 },
        ],
      },
      // Peyzaj iş kalemleri
      {
        name: "Peyzaj", type: "PEYZAJ", order: 0,
        works: [
          { name: "Bahçe Duvarı - Kapısı", order: 0 },
          { name: "Arazi düzenleme", order: 1 },
          { name: "Yağmur suyu", order: 2 },
          { name: "Atık su", order: 3 },
          { name: "Elektrik", order: 4 },
          { name: "Doğalgaz", order: 5 },
          { name: "Temiz su", order: 6 },
          { name: "Çimlendirme", order: 7 },
          { name: "Bitkilendirme", order: 8 },
          { name: "Dekoratif taş", order: 9 },
        ],
      },
      // Bina Genel iş kalemleri
      {
        name: "Bina Genel", type: "BINA_GENEL", order: 0,
        works: [
          { name: "Dış Cephe Mantolama", order: 0 },
          { name: "Blok isimleri", order: 1 },
          { name: "Giriş Diafon", order: 2 },
          { name: "Su Deposu", order: 3 },
          { name: "Boardex", order: 4 },
          { name: "Bina giriş kapısı", order: 5 },
          { name: "Bina giriş merdiven + korkuluk", order: 6 },
          { name: "Bina giriş posta kutusu", order: 7 },
          { name: "Çatı çıkış kapağı", order: 8 },
          { name: "Anten / uydu", order: 9 },
        ],
      },
      {
        name: "Bodrum Kat", type: "BINA_GENEL", order: 1,
        works: [
          { name: "Otopark Kapısı", order: 0 },
          { name: "Asansör ray + kapı", order: 1 },
          { name: "Otopark Boya", order: 2 },
          { name: "Otopark Aydınlatma", order: 3 },
        ],
      },
      {
        name: "Katlar", type: "BINA_GENEL", order: 2, isKatlar: true,
        works: [
          { name: "Merdiven basamak mermerleri", order: 0 },
          { name: "Merdiven korkuluğu", order: 1 },
          { name: "Asansör ray + kapı", order: 2 },
          { name: "Koridor Alçı Saten Boya", order: 3 },
          { name: "Koridor asma tavan", order: 4 },
          { name: "Koridor aydınlatma", order: 5 },
        ],
      },
      // Ruhsat-İskan başlıkları (alt madde yok, dosya yükleme alanı olarak çalışır)
      { name: "Mimari Proje", type: "RUHSAT_ISKAN", order: 0, works: [] },
      { name: "Statik Proje", type: "RUHSAT_ISKAN", order: 1, works: [] },
      { name: "Mekanik Proje", type: "RUHSAT_ISKAN", order: 2, works: [] },
      { name: "Zemin Etüdü", type: "RUHSAT_ISKAN", order: 3, works: [] },
      { name: "Elektrik Projesi", type: "RUHSAT_ISKAN", order: 4, works: [] },
      { name: "Yapı Ruhsatı", type: "RUHSAT_ISKAN", order: 5, works: [] },
      { name: "İskan Belgesi", type: "RUHSAT_ISKAN", order: 6, works: [] },
      { name: "Diğer Belgeler", type: "RUHSAT_ISKAN", order: 7, works: [] },
    ],
  };
}
