import { hashKey } from "@tanstack/react-query";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createQueryKeys } from "../query";
import {
  defineListQuery,
  fromSearchParams,
  listArray,
  toSearchParams,
  type ListResult,
} from "./index";

const schema = defineListQuery({
  filters: {
    q: z.string().trim().max(100).optional(),
    roleType: listArray(z.enum(["admin", "manager", "worker"])),
    status: z.enum(["active", "inactive"]).optional(),
  },
  sortable: ["title", "roleType", "createdAt"],
  defaultSort: [{ field: "createdAt", dir: "desc" }],
});

describe("defineListQuery defaults", () => {
  it("parse({}) gives the defaults", () => {
    expect(schema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      sort: [{ field: "createdAt", dir: "desc" }],
    });
  });

  it("is typed from the filters and sortable fields", () => {
    const q = schema.parse({});
    expectTypeOf(q.page).toEqualTypeOf<number>();
    expectTypeOf(q.q).toEqualTypeOf<string | undefined>();
    expectTypeOf(q.sort[0]!.field).toEqualTypeOf<"title" | "roleType" | "createdAt">();
  });

  it("honours a custom page size config", () => {
    const s = defineListQuery({
      filters: {},
      sortable: ["id"],
      defaultSort: [],
      pageSize: { default: 10, max: 50 },
    });
    expect(s.parse({}).pageSize).toBe(10);
    expect(s.parse({ pageSize: "500" }).pageSize).toBe(50);
  });

  it("rejects reserved filter names", () => {
    expect(() =>
      defineListQuery({ filters: { page: z.string() }, sortable: ["id"], defaultSort: [] }),
    ).toThrow(/reserved/);
  });
});

describe("paging", () => {
  it("coerces URL strings", () => {
    expect(schema.parse({ page: "3", pageSize: "10" })).toMatchObject({ page: 3, pageSize: 10 });
  });

  it("clamps pageSize to the max instead of rejecting", () => {
    expect(schema.parse({ pageSize: 1000 }).pageSize).toBe(100);
  });

  it.each([{ page: 0 }, { page: -1 }, { page: 1.5 }, { page: "x" }, { pageSize: 0 }])(
    "rejects %j",
    (bad) => {
      expect(schema.safeParse(bad).success).toBe(false);
    },
  );
});

describe("sorting", () => {
  const expected = [
    { field: "title", dir: "asc" },
    { field: "createdAt", dir: "desc" },
  ];

  it("string and object forms parse to the same output", () => {
    const fromString = schema.parse({ sort: "title:asc,createdAt:desc" });
    const fromObjects = schema.parse({ sort: expected });
    expect(fromString.sort).toEqual(expected);
    expect(fromObjects).toEqual(fromString);
  });

  it("accepts the string repeated as separate params", () => {
    expect(schema.parse({ sort: ["title:asc", "createdAt:desc"] }).sort).toEqual(expected);
  });

  it("rejects unknown fields (the SQL-safety boundary)", () => {
    expect(schema.safeParse({ sort: "password:asc" }).success).toBe(false);
    expect(schema.safeParse({ sort: [{ field: "password", dir: "asc" }] }).success).toBe(false);
  });

  it("rejects a bad or missing direction", () => {
    expect(schema.safeParse({ sort: "title:sideways" }).success).toBe(false);
    expect(schema.safeParse({ sort: "title" }).success).toBe(false);
  });

  it("allows at most 3 entries", () => {
    expect(schema.safeParse({ sort: "title:asc,roleType:asc,createdAt:asc" }).success).toBe(true);
    expect(
      schema.safeParse({ sort: "title:asc,roleType:asc,createdAt:asc,title:desc" }).success,
    ).toBe(false);
  });

  it("an empty sort string falls back to the default", () => {
    expect(schema.parse({ sort: "" }).sort).toEqual([{ field: "createdAt", dir: "desc" }]);
  });
});

describe("filters", () => {
  it("listArray accepts one value, many, or nothing", () => {
    expect(schema.parse({ roleType: "admin" }).roleType).toEqual(["admin"]);
    expect(schema.parse({ roleType: ["admin", "worker"] }).roleType).toEqual(["admin", "worker"]);
    expect(schema.parse({}).roleType).toBeUndefined();
    expect(schema.parse({ roleType: null }).roleType).toBeUndefined();
  });

  it("listArray still validates its items", () => {
    expect(schema.safeParse({ roleType: ["admin", "king"] }).success).toBe(false);
  });

  it("trims text filters and ignores unknown params", () => {
    const q = schema.parse({ q: "  hello ", utm_source: "mail" });
    expect(q.q).toBe("hello");
    expect(q).not.toHaveProperty("utm_source");
  });
});

describe("URL round trip", () => {
  it("toSearchParams serialises sort, arrays and drops empties", () => {
    const sp = toSearchParams({
      page: 2,
      q: "",
      status: undefined,
      roleType: ["admin", "worker"],
      sort: [
        { field: "title", dir: "asc" },
        { field: "createdAt", dir: "desc" },
      ],
    });
    expect(sp.toString()).toBe(
      "page=2&roleType=admin&roleType=worker&sort=title%3Aasc%2CcreatedAt%3Adesc",
    );
  });

  it("drops an empty sort array so defaults apply", () => {
    expect(toSearchParams({ sort: [] }).toString()).toBe("");
  });

  it("refuses values it can't serialise", () => {
    expect(() => toSearchParams({ when: new Date() })).toThrow(TypeError);
  });

  it("fromSearchParams makes repeated keys arrays and single keys strings", () => {
    const sp = new URLSearchParams("roleType=admin&roleType=worker&q=x");
    expect(fromSearchParams(sp)).toEqual({ roleType: ["admin", "worker"], q: "x" });
  });

  it("params → URL → params gives the same parsed query", () => {
    const original = schema.parse({
      q: "abc",
      roleType: ["admin", "worker"],
      status: "active",
      page: 3,
      pageSize: 10,
      sort: "title:asc,createdAt:desc",
    });
    const roundTripped = schema.parse(fromSearchParams(toSearchParams(original)));
    expect(roundTripped).toEqual(original);
  });

  it("a single-item array filter survives the round trip", () => {
    const original = schema.parse({ roleType: ["admin"] });
    expect(schema.parse(fromSearchParams(toSearchParams(original))).roleType).toEqual(["admin"]);
  });
});

describe("server prefetch and client share one query key", () => {
  const keys = createQueryKeys("role-templates");

  it("RSC parse({}) and the client's URL round trip hash identically", () => {
    const serverParams = schema.parse({});
    const clientParams = schema.parse(fromSearchParams(toSearchParams(serverParams)));
    expect(hashKey(keys.list(clientParams))).toBe(hashKey(keys.list(serverParams)));
  });

  it("holds with filters set too", () => {
    const serverParams = schema.parse({ q: "ab", roleType: "manager", sort: "title:asc" });
    const clientParams = schema.parse(fromSearchParams(toSearchParams(serverParams)));
    expect(hashKey(keys.list(clientParams))).toBe(hashKey(keys.list(serverParams)));
  });
});

describe("ListResult", () => {
  it("is a plain page envelope", () => {
    expectTypeOf<ListResult<string>>().toEqualTypeOf<{
      items: string[];
      total: number;
      page: number;
      pageSize: number;
    }>();
  });
});
