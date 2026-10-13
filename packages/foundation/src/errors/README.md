# errors

Typed failures the adapters understand. Throw these from services and policies;
the adapters turn them into `{ ok: false, code, message }` (actions) or
`{ error }` with the right HTTP status (routes).

| Class | `code` | HTTP |
|---|---|---|
| `NotFoundError` | `not_found` | 404 |
| `ForbiddenError` | `forbidden` | 403 |
| `ConflictError` | `conflict` | 409 |
| `RateLimitError` | `rate_limit` | 429 |
| `UnauthorizedError` | `unauthorized` | 401 |
| `ValidationError(fieldErrors)` | `validation` | 422 |

```ts
import { ConflictError, NotFoundError, isAppError } from "@kedar/foundation/errors";

throw new NotFoundError("Role not found");
throw new ConflictError("A role with this name exists", { field: "name" }); // 2nd arg: meta
```

- **Do** subclass `AppError` (set `code`, `httpStatus`) for domain errors the user should see.
- **Don't** throw `AppError` from better-auth hooks: throw `APIError` from `better-auth/api` there.
- Anything that is not an `AppError` is treated as unexpected: logged, reported, and shown as a generic message plus a short `ref`.
