import { isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { items, recordingDb } from "../../test/db";
import { makeOptionQuery } from "./option-query";

const global = (db: ReturnType<typeof recordingDb>["db"], extra = {}) =>
  makeOptionQuery({
    table: items,
    id: "id",
    label: "name",
    searchable: ["name"],
    active: isNull(items.deletedAt),
    rx: db,
    ...extra,
  });

describe("makeOptionQuery (global)", () => {
  it("returns { id, label } options ordered by label", async () => {
    const { db, last } = recordingDb(() => [["id-1", "Alpha"]]);
    const options = await global(db)({});
    expect(options).toEqual([{ id: "id-1", label: "Alpha" }]);
    expect(last().sql).toContain('"items"."deleted_at" is null');
    expect(last().sql).toContain('order by "items"."name"');
  });

  it("searches case-insensitively on the searchable columns", async () => {
    const { db, last } = recordingDb();
    await global(db)({ q: "wid" });
    expect(last().sql).toContain('"items"."name" ilike $1');
    expect(last().params[0]).toBe("%wid%");
  });

  it("treats % _ and \\ in the search text as ordinary characters", async () => {
    const { db, last } = recordingDb();
    await global(db)({ q: "100%_a\\b" });
    expect(last().params[0]).toBe("%100\\%\\_a\\\\b%");
  });

  it("keeps the selected option visible even if it no longer matches", async () => {
    const { db, last } = recordingDb();
    await global(db)({ q: "zzz", selectedId: "keep-me" });
    expect(last().sql).toMatch(/\) or \("items"\."id" = \$\d\)/);
    expect(last().params).toContain("keep-me");
  });

  it("defaults to 10 and caps the limit at 50", async () => {
    const { db, last, calls } = recordingDb();
    await global(db)({});
    expect(last().params.at(-1)).toBe(10);
    await global(db)({ limit: 500 });
    expect(calls.at(-1)!.params.at(-1)).toBe(50);
  });

  it("returns extra columns when asked", async () => {
    const { db, last } = recordingDb(() => [["unit-1", "id-1", "Alpha"]]);
    const options = await global(db, { returnable: ["orgUnitId"] })({});
    expect(options).toEqual([{ orgUnitId: "unit-1", id: "id-1", label: "Alpha" }]);
    expect(last().sql).toContain('"org_unit_id"');
  });
});

describe("makeOptionQuery (scoped to an owner column)", () => {
  const scoped = (db: ReturnType<typeof recordingDb>["db"]) =>
    makeOptionQuery({
      table: items,
      id: "id",
      label: "name",
      searchable: ["name"],
      orgId: "orgUnitId",
      rx: db,
    });

  it("filters by the owner column", async () => {
    const { db, last } = recordingDb();
    await scoped(db)("unit-1", {});
    expect(last().sql).toContain('"items"."org_unit_id" = $1');
    expect(last().params[0]).toBe("unit-1");
  });

  it("an EMPTY owner id still filters (matches nothing) instead of skipping the filter", async () => {
    const { db, last } = recordingDb();
    await scoped(db)("", {});
    expect(last().sql).toContain('"items"."org_unit_id" = $1');
    expect(last().params[0]).toBe("");
  });
});
