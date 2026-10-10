import "server-only";

/** Anything shaped like better-auth's `ac.newRole(...)` result. */
type RoleLike = { statements: Record<string, readonly string[]> };

/**
 * Expands a comma-separated better-auth role string (`user.role`, e.g.
 * "manager,sku:create") into "resource:action" grants, using the project's own
 * role definitions. One source of truth: no hand-written expansion tables.
 *
 * Unknown role names are returned rather than thrown, so the caller can log
 * them without turning a stale role string into a login failure.
 */
export function permissionsFromRoles(
  roleString: string | null | undefined,
  roles: Record<string, RoleLike>,
): { permissions: Set<string>; unknownRoles: string[] } {
  const permissions = new Set<string>();
  const unknownRoles: string[] = [];
  if (!roleString) return { permissions, unknownRoles };

  for (const raw of roleString.split(",")) {
    const name = raw.trim();
    if (!name) continue;
    // hasOwn, not `roles[name]`: a role string is data, and "constructor" or
    // "toString" must not resolve to something on Object.prototype.
    const role = Object.hasOwn(roles, name) ? roles[name] : undefined;
    if (!role) {
      if (!unknownRoles.includes(name)) unknownRoles.push(name);
      continue;
    }
    for (const [resource, actions] of Object.entries(role.statements)) {
      for (const action of actions) permissions.add(`${resource}:${action}`);
    }
  }
  return { permissions, unknownRoles };
}
