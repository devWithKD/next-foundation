# list

One schema per list endpoint, shared by the RSC prefetch, the route handler
and the client hook.

```ts
import { z } from "zod";
import { defineListQuery, listArray } from "@kedar/foundation/list";

export const roleListQuery = defineListQuery({
  filters: { q: z.string().optional(), status: listArray(z.enum(["active", "archived"])) },
  sortable: ["name", "createdAt"],            // the only fields user input can reach SQL through
  defaultSort: [{ field: "createdAt", dir: "desc" }],
  pageSize: { default: 25, max: 100 },
});
export type RoleListQuery = z.output<typeof roleListQuery>;
```

- Accepts objects (server) and URL strings (route handler): `schema.parse({})` gives the same defaults everywhere, which is what lets the server-prefetched page and the client's first query share one query key.
- `sortable` is a **security boundary**: a sort field is only ever one of these names. Map each to a column in the query file (`buildOrderBy` in `db`).
- `?sort=name:asc,createdAt:desc`; at most 3 entries. `?pageSize=1000` is clamped to `max`. Unknown params are ignored.
- `toSearchParams` / `fromSearchParams` convert between query objects and URLs (arrays become repeated keys; empty values are dropped).
- `ListResult<T> = { items, total, page, pageSize }`.
- Tables are client-driven: RSC prefetches only the first, static-ish page; TanStack takes over from there.
