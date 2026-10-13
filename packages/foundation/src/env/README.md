# env

`parseEnv(schema, source, label?)` validates environment variables at import
time, so a bad config crashes at boot instead of surfacing as a runtime 500.

```ts
import { z } from "zod";
import { parseEnv } from "@kedar/foundation/env";

export const serverEnv = parseEnv(
  z.object({
    DATABASE_URL: z.url(),
    TRUST_PROXY: z.stringbool().default(false),
  }),
  process.env,
  "server environment",
);

export const clientEnv = parseEnv(
  z.object({ NEXT_PUBLIC_APP_DOMAIN: z.string() }),
  { NEXT_PUBLIC_APP_DOMAIN: process.env.NEXT_PUBLIC_APP_DOMAIN }, // literal, see below
  "client environment",
);
```

- **Client env must list each variable literally.** `NEXT_PUBLIC_*` values are inlined at build time by text substitution; `process.env` itself or `process.env[key]` is `undefined` in the browser.
- **Booleans use `z.stringbool()`.** `z.coerce.boolean()` turns the string `"false"` into `true`.
- The package never reads `process.env` on its own: every factory takes its config as arguments.
