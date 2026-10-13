import "server-only";
import {
  and,
  asc,
  eq,
  getColumns,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { containsLike } from "./helpers";
import type { ReadExecutor } from "./types";

type ColumnKey<T extends PgTable> = keyof T["_"]["columns"] & string;

type OptionsConfig<T extends PgTable, C extends ColumnKey<T>> = {
  table: T;
  id: C;
  label: C;
  searchable: C[]; // text columns only, ilike fails on uuid/int
  returnable?: C[];
  active?: SQL; // optional: some tables have no archive flag
  rx: ReadExecutor;
  defaultLimit?: number;
};

export type OptionsFilter = { q?: string; selectedId?: string; limit?: number };
export type OptionsDto = { id: string; label: string } & Record<string, unknown>;

type OrgScopedFn = (orgId: string, f: OptionsFilter) => Promise<OptionsDto[]>;
type GlobalFn = (f: OptionsFilter) => Promise<OptionsDto[]>;

const MAX_LIMIT = 50;

// Overloads: the config decides which function shape you get back
export function makeOptionQuery<T extends PgTable, C extends ColumnKey<T>>(
  config: OptionsConfig<T, C> & { orgId: C },
): OrgScopedFn;
export function makeOptionQuery<T extends PgTable, C extends ColumnKey<T>>(
  config: OptionsConfig<T, C> & { orgId?: undefined },
): GlobalFn;
export function makeOptionQuery<T extends PgTable, C extends ColumnKey<T>>(
  config: OptionsConfig<T, C> & { orgId?: C },
): OrgScopedFn | GlobalFn {
  const columns = getColumns(config.table) as Record<string, PgColumn>;
  const col = (key: C) => columns[key]!;

  const extra = Object.fromEntries((config.returnable ?? []).map((k) => [k, col(k)]));

  async function run(orgId: string | undefined, f: OptionsFilter) {
    const search = f.q
      ? or(...config.searchable.map((k) => containsLike(col(k), f.q!)))
      : undefined;

    const base = and(config.active, search);
    // The selected row stays in the list even if it no longer matches the search
    // or is archived, so an edit form can still show its current value.
    const visible = f.selectedId ? or(base, eq(col(config.id), f.selectedId)) : base;

    // Branch on the CONFIG, not on whether orgId is truthy.
    // An empty-string orgId must match nothing, not skip the filter.
    const where = config.orgId ? and(eq(col(config.orgId), orgId!), visible) : visible;

    const limit = Math.min(f.limit ?? config.defaultLimit ?? 10, MAX_LIMIT);

    const rows = await config.rx
      .select({
        ...extra,
        id: sql<string>`${col(config.id)}`,
        label: sql<string>`${col(config.label)}`,
      })
      // Generic over any table: the cast is the cost, confined here (see Repository).
      .from(config.table as PgTable)
      .where(where)
      .orderBy(asc(col(config.label)))
      .limit(limit);

    return rows as OptionsDto[];
  }

  if (config.orgId) {
    return (orgId: string, f: OptionsFilter) => run(orgId, f);
  }
  return (f: OptionsFilter) => run(undefined, f);
}
