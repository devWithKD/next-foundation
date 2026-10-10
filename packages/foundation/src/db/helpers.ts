import "server-only";
import {
  asc,
  desc,
  inArray,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { SortSpec } from "../list";
import type { WriteExecutor } from "./types";

/**
 * Serialises work on something that has no row to lock (e.g. "next number for
 * X"). Transaction-scoped: released at commit/rollback, so call it INSIDE a
 * transaction. `hashtext` folds the string key to the integer Postgres wants.
 */
export async function withAdvisoryLock(tx: WriteExecutor, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

/**
 * Postgres unique_violation (SQLSTATE 23505). Drizzle wraps the driver error,
 * so the real one is on `.cause`: walk the chain. Narrowed structurally, so no `any`.
 */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  let current: unknown = e;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const err = current as {
      code?: unknown;
      constraint_name?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (err.code === "23505") {
      if (!constraint) return true;
      if (err.constraint_name === constraint || err.constraint === constraint) return true;
    }
    current = err.cause;
  }
  return false;
}

/**
 * "Is this column one of these ids?" with the two edge cases made explicit:
 * - `"all"` means no restriction (undefined, which `and()` drops);
 * - `[]` means NOTHING matches. `IN ()` is a syntax error in some drivers, so
 *   it becomes `false`: an empty access list must never mean "everything".
 */
export function inIds(column: PgColumn, ids: readonly string[] | "all"): SQL | undefined {
  if (ids === "all") return undefined;
  if (ids.length === 0) return sql`false`;
  return inArray(column, [...ids]);
}

/**
 * ORDER BY from validated sort specs. The `sortMap` keys ARE the whitelist
 * (defineListQuery rejects anything else); user input never reaches SQL text.
 * A unique tiebreaker is always appended: without it, rows with equal sort
 * values come back in arbitrary order and page 2 can repeat or skip rows.
 * (Null ordering is the caller's call: put it in the sortMap expression.)
 */
export function buildOrderBy<F extends string>(
  sortMap: Record<F, SQLWrapper>,
  sorts: readonly SortSpec<F>[],
  tiebreaker: PgColumn,
): SQL[] {
  const ordered = sorts.map((s) => (s.dir === "asc" ? asc : desc)(sortMap[s.field]));
  return [...ordered, asc(tiebreaker)];
}

/**
 * Offset pagination, with a total count alongside. Fine for admin tables
 * (small, and users want page numbers). OFFSET N scans and discards N rows, so
 * switch a specific endpoint to keyset (cursor) pagination when its table
 * outgrows ~10k rows (catalog B7).
 */
export function paginate(q: { page: number; pageSize: number }): { limit: number; offset: number } {
  return { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
}
