import { ForbiddenError } from "../errors";

/** A project's permission statements: resource → allowed actions. Declare with `as const`. */
export type Statements = Record<string, readonly string[]>;

/** "resource:action" union built from the statements, so every check is type-checked. */
export type PermissionOf<S extends Statements> = {
  [R in keyof S & string]: `${R}:${S[R][number]}`;
}[keyof S & string];

/** The minimum every project's Actor must have. Projects extend it with their own fields. */
export type BaseActor = {
  userId: string;
  /** Human-readable, used in audit rows. */
  label: string;
  /** Opaque, for display and audit only. Never branch on it: use permissions. */
  role: string | null;
  /** Resolved once per request (see `permissionsFromRoles`). Checks are synchronous. */
  permissions: ReadonlySet<string>;
};

type HasPermissions = Pick<BaseActor, "permissions">;

/**
 * Permission helpers bound to a project's `Permission` union:
 *   const { can, assertCan, capabilities } = createAuthz<Permission>();
 */
export function createAuthz<P extends string>() {
  function can(actor: HasPermissions, permission: P): boolean {
    return actor.permissions.has(permission);
  }

  function assertCan(actor: HasPermissions, permission: P, message?: string): void {
    if (!can(actor, permission)) {
      // `permission` goes in meta so the adapters can record exactly what was denied.
      throw new ForbiddenError(message ?? "You don't have permission to do this", {
        permission,
      });
    }
  }

  /** Booleans for a page or component: `capabilities(actor, { canCreate: "so:create_external" })`. */
  function capabilities<const M extends Record<string, P>>(
    actor: HasPermissions,
    map: M,
  ): { -readonly [K in keyof M]: boolean } {
    // `-readonly`: the `const` generic makes M readonly, and a mapped type would inherit that.
    const out = {} as { -readonly [K in keyof M]: boolean };
    for (const key of Object.keys(map) as (keyof M & string)[]) {
      out[key] = can(actor, map[key] as P);
    }
    return out;
  }

  return { can, assertCan, capabilities };
}
