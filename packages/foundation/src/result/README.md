# result

The wire types shared by server and client. Types only, no runtime.

```ts
import type { ActionResult, ApiSuccess, ApiFailure, ErrorPayload } from "@devwithkd/foundation/result";
```

- `ActionResult<T>`: what a server action returns. `{ ok: true, data }` or `{ ok: false, code, message, fieldErrors?, ref? }`. Actions return errors as data and never throw.
- `ApiSuccess<T>` / `ApiFailure`: route handler bodies, `{ data }` or `{ error: ErrorPayload }`.
- `ErrorPayload.ref` is a short log/Sentry reference, present only for unexpected failures.

On the client, `@devwithkd/foundation/react` turns both shapes into one `ApiError`.
