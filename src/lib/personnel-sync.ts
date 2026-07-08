import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type DbClient = PrismaClient | Prisma.TransactionClient;
type SyncableField = "company" | "phone" | "position" | "notes" | "sgkDocUrl";
type PersonnelWithDocuments = Prisma.SitePersonnelGetPayload<{
  include: { documents: { orderBy: { createdAt: "desc" } } };
}>;

const SYNCABLE_FIELDS: SyncableField[] = ["company", "phone", "position", "notes", "sgkDocUrl"];

function normalizeName(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

function normalizeTc(value: string | null | undefined) {
  const tc = (value || "").replace(/\D/g, "");
  return tc.length === 11 ? tc : null;
}

function cleanString(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fileNameFromUrl(url: string) {
  return url.split("/").pop() || "belge";
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

async function loadPersonnel(client: DbClient, personnelId: string) {
  return client.sitePersonnel.findUnique({
    where: { id: personnelId },
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });
}

async function findMatchedPersonnelForRecord(
  client: DbClient,
  personnel: PersonnelWithDocuments,
  fallbackToSelfWhenNoTc = false
) {
  const tcNo = normalizeTc(personnel.tcNo);
  if (!tcNo) return fallbackToSelfWhenNoTc ? [personnel] : [];

  const firstNameKey = normalizeName(personnel.firstName);
  const lastNameKey = normalizeName(personnel.lastName);

  const candidates = await client.sitePersonnel.findMany({
    where: {
      tcNo,
      isActive: true,
    },
    include: { documents: { orderBy: { createdAt: "desc" } } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return candidates.filter(
    (candidate) =>
      normalizeName(candidate.firstName) === firstNameKey &&
      normalizeName(candidate.lastName) === lastNameKey
  );
}

function getDocumentRefs(matches: PersonnelWithDocuments[]) {
  const refs = new Map<string, { url: string; fileName: string | null; mimeType: string | null; createdAt: Date }>();

  for (const personnel of matches) {
    for (const doc of personnel.documents) {
      if (!refs.has(doc.url)) {
        refs.set(doc.url, {
          url: doc.url,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          createdAt: doc.createdAt,
        });
      }
    }

    if (personnel.sgkDocUrl && !refs.has(personnel.sgkDocUrl)) {
      refs.set(personnel.sgkDocUrl, {
        url: personnel.sgkDocUrl,
        fileName: fileNameFromUrl(personnel.sgkDocUrl),
        mimeType: null,
        createdAt: personnel.updatedAt,
      });
    }
  }

  return Array.from(refs.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function syncPersonnelGroup(client: DbClient, matches: PersonnelWithDocuments[]) {
  if (matches.length < 2) {
    return { matchedPersonnel: matches.length, personnelUpdated: 0, documentsCreated: 0 };
  }

  const ordered = [...matches].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const documentRefs = getDocumentRefs(ordered);
  let personnelUpdated = 0;
  let documentsCreated = 0;

  const sourceValue = (field: SyncableField) => {
    if (field === "sgkDocUrl" && documentRefs.length > 0) {
      return documentRefs[0].url;
    }

    for (const personnel of ordered) {
      const value = cleanString(personnel[field]);
      if (value) return value;
    }

    return null;
  };

  for (const personnel of ordered) {
    const data: Prisma.SitePersonnelUpdateInput = {};

    for (const field of SYNCABLE_FIELDS) {
      if (cleanString(personnel[field])) continue;
      const value = sourceValue(field);
      if (value) data[field] = value;
    }

    if (Object.keys(data).length > 0) {
      await client.sitePersonnel.update({
        where: { id: personnel.id },
        data,
      });
      personnelUpdated++;
    }

    if (documentRefs.length > 0) {
      const existingUrls = new Set(personnel.documents.map((doc) => doc.url));
      for (const doc of documentRefs) {
        if (existingUrls.has(doc.url)) continue;
        await client.personnelDocument.create({
          data: {
            personnelId: personnel.id,
            url: doc.url,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
          },
        });
        existingUrls.add(doc.url);
        documentsCreated++;
      }
    }
  }

  return { matchedPersonnel: matches.length, personnelUpdated, documentsCreated };
}

export async function syncMatchedPersonnel(personnelId: string, client: DbClient = prisma) {
  const personnel = await loadPersonnel(client, personnelId);
  if (!personnel) return { matchedPersonnel: 0, personnelUpdated: 0, documentsCreated: 0 };

  const matches = await findMatchedPersonnelForRecord(client, personnel);
  return syncPersonnelGroup(client, matches);
}

export async function syncAllMatchedPersonnel(client: DbClient = prisma) {
  const personnel = await client.sitePersonnel.findMany({
    where: {
      isActive: true,
      tcNo: { not: null },
    },
    include: { documents: { orderBy: { createdAt: "desc" } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { updatedAt: "desc" }],
  });

  const groups = new Map<string, PersonnelWithDocuments[]>();
  for (const person of personnel) {
    const tcNo = normalizeTc(person.tcNo);
    if (!tcNo) continue;

    const key = `${normalizeName(person.firstName)}|${normalizeName(person.lastName)}|${tcNo}`;
    const group = groups.get(key) || [];
    group.push(person);
    groups.set(key, group);
  }

  let groupsSynced = 0;
  let personnelUpdated = 0;
  let documentsCreated = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const result = await syncPersonnelGroup(client, group);
    groupsSynced++;
    personnelUpdated += result.personnelUpdated;
    documentsCreated += result.documentsCreated;
  }

  return {
    groupsScanned: groups.size,
    groupsSynced,
    personnelUpdated,
    documentsCreated,
  };
}

export async function getUnreferencedPersonnelDocumentUrls(urls: string[], client: DbClient = prisma) {
  const uniqueUrls = unique(urls.filter((url) => cleanString(url)));
  const unreferencedUrls: string[] = [];

  for (const url of uniqueUrls) {
    const [documentCount, legacyCount] = await Promise.all([
      client.personnelDocument.count({ where: { url } }),
      client.sitePersonnel.count({ where: { sgkDocUrl: url } }),
    ]);

    if (documentCount === 0 && legacyCount === 0) {
      unreferencedUrls.push(url);
    }
  }

  return unreferencedUrls;
}

export async function deleteMatchedPersonnelDocumentReferences(
  personnelId: string,
  docId?: string,
  client: DbClient = prisma
) {
  const personnel = await loadPersonnel(client, personnelId);
  if (!personnel) {
    return { personnelFound: false, documentFound: false, deletedDocuments: 0, unreferencedUrls: [] as string[] };
  }

  const targetUrls = docId
    ? personnel.documents.filter((doc) => doc.id === docId).map((doc) => doc.url)
    : personnel.documents.map((doc) => doc.url);

  if (docId && targetUrls.length === 0) {
    return { personnelFound: true, documentFound: false, deletedDocuments: 0, unreferencedUrls: [] as string[] };
  }

  if (!docId && personnel.sgkDocUrl) {
    targetUrls.push(personnel.sgkDocUrl);
  }

  const urls = unique(targetUrls);
  if (urls.length === 0) {
    return { personnelFound: true, documentFound: true, deletedDocuments: 0, unreferencedUrls: [] as string[] };
  }

  const matches = await findMatchedPersonnelForRecord(client, personnel, true);
  const matchedIds = matches.map((match) => match.id);

  const deleteResult = await client.personnelDocument.deleteMany({
    where: {
      personnelId: { in: matchedIds },
      url: { in: urls },
    },
  });

  const affectedPersonnel = await client.sitePersonnel.findMany({
    where: { id: { in: matchedIds } },
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });

  for (const person of affectedPersonnel) {
    if (!person.sgkDocUrl || !urls.includes(person.sgkDocUrl)) continue;

    await client.sitePersonnel.update({
      where: { id: person.id },
      data: {
        sgkDocUrl: person.documents.find((doc) => !urls.includes(doc.url))?.url || null,
      },
    });
  }

  const unreferencedUrls = await getUnreferencedPersonnelDocumentUrls(urls, client);

  return {
    personnelFound: true,
    documentFound: true,
    deletedDocuments: deleteResult.count,
    unreferencedUrls,
  };
}
