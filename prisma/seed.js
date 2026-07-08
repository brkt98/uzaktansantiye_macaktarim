const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed verisi oluşturuluyor...\n");

  // 1. Admin kullanıcı
  const hashedPassword = await bcrypt.hash("Mesale@Adm2026!", 12);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@mesalegrup.com",
      passwordHash: hashedPassword,
      firstName: "Sistem",
      lastName: "Yöneticisi",
      role: "ADMIN",
      roles: ["ADMIN"],
      phone: "0532 000 0000",
    },
  });
  console.log(`✅ Admin kullanıcı: ${admin.username}`);

  // 2. Manager kullanıcı
  const managerPass = await bcrypt.hash("Saha#Mrk2026!", 12);
  const manager = await prisma.user.upsert({
    where: { username: "sahamercan" },
    update: {},
    create: {
      username: "sahamercan",
      email: "saha@mesalegrup.com",
      passwordHash: managerPass,
      firstName: "Saha",
      lastName: "Müdürü",
      role: "MANAGER",
      roles: ["MANAGER"],
      phone: "0532 111 1111",
    },
  });
  console.log(`✅ Manager kullanıcı: ${manager.username}`);

  // 3. Normal kullanıcı
  const userPass = await bcrypt.hash("Mhds@Stye2026!", 12);
  const user = await prisma.user.upsert({
    where: { username: "muhendis" },
    update: {},
    create: {
      username: "muhendis",
      email: "muhendis@mesalegrup.com",
      passwordHash: userPass,
      firstName: "Şantiye",
      lastName: "Mühendisi",
      role: "USER",
      roles: ["USER"],
      phone: "0532 222 2222",
    },
  });
  console.log(`✅ User kullanıcı: ${user.username}`);

  // 4. Şantiye: Safir-II
  const safir2 = await prisma.constructionSite.upsert({
    where: { id: "safir2-seed" },
    update: {},
    create: {
      id: "safir2-seed",
      name: "Safir-II",
      description: "Safir-II Konut Projesi - 4 Blok, 120 Daire",
      address: "Ankara, Çankaya",
      status: "ACTIVE",
      startDate: new Date("2024-06-01"),
      endDate: new Date("2026-06-01"),
      config: { budget: 45000000 },
    },
  });
  console.log(`\n✅ Şantiye: ${safir2.name}`);

  // 5. Site membership
  await prisma.siteMember.createMany({
    data: [
      { userId: admin.id, siteId: safir2.id, role: "ADMIN" },
      { userId: manager.id, siteId: safir2.id, role: "MANAGER" },
      { userId: user.id, siteId: safir2.id, role: "USER" },
    ],
    skipDuplicates: true,
  });

  // 6. Bloklar
  const blocks = [];
  for (const blockName of ["A Blok", "B Blok", "C Blok", "D Blok"]) {
    const block = await prisma.block.upsert({
      where: { id: `${safir2.id}-${blockName.replace(" ", "-").toLowerCase()}` },
      update: {},
      create: {
        id: `${safir2.id}-${blockName.replace(" ", "-").toLowerCase()}`,
        name: blockName,
        siteId: safir2.id,
      },
    });
    blocks.push(block);

    // Her blokta 5 kat
    for (let floorNum = 1; floorNum <= 5; floorNum++) {
      const floor = await prisma.floor.upsert({
        where: { id: `${block.id}-kat${floorNum}` },
        update: {},
        create: {
          id: `${block.id}-kat${floorNum}`,
          name: `${floorNum}. Kat`,
          order: floorNum,
          blockId: block.id,
        },
      });

      // Her katta 4 daire
      for (let unitNum = 1; unitNum <= 4; unitNum++) {
        const daireNo = (floorNum - 1) * 4 + unitNum;
        await prisma.unit.upsert({
          where: { id: `${floor.id}-daire${daireNo}` },
          update: {},
          create: {
            id: `${floor.id}-daire${daireNo}`,
            name: `Daire ${daireNo}`,
            order: daireNo,
            floorId: floor.id,
          },
        });
      }
    }
  }
  console.log(`✅ 4 Blok, 20 Kat, 80 Daire oluşturuldu`);

  // 7. Kategoriler (ekran görüntülerindeki yapıya uygun)
  const kabaInsaat = await prisma.category.upsert({
    where: { id: `${safir2.id}-kaba-insaat` },
    update: {},
    create: {
      id: `${safir2.id}-kaba-insaat`,
      name: "Kaba İnşaat",
      siteId: safir2.id,
      order: 1,
    },
  });

  const kabaSubCategories = [
    { name: "Kalıp-Beton-Tuğla", order: 1 },
    { name: "Sıva-Şap", order: 2 },
    { name: "Yalıtım", order: 3 },
    { name: "Demir İşleri", order: 4 },
  ];

  for (const sub of kabaSubCategories) {
    await prisma.category.upsert({
      where: { id: `${safir2.id}-kaba-${sub.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}` },
      update: {},
      create: {
        id: `${safir2.id}-kaba-${sub.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`,
        name: sub.name,
        siteId: safir2.id,
        parentCategoryId: kabaInsaat.id,
        order: sub.order,
      },
    });
  }

  const inceIsler = await prisma.category.upsert({
    where: { id: `${safir2.id}-ince-isler` },
    update: {},
    create: {
      id: `${safir2.id}-ince-isler`,
      name: "İnce İşler",
      siteId: safir2.id,
      order: 2,
    },
  });

  const inceSubCategories = [
    "Elektrik", "Tesisat", "Kapı-Pencere", "Boya-Badana",
    "Seramik-Fayans", "Parke-Laminat", "Asma Tavan",
    "Mutfak Dolabı", "Banyo Dolabı",
  ];

  for (let i = 0; i < inceSubCategories.length; i++) {
    const name = inceSubCategories[i];
    await prisma.category.upsert({
      where: { id: `${safir2.id}-ince-${name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}` },
      update: {},
      create: {
        id: `${safir2.id}-ince-${name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`,
        name: name,
        siteId: safir2.id,
        parentCategoryId: inceIsler.id,
        order: i + 1,
      },
    });
  }

  const dekorasyon = await prisma.category.upsert({
    where: { id: `${safir2.id}-dekorasyon` },
    update: {},
    create: {
      id: `${safir2.id}-dekorasyon`,
      name: "Dekorasyon",
      siteId: safir2.id,
      order: 3,
    },
  });

  const peyzaj = await prisma.category.upsert({
    where: { id: `${safir2.id}-peyzaj` },
    update: {},
    create: {
      id: `${safir2.id}-peyzaj`,
      name: "Peyzaj",
      siteId: safir2.id,
      order: 4,
    },
  });

  const teslimat = await prisma.category.upsert({
    where: { id: `${safir2.id}-teslimat` },
    update: {},
    create: {
      id: `${safir2.id}-teslimat`,
      name: "Teslimat",
      siteId: safir2.id,
      order: 5,
    },
  });

  console.log(`✅ 5 Ana Kategori, 13 Alt Kategori oluşturuldu`);

  // 8. İş kalemleri (Kalıp-Beton-Tuğla altında)
  const kalipBetonId = `${safir2.id}-kaba-kal-p-beton-tu-la`;
  const workItems = [
    { name: "Temel Kalıbı", description: "m² bazında - birim fiyat: 450 TL" },
    { name: "Kolon Kalıbı", description: "m² bazında - birim fiyat: 500 TL" },
    { name: "Kiriş Kalıbı", description: "m² bazında - birim fiyat: 480 TL" },
    { name: "Döşeme Betonu", description: "m³ bazında - birim fiyat: 1200 TL" },
    { name: "Tuğla Duvar", description: "m² bazında - birim fiyat: 350 TL" },
  ];

  for (let i = 0; i < workItems.length; i++) {
    const wi = workItems[i];
    await prisma.workItem.upsert({
      where: { id: `${kalipBetonId}-wi-${i + 1}` },
      update: {},
      create: {
        id: `${kalipBetonId}-wi-${i + 1}`,
        name: wi.name,
        description: wi.description,
        categoryId: kalipBetonId,
      },
    });
  }
  console.log(`✅ 5 İş Kalemi oluşturuldu`);

  // 9. Maliyet kayıtları
  const costs = [
    { type: "EXPENSE", amount: 125000, description: "Beton malzeme alımı", vendor: "ABC Beton A.Ş.", isPaid: true },
    { type: "EXPENSE", amount: 85000, description: "Demir alımı", vendor: "Demir Metal Ltd.", isPaid: true },
    { type: "EXPENSE", amount: 45000, description: "Tuğla siparişi", vendor: "Tuğla San.", isPaid: false },
    { type: "INCOME", amount: 500000, description: "1. Hakediş ödemesi", vendor: "İşveren", isPaid: true },
    { type: "INVOICE", amount: 95000, description: "Elektrik tesisat faturası", vendor: "Elektrik Ltd.", isPaid: false },
    { type: "PAYMENT", amount: 210000, description: "Taşeron ödemesi - Ocak", vendor: "Kalıp Taşeron", isPaid: true },
  ];

  for (let i = 0; i < costs.length; i++) {
    const c = costs[i];
    await prisma.costRecord.upsert({
      where: { id: `${safir2.id}-cost-${i + 1}` },
      update: {},
      create: {
        id: `${safir2.id}-cost-${i + 1}`,
        type: c.type,
        amount: c.amount,
        description: c.description,
        vendor: c.vendor,
        isPaid: c.isPaid,
        date: new Date(2025, i, 15),
        siteId: safir2.id,
        createdBy: admin.id,
      },
    });
  }
  console.log(`✅ 6 Maliyet kaydı oluşturuldu`);

  // 10. İkinci şantiye: Yakut Residence
  const yakut = await prisma.constructionSite.upsert({
    where: { id: "yakut-seed" },
    update: {},
    create: {
      id: "yakut-seed",
      name: "Yakut Residence",
      description: "Yakut Residence - 2 Blok, 40 Daire",
      address: "İstanbul, Ataşehir",
      status: "PLANNED",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2027-06-01"),
      config: { budget: 28000000 },
    },
  });
  console.log(`\n✅ Şantiye: ${yakut.name}`);

  console.log("\n🎉 Seed verisi başarıyla oluşturuldu!");
  console.log("\n📋 Giriş bilgileri:");
  console.log("   Admin  → admin / admin123");
  console.log("   Müdür  → sahamercan / manager123");
  console.log("   Kullanıcı → muhendis / user123");
}

main()
  .catch((e) => {
    console.error("❌ Seed hatası:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
