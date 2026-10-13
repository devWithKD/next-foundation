# logger

The `Logger` interface the rest of the package depends on. Types only: the
project provides the implementation (pino, Sentry, Discord…).

```ts
import type { Logger } from "@devwithkd/foundation/logger";
```

| Method | Meaning | Goes to |
|---|---|---|
| `debug` / `info` | diagnostics | stdout |
| `warn(fields, msg)` | wrong but handled | stdout + Sentry (warning) |
| `error(fields, msg)` | unexpected failure; returns the Sentry event id | stdout + Sentry + Discord |
| `event({ event, actorLabel?, fields? })` | expected business milestone | stdout + Discord, never Sentry |
| `child(fields)` | a logger with fields bound to every line | |

- Put the error in `fields.err`: `logger.warn({ err, key }, "cache_get_failed")`.
- Log messages are stable snake_case identifiers so they can be searched and alerted on.
- No `orgId` field: a project that needs a scope adds its own in `child()`.
