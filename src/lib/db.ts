import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT ?? "30");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT ?? "20");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasourceUrl: buildDatabaseUrl(),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
