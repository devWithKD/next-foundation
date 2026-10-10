import { z } from "zod";

export type SortDir = "asc" | "desc";
export type SortSpec<F extends string = string> = { field: F; dir: SortDir };

/** What every list endpoint returns: one page, plus the total for page numbers. */
export type ListResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export type ListQuery<F extends z.ZodRawShape, S extends string> = {
  page: number;
  pageSize: number;
  sort: SortSpec<S>[];
} & z.output<z.ZodObject<F>>;

const MAX_SORT_ENTRIES = 3;
const RESERVED = ["page", "pageSize", "sort"] as const;

/**
 * "field:dir,field:dir" (or the same string repeated as ?sort=a:asc&sort=b:desc)
 * → [{ field, dir }]. Anything else passes through untouched for zod to judge.
 * Strict on purpose: "title" without ":dir" fails validation instead of guessing.
 */
function parseSortInput(value: unknown): unknown {
  const parseOne = (s: string) =>
    s
      .split(",")
      .filter((part) => part !== "")
      .map((part) => {
        const [field, dir] = part.split(":");
        return { field, dir };
      });

  if (typeof value === "string") return value === "" ? undefined : parseOne(value);
  if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string")) {
    return value.flatMap(parseOne);
  }
  return value;
}

/**
 * One schema per list endpoint, shared by the RSC prefetch, the route handler
 * and the client hook. It accepts objects (server) and URL strings (route
 * handler), so `schema.parse({})` gives identical defaults everywhere. That is
 * what lets the server-prefetched page and the client's first query share one
 * query key.
 *
 * `sortable` is a SECURITY BOUNDARY: a sort field is only ever one of these
 * names, so user input never reaches SQL text. Map each name to a column in
 * the query file.
 */
export function defineListQuery<
  const F extends z.ZodRawShape,
  const S extends readonly [string, ...string[]],
>(opts: {
  filters: F;
  sortable: S;
  defaultSort: SortSpec<S[number]>[];
  pageSize?: { default: number; max: number };
}): z.ZodType<ListQuery<F, S[number]>> {
  for (const key of RESERVED) {
    if (key in opts.filters) {
      throw new Error(`defineListQuery: "${key}" is reserved and can't be a filter name`);
    }
  }
  const size = opts.pageSize ?? { default: 25, max: 100 };

  const page = z.coerce.number().int().min(1).default(1);
  // Clamp, don't reject: ?pageSize=1000 means "as many as allowed".
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .transform((n) => Math.min(n, size.max))
    .default(size.default);
  // The default lives INSIDE the preprocess: both an absent sort and an empty
  // "?sort=" reach the inner schema as undefined. An outer .default() would only
  // catch the absent case.
  const sort = z.preprocess(
    parseSortInput,
    z
      .array(z.object({ field: z.enum(opts.sortable), dir: z.enum(["asc", "desc"]) }))
      .max(MAX_SORT_ENTRIES)
      .default(opts.defaultSort),
  );

  // z.object strips unknown keys, so stray params (?utm_source=…) are ignored.
  return z.object({ ...opts.filters, page, pageSize, sort }) as unknown as z.ZodType<
    ListQuery<F, S[number]>
  >;
}

/**
 * A multi-value filter. Accepts one value, many values, or nothing:
 * ?status=a, ?status=a&status=b, or absent all work (URLs can't tell a
 * one-element array from a string).
 */
export function listArray<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (v) => (v == null ? undefined : Array.isArray(v) ? v : [v]),
    z.array(item).optional(),
  ) as unknown as z.ZodType<z.output<T>[] | undefined>;
}

/**
 * Query object → URL params. Arrays become repeated keys, `sort` becomes
 * "field:dir,field:dir", and undefined / null / "" are dropped so a cleared
 * filter leaves no trace in the URL.
 */
export function toSearchParams(query: Record<string, unknown>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;

    if (key === "sort" && Array.isArray(value)) {
      const text = value
        .map((s: SortSpec) => `${s.field}:${s.dir}`)
        .join(",");
      if (text) sp.set("sort", text);
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, String(v));
      continue;
    }
    if (typeof value === "object") {
      throw new TypeError(`toSearchParams: unsupported value for "${key}"`);
    }
    sp.set(key, String(value));
  }
  return sp;
}

/** URL params → plain object: repeated keys become arrays, single keys stay strings. */
export function fromSearchParams(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}
