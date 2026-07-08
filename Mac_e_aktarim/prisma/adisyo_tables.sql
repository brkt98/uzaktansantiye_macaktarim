-- Adisyo entegrasyonu için yerel ayna tabloları.
-- Prod DB internal docker ağında olduğundan ve standalone image'da prisma CLI bulunmadığından
-- bu SQL db container'ında doğrudan çalıştırılır:
--   docker compose exec -T db psql -U postgres -d mesale_santiye < prisma/adisyo_tables.sql
-- Idempotent: tekrar çalıştırılması güvenlidir.

CREATE TABLE IF NOT EXISTS "adisyo_orders" (
  "id"          TEXT PRIMARY KEY,
  "orderDate"   TIMESTAMP(3) NOT NULL,
  "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "orderType"   TEXT,
  "status"      TEXT,
  "isCancelled" BOOLEAN NOT NULL DEFAULT false,
  "waiterName"  TEXT,
  "payload"     JSONB NOT NULL,
  "syncedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "adisyo_orders_orderDate_idx" ON "adisyo_orders" ("orderDate");

CREATE TABLE IF NOT EXISTS "adisyo_sync_meta" (
  "id"           TEXT PRIMARY KEY DEFAULT 'latest',
  "lastSyncAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastBackfill" TIMESTAMP(3),
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
