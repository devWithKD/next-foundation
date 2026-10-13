# react

Client-side pieces. Every file is a client module except `api-error.ts`, which
is isomorphic.

```ts
import { ApiError, fetchApi, applyFieldErrors, useListState, useActionMutation } from "@kedar/foundation/react";
```

**`fetchApi<T>(url, init?)`** calls a route built with `createRoute` and unwraps `{ data }`. Every failure is an `ApiError`: the server's `{ error }` keeps its code and field errors, a dropped connection is `ApiError(0, network)`, an unreadable body is `bad_response`. An `AbortError` (TanStack cancelling a stale query) passes through untouched. `204` returns `undefined`.

**`ApiError`**: `status` (HTTP status, `0` for network, `null` for a server action), `code`, `fieldErrors`, `ref` (the short log reference to show for unexpected errors).

**`useActionMutation(action, { invalidate?, onSuccess? })`** wraps a server action as a TanStack mutation that **throws** `ApiError` on `{ ok: false }`, so `onError` and `mutateAsync().catch` work normally. Every key in `invalidate` is invalidated (and awaited) before `onSuccess`.

```tsx
const create = useActionMutation(createRole, { invalidate: [roleKeys.lists], onSuccess: () => router.back() });
create.mutate(values, { onError: (e) => { if (!applyFieldErrors(form.setError, e.fieldErrors)) toast.error(e.message); } });
```

**`applyFieldErrors(setError, fieldErrors)`** copies server field errors onto a form (first message per field) and returns whether any applied, so you toast the message only when no field took it. Works with react-hook-form's `setError` without depending on it.

**`useListState(schema, { debounceMs?, debouncedKeys? })`** holds table state for one list query, built from the same `defineListQuery` schema the server uses.

```tsx
const list = useListState(roleListQuery);                  // params starts as roleListQuery.parse({})
const { data } = useQuery({ queryKey: roleKeys.list(list.params), queryFn: () => fetchApi(`/api/v1/roles?${toSearchParams(list.params)}`) });
<input value={String(list.draft.q ?? "")} onChange={(e) => list.setFilter("q", e.target.value)} />
```

- Initial `params` equals the RSC prefetch's params, so the first render hits the hydrated cache.
- `params` is what goes in the query key. Filters named in `debouncedKeys` (default just `q`) lag typing by `debounceMs`; a string value can't tell a text box from a dropdown, so say which keys are text. Everything else applies at once. `draft` is the un-debounced input for controlled text fields.
- Any filter, sort or page-size change goes back to page 1.
- A value the schema rejects keeps the last good params instead of throwing during render.
