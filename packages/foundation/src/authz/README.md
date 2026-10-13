# authz

Permission checks over a project's own permission strings. The package knows
only `BaseActor`; how a session becomes an actor is the project's decision.

```ts
import { createAuthz, type PermissionOf, type Statements } from "@devwithkd/foundation/authz";

export const statements = { sku: ["create", "list"], so: ["create", "approve"] } as const satisfies Statements;
export type Permission = PermissionOf<typeof statements>; // "sku:create" | "sku:list" | …

export const { can, assertCan, capabilities } = createAuthz<Permission>();

assertCan(ctx.actor, "sku:create");                              // throws ForbiddenError
const ui = capabilities(ctx.actor, { canCreate: "sku:create" }); // { canCreate: boolean }
```

- `BaseActor = { userId, label, role, permissions: ReadonlySet<string> }`. Extend it with project fields (`Actor = BaseActor & { scope: … }`).
- `role` is for display and audit only. **Never branch on it**: check permissions.
- `assertCan` puts the denied `permission` in the error's `meta`, which `onDenied` in the adapters records as an `authz.denied` audit row.
- Checks are synchronous: resolve permissions once per request (see `better-auth`).
