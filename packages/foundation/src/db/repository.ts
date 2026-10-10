import "server-only";
import {
  and,
  eq,
  isNull,
  type InferInsertModel,
  type InferSelectModel,
  type SQL,
} from "drizzle-orm";
import type { LockConfig, LockStrength, PgColumn, PgTable } from "drizzle-orm/pg-core";
import { NotFoundError } from "../errors";
import type { WriteExecutor } from "./types";

type RowOf<Table extends PgTable> = InferSelectModel<Table>;
type InsertOf<Table extends PgTable> = InferInsertModel<Table>;

/**
 * Row locks are opt-in per call and unused until a flow needs them. Guarded
 * `UPDATE ... WHERE` is the default concurrency tool; reach for a lock when a
 * read must stay valid until the transaction ends.
 */
export type LockMode = "update" | "update-nowait" | "update-skip-locked" | "share";

export type ReadOptions = {
  /** Run inside this transaction. Defaults to the repository's database. */
  tx?: WriteExecutor;
  lock?: LockMode;
  /** Extra visibility filter (e.g. the actor's org-unit scope). ANDed with the key. */
  scope?: SQL;
  /** Include soft-deleted rows. Only meaningful on a SoftDeletableRepository. */
  withDeleted?: boolean;
};

export type WriteOptions = {
  tx?: WriteExecutor;
  /** Applied to updates too: a policy bug then updates nothing instead of someone else's row. */
  scope?: SQL;
};

type DeletedAtCheck<Table extends PgTable> =
  RowOf<Table> extends { deletedAt: Date | null }
    ? null extends RowOf<Table>["deletedAt"]
      ? Table
      : `SoftDeletableRepository requires deletedAt to be nullable on table "${Table["_"]["name"]}". The column exists but is NOT NULL. Remove notNull() from the schema, or do not use SoftDeletableRepository for this table.`
    : `SoftDeletableRepository requires a deletedAt timestamp column on table "${Table["_"]["name"]}". Add one, or extend Repository directly if this table is not soft-deletable.`;

function lockArgs(mode: LockMode): [LockStrength, LockConfig?] {
  switch (mode) {
    case "update":
      return ["update"];
    case "update-nowait":
      return ["update", { noWait: true }];
    case "update-skip-locked":
      return ["update", { skipLocked: true }];
    case "share":
      return ["share"];
  }
}

/**
 * Write-path data access for one aggregate: load-to-mutate, then save. Reads
 * made to be SHOWN belong in *.queries.ts instead (catalog B0b).
 *
 * The casts below are the cost of being generic over any table: they are
 * confined to this class so no module repository needs one.
 */
export abstract class Repository<
  Table extends PgTable,
  KeyCols extends keyof RowOf<Table> & string,
> {
  constructor(
    protected readonly table: Table,
    protected readonly db: WriteExecutor,
    protected readonly keyColumns: readonly KeyCols[],
  ) {}

  protected byKey(key: Pick<RowOf<Table>, KeyCols>): SQL {
    const conds = this.keyColumns.map((col) =>
      eq(this.table[col as keyof Table] as PgColumn, key[col]),
    );
    return and(...conds)!;
  }

  /** Key AND scope (and, for soft-deletable repositories, not deleted). */
  protected where(
    key: Pick<RowOf<Table>, KeyCols>,
    opts: { scope?: SQL; withDeleted?: boolean } = {},
  ): SQL {
    return and(this.byKey(key), opts.scope)!;
  }

  async findByKey(
    key: Pick<RowOf<Table>, KeyCols>,
    opts: ReadOptions = {},
  ): Promise<RowOf<Table> | null> {
    const query = (opts.tx ?? this.db)
      .select()
      .from(this.table as PgTable)
      .where(this.where(key, opts))
      .limit(1)
      .$dynamic();
    const rows = (await (opts.lock ? query.for(...lockArgs(opts.lock)) : query)) as unknown[];
    return (rows[0] as RowOf<Table> | undefined) ?? null;
  }

  /** findByKey, but a missing row is a NotFoundError. */
  async requireByKey(
    key: Pick<RowOf<Table>, KeyCols>,
    opts: ReadOptions & { notFound?: string } = {},
  ): Promise<RowOf<Table>> {
    const row = await this.findByKey(key, opts);
    if (!row) throw new NotFoundError(opts.notFound ?? "Not found");
    return row;
  }

  async create(data: InsertOf<Table>, opts: WriteOptions = {}): Promise<RowOf<Table>> {
    const [row] = (await (opts.tx ?? this.db)
      .insert(this.table as PgTable)
      .values(data)
      .returning()) as unknown[];
    return row as RowOf<Table>;
  }

  /** Returns the updated row, or null when no row matched (missing, out of scope, or deleted). */
  async update(
    key: Pick<RowOf<Table>, KeyCols>,
    data: Partial<InsertOf<Table>>,
    opts: WriteOptions = {},
  ): Promise<RowOf<Table> | null> {
    return this.updateWhere(key, data, opts);
  }

  protected async updateWhere(
    key: Pick<RowOf<Table>, KeyCols>,
    data: Partial<InsertOf<Table>>,
    opts: WriteOptions & { withDeleted?: boolean },
  ): Promise<RowOf<Table> | null> {
    const rows = (await (opts.tx ?? this.db)
      .update(this.table as PgTable)
      .set(data)
      .where(this.where(key, opts))
      .returning()) as unknown[];
    return (rows[0] as RowOf<Table> | undefined) ?? null;
  }
}

/** A repository whose table has a nullable `deletedAt`. Reads and updates skip deleted rows. */
export abstract class SoftDeletableRepository<
  Table extends PgTable,
  KeyCols extends keyof RowOf<Table> & string,
> extends Repository<Table, KeyCols> {
  constructor(
    table: DeletedAtCheck<Table>,
    db: WriteExecutor,
    keyColumns: readonly KeyCols[],
  ) {
    super(table as Table, db, keyColumns);
  }

  protected override where(
    key: Pick<RowOf<Table>, KeyCols>,
    opts: { scope?: SQL; withDeleted?: boolean } = {},
  ): SQL {
    const base = super.where(key, opts);
    if (opts.withDeleted) return base;
    return and(base, isNull(this.table["deletedAt" as keyof Table] as PgColumn))!;
  }

  async softDelete(
    key: Pick<RowOf<Table>, KeyCols>,
    opts: WriteOptions = {},
  ): Promise<RowOf<Table> | null> {
    return this.updateWhere(key, { deletedAt: new Date() } as Partial<InsertOf<Table>>, opts);
  }

  async restore(
    key: Pick<RowOf<Table>, KeyCols>,
    opts: WriteOptions = {},
  ): Promise<RowOf<Table> | null> {
    // Must see the deleted row to restore it.
    return this.updateWhere(key, { deletedAt: null } as Partial<InsertOf<Table>>, {
      ...opts,
      withDeleted: true,
    });
  }
}
