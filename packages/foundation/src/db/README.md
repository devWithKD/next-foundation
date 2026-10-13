# db

Data-access base for Drizzle (`PgAsyncDatabase`, no relations: queries use the
query builder only).

```ts
import { Repository, SoftDeletableRepository, inIds, buildOrderBy, paginate } from "@kedar/foundation/db";

class RoleRepository extends SoftDeletableRepository<typeof role, "id"> {
  constructor(db: WriteExecutor) { super(role, db, ["id"]); }
}

await roles.requireByKey({ id }, { tx, lock: "update", scope: orgUnitWhere(role.orgUnitId, actor.scope) });
await roles.update({ id }, { name }, { tx, scope });     // scope applies to updates too
await roles.softDelete({ id }, { tx });                  // sets deletedAt
```

- **Keys can be composite.** The third constructor argument lists the key columns: `["id"]` for a surrogate key, `["poId", "userId"]` for a join table. Every method takes `Pick<Row, KeyCols>` as its key.
- `Repository` is for the **write path** (load to mutate, then save). Reads made to *show* something belong in `*.queries.ts`.
- Every method takes one options object: `{ tx?, lock?, scope?, withDeleted? }`. A `scope` is ANDed into reads **and** updates, so a policy bug updates nothing instead of someone else's row.
- Soft delete is `deletedAt IS NOT NULL`: there is no `isDeleted` flag. `SoftDeletableRepository` excludes deleted rows unless `withDeleted`, and its type refuses a table without a nullable `deletedAt`.
- **Row locks are opt-in** (`lock: "update" | "update-nowait" | "update-skip-locked" | "share"`) and unused until a flow needs them. A guarded `UPDATE … WHERE` is the default concurrency tool.
- Helpers: `inIds(column, ids | "all")`, `buildOrderBy(sortMap, sorts, tiebreaker)` (always adds a unique tiebreaker so pages don't repeat or skip rows), `paginate({ page, pageSize })`, `withAdvisoryLock(tx, key)` (transaction-scoped), `isUniqueViolation(e, constraint?)` (walks `.cause`).
- `makeOptionQuery({ table, id, label, searchable, rx, … })` builds `{ id, label }` lookups for selects (search, a pinned `selectedId`, capped limit).
- Test repositories with drizzle's `pg-proxy` driver and a recording callback: assert the SQL, no database needed.
