# query

TanStack Query plumbing for the RSC-prefetch-then-client pattern.

```ts
import { createQueryKeys, getQueryClient } from "@devwithkd/foundation/query";

export const roleKeys = createQueryKeys("role");
roleKeys.list(params);   // ["role", "list", params]
roleKeys.detail(id);     // ["role", "detail", id]
roleKeys.lists;          // ["role", "list"]: invalidate every list
roleKeys.all;            // ["role"]: invalidate the module
```

- Use the **same** key factory in the RSC prefetch and the client hook; with the same params the keys are identical and the hydrated data is used.
- `getQueryClient()`: a fresh client per call on the server (never share between requests), one singleton in the browser. `staleTime` is 30 s, otherwise the client refetches straight after hydration and the prefetch is wasted. Pending queries are dehydrated so streaming works.
