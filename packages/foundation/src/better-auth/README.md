# better-auth

Helpers for projects that use better-auth. The package never imports your
`auth` instance; it only provides pure pieces.

`permissionsFromRoles(roleString, roles)` expands a comma-separated role string
into `resource:action` grants from your own role definitions:

```ts
import { permissionsFromRoles } from "@kedar/foundation/better-auth";

const { permissions, unknownRoles } = permissionsFromRoles(session.user.role, roles);
// "manager,sku:create"  →  every grant of the manager role, plus "sku:create"
```

- Works with the admin plugin's `user.role` and the organization plugin's `member.role` (both are comma-separated). Dynamic organization roles live in the database: load them and pass them in `roles`.
- Unknown role names are **returned**, not thrown: log them, but don't turn a stale role string into a login failure.
- Role names are looked up with `Object.hasOwn`, so a role called `constructor` can't resolve to something on `Object.prototype`.
- Auth is a slot: using better-auth at all, which plugins, and how roles are stored are project decisions.
