import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../errors";
import {
  badDeleted,
  items,
  memberships,
  plain,
  recordingDb,
  type RecordedQuery,
} from "../../test/db";
import { Repository, SoftDeletableRepository } from "./repository";
import type { WriteExecutor } from "./types";

class ItemsRepo extends SoftDeletableRepository<typeof items, "id"> {
  constructor(db: WriteExecutor) {
    super(items, db, ["id"]);
  }
}
class PlainRepo extends Repository<typeof plain, "id"> {
  constructor(db: WriteExecutor) {
    super(plain, db, ["id"]);
  }
}
class MembersRepo extends Repository<typeof memberships, "userId" | "unitId"> {
  constructor(db: WriteExecutor) {
    super(memberships, db, ["userId", "unitId"]);
  }
}

const LIVE = ["id-1", "Widget", "unit-1", null];
const DELETED = ["id-1", "Widget", "unit-1", "2026-01-01T00:00:00.000Z"];
const returning = (row: unknown[]) => (q: RecordedQuery) => (/^(select|update|insert)/.test(q.sql) ? [row] : []);

describe("findByKey", () => {
  it("maps a found row, and returns null when there is none", async () => {
    const found = recordingDb(returning(LIVE));
    expect(await new ItemsRepo(found.db).findByKey({ id: "id-1" })).toEqual({
      id: "id-1",
      name: "Widget",
      orgUnitId: "unit-1",
      deletedAt: null,
    });
    expect(await new ItemsRepo(recordingDb().db).findByKey({ id: "nope" })).toBeNull();
  });

  it("excludes soft-deleted rows by default (the v2.0 bug)", async () => {
    const { db, last } = recordingDb();
    await new ItemsRepo(db).findByKey({ id: "A" });
    expect(last().sql).toContain('"items"."id" = $1');
    expect(last().sql).toContain('"items"."deleted_at" is null');
    expect(last().params).toEqual(["A", 1]);
  });

  it("withDeleted drops only the deleted filter", async () => {
    const { db, last } = recordingDb(returning(DELETED));
    const row = await new ItemsRepo(db).findByKey({ id: "A" }, { withDeleted: true });
    expect(last().sql).not.toContain("deleted_at\" is null");
    // Returned, not null. (Date vs string depends on the driver's decoders, which this fake lacks.)
    expect(row).toMatchObject({ id: "id-1", name: "Widget" });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("ANDs the scope with the key", async () => {
    const { db, last } = recordingDb();
    await new ItemsRepo(db).findByKey({ id: "A" }, { scope: eq(items.orgUnitId, "U") });
    expect(last().sql).toContain('"items"."org_unit_id" = $2');
    expect(last().params).toEqual(["A", "U", 1]);
  });

  it("a plain (non-soft-deletable) repository adds no deleted filter", async () => {
    const { db, last } = recordingDb();
    await new PlainRepo(db).findByKey({ id: "A" });
    expect(last().sql).not.toContain("deleted_at");
  });

  it("ANDs every column of a composite key", async () => {
    const { db, last } = recordingDb();
    await new MembersRepo(db).findByKey({ userId: "u", unitId: "x" });
    expect(last().sql).toContain('"memberships"."user_id" = $1');
    expect(last().sql).toContain('"memberships"."unit_id" = $2');
    expect(last().params).toEqual(["u", "x", 1]);
  });

  it("runs on the given transaction instead of the default database", async () => {
    const own = recordingDb();
    const tx = recordingDb();
    await new ItemsRepo(own.db).findByKey({ id: "A" }, { tx: tx.db });
    expect(own.calls).toHaveLength(0);
    expect(tx.calls).toHaveLength(1);
  });
});

describe("locks (opt-in per call)", () => {
  const sqlFor = async (lock?: Parameters<ItemsRepo["findByKey"]>[1] extends infer O ? (O extends { lock?: infer L } ? L : never) : never) => {
    const { db, last } = recordingDb();
    await new ItemsRepo(db).findByKey({ id: "A" }, { lock });
    return last().sql;
  };

  it("adds no lock clause by default", async () => {
    expect(await sqlFor(undefined)).not.toMatch(/ for /);
  });
  it.each([
    ["update", /limit \$2 for update$/],
    ["update-nowait", /for update nowait$/],
    ["update-skip-locked", /for update skip locked$/],
    ["share", /for share$/],
  ] as const)("%s", async (mode, pattern) => {
    expect(await sqlFor(mode)).toMatch(pattern);
  });
});

describe("requireByKey", () => {
  it("returns the row", async () => {
    const { db } = recordingDb(returning(LIVE));
    expect((await new ItemsRepo(db).requireByKey({ id: "id-1" })).name).toBe("Widget");
  });

  it("throws NotFoundError with the caller's message", async () => {
    const repo = new ItemsRepo(recordingDb().db);
    await expect(repo.requireByKey({ id: "x" }, { notFound: "Role template not found" })).rejects.toThrow(
      new NotFoundError("Role template not found"),
    );
    await expect(repo.requireByKey({ id: "x" })).rejects.toThrow("Not found");
  });
});

describe("create", () => {
  it("inserts and returns the row", async () => {
    const { db, last } = recordingDb(returning(LIVE));
    const row = await new ItemsRepo(db).create({ name: "Widget" });
    expect(last().sql).toMatch(/^insert into "items"/);
    expect(last().sql).toContain("returning");
    expect(row.name).toBe("Widget");
  });
});

describe("update", () => {
  it("excludes soft-deleted rows, so a deleted row can't be edited", async () => {
    const { db, last } = recordingDb();
    expect(await new ItemsRepo(db).update({ id: "A" }, { name: "n" })).toBeNull();
    expect(last().sql).toContain('"items"."deleted_at" is null');
  });

  it("applies the scope: a policy bug updates nothing instead of someone else's row", async () => {
    const { db, last } = recordingDb();
    await new ItemsRepo(db).update({ id: "A" }, { name: "n" }, { scope: eq(items.orgUnitId, "U") });
    expect(last().sql).toContain('"items"."org_unit_id" = $3');
    expect(last().params).toEqual(["n", "A", "U"]);
  });

  it("returns the updated row", async () => {
    const { db } = recordingDb(returning(LIVE));
    expect((await new ItemsRepo(db).update({ id: "id-1" }, { name: "Widget" }))?.id).toBe("id-1");
  });
});

describe("softDelete / restore", () => {
  it("softDelete stamps deletedAt, only on live rows, within scope", async () => {
    const { db, last } = recordingDb();
    await new ItemsRepo(db).softDelete({ id: "A" }, { scope: eq(items.orgUnitId, "U") });
    expect(last().sql).toMatch(/^update "items" set "deleted_at" = \$1/);
    expect(last().sql).toContain('"items"."deleted_at" is null');
    expect(last().sql).toContain('"items"."org_unit_id"');
    expect(typeof last().params[0]).toBe("string"); // an ISO timestamp
  });

  it("restore clears deletedAt and can see the deleted row", async () => {
    const { db, last } = recordingDb();
    await new ItemsRepo(db).restore({ id: "A" });
    expect(last().sql).toMatch(/^update "items" set "deleted_at" = \$1/);
    expect(last().params).toEqual([null, "A"]);
    expect(last().sql).not.toContain('deleted_at" is null');
  });

  it("restore still applies the scope", async () => {
    const { db, last } = recordingDb();
    await new ItemsRepo(db).restore({ id: "A" }, { scope: eq(items.orgUnitId, "U") });
    expect(last().sql).toContain('"items"."org_unit_id"');
  });
});

describe("compile-time guard for soft-deletable tables", () => {
  it("rejects tables without a nullable deletedAt", () => {
    const { db } = recordingDb();
    class NoColumn extends SoftDeletableRepository<typeof plain, "id"> {
      constructor() {
        // @ts-expect-error plain has no deletedAt column
        super(plain, db, ["id"]);
      }
    }
    class NotNullable extends SoftDeletableRepository<typeof badDeleted, "id"> {
      constructor() {
        // @ts-expect-error deletedAt exists but is NOT NULL
        super(badDeleted, db, ["id"]);
      }
    }
    expect(NoColumn).toBeDefined();
    expect(NotNullable).toBeDefined();
  });
});
