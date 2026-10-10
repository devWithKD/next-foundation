import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { items, recordingDb } from "../../test/db";
import { buildOrderBy, inIds, isUniqueViolation, paginate, withAdvisoryLock } from "./helpers";

const render = (q: SQL) => new PgDialect().sqlToQuery(q);

describe("inIds", () => {
  it('"all" means no restriction', () => {
    expect(inIds(items.orgUnitId, "all")).toBeUndefined();
  });

  it("an EMPTY list matches nothing (never everything, never a syntax error)", () => {
    expect(render(inIds(items.orgUnitId, [])!).sql).toBe("false");
  });

  it("a list becomes IN", () => {
    expect(render(inIds(items.orgUnitId, ["a", "b"])!)).toEqual({
      sql: '"items"."org_unit_id" in ($1, $2)',
      params: ["a", "b"],
    });
  });
});

describe("buildOrderBy", () => {
  const sortMap = { name: items.name, unit: items.orgUnitId };
  const joined = (parts: SQL[]) => render(sql.join(parts, sql`, `)).sql;

  it("appends a unique tiebreaker so pages never repeat or skip rows", () => {
    expect(joined(buildOrderBy(sortMap, [], items.id))).toBe('"items"."id" asc');
  });

  it("maps fields through the whitelist and keeps direction and order", () => {
    const parts = buildOrderBy(
      sortMap,
      [
        { field: "name", dir: "desc" },
        { field: "unit", dir: "asc" },
      ],
      items.id,
    );
    expect(joined(parts)).toBe(
      '"items"."name" desc, "items"."org_unit_id" asc, "items"."id" asc',
    );
  });

  it("accepts SQL expressions in the map (e.g. aggregates)", () => {
    const parts = buildOrderBy({ count: sql`coalesce(c.total, 0)` }, [{ field: "count", dir: "desc" }], items.id);
    expect(joined(parts)).toBe('coalesce(c.total, 0) desc, "items"."id" asc');
  });
});

describe("paginate", () => {
  it("converts 1-based pages to limit/offset", () => {
    expect(paginate({ page: 1, pageSize: 25 })).toEqual({ limit: 25, offset: 0 });
    expect(paginate({ page: 3, pageSize: 25 })).toEqual({ limit: 25, offset: 50 });
  });
});

describe("isUniqueViolation", () => {
  it("recognises the Postgres error directly", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("finds it on .cause (Drizzle wraps driver errors)", () => {
    const wrapped = new Error("Failed query", { cause: { code: "23505", constraint_name: "po_number_uq" } });
    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(wrapped, "po_number_uq")).toBe(true);
  });

  it("matches the constraint by either field name, and rejects others", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "a" }, "a")).toBe(true);
    expect(isUniqueViolation({ code: "23505", constraint_name: "a" }, "b")).toBe(false);
  });

  it("is false for other errors and non-objects", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });

  it("terminates on a circular cause chain", () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(isUniqueViolation(a)).toBe(false);
  });
});

describe("withAdvisoryLock", () => {
  it("takes a transaction-scoped lock keyed by the hash of the string", async () => {
    const { db, last } = recordingDb();
    await withAdvisoryLock(db, "numbering:SO");
    expect(last().sql).toBe("select pg_advisory_xact_lock(hashtext($1))");
    expect(last().params).toEqual(["numbering:SO"]);
  });
});
