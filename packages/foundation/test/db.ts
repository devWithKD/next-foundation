import { drizzle } from "drizzle-orm/pg-proxy";
import { integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type RecordedQuery = { sql: string; params: unknown[]; method: string };

/**
 * A real Drizzle database whose driver is a recorder: query builders run for
 * real and we capture the exact SQL + params that WOULD be sent. No database.
 * `respond` supplies rows (as arrays, in column order) for queries that return.
 */
export function recordingDb(respond?: (q: RecordedQuery) => unknown[][]) {
  const calls: RecordedQuery[] = [];
  const db = drizzle(async (sql, params, method) => {
    const q = { sql, params, method };
    calls.push(q);
    return { rows: respond?.(q) ?? [] };
  });
  return { db, calls, last: () => calls[calls.length - 1]! };
}

// Soft-deletable table (nullable deletedAt).
export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  orgUnitId: uuid("org_unit_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// No deletedAt: must be rejected by SoftDeletableRepository at compile time.
export const plain = pgTable("plain", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
});

// deletedAt exists but is NOT NULL: also rejected.
export const badDeleted = pgTable("bad_deleted", {
  id: uuid("id").primaryKey(),
  deletedAt: timestamp("deleted_at").notNull(),
});

// Composite key.
export const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id").notNull(),
    unitId: text("unit_id").notNull(),
    level: integer("level").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.userId, t.unitId] })],
);
