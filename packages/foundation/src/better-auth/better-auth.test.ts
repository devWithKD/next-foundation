import { describe, expect, it } from "vitest";
import { permissionsFromRoles } from "./index";

const roles = {
  // tier role: many grants
  admin: { statements: { sku: ["create", "list"], so: ["block_qty"] } },
  // literal role: exactly one grant
  "sku:create": { statements: { sku: ["create"] } },
  "qr:resolve": { statements: { qr: ["resolve"] } },
};

const sorted = (s: Set<string>) => [...s].sort();

describe("permissionsFromRoles", () => {
  it("expands a tier role", () => {
    const { permissions, unknownRoles } = permissionsFromRoles("admin", roles);
    expect(sorted(permissions)).toEqual(["sku:create", "sku:list", "so:block_qty"]);
    expect(unknownRoles).toEqual([]);
  });

  it("expands literal roles", () => {
    const { permissions } = permissionsFromRoles("sku:create,qr:resolve", roles);
    expect(sorted(permissions)).toEqual(["qr:resolve", "sku:create"]);
  });

  it("unions a mix without duplicates", () => {
    const { permissions } = permissionsFromRoles("admin,sku:create", roles);
    expect(sorted(permissions)).toEqual(["sku:create", "sku:list", "so:block_qty"]);
  });

  it("returns unknown names instead of throwing, once each", () => {
    const { permissions, unknownRoles } = permissionsFromRoles("qr:resolve,ghost,ghost", roles);
    expect(sorted(permissions)).toEqual(["qr:resolve"]);
    expect(unknownRoles).toEqual(["ghost"]);
  });

  it("tolerates whitespace and empty segments", () => {
    const { permissions } = permissionsFromRoles(" admin , ,, qr:resolve ", roles);
    expect(sorted(permissions)).toEqual(["qr:resolve", "sku:create", "sku:list", "so:block_qty"]);
  });

  it.each([null, undefined, ""])("gives nothing for %j", (input) => {
    expect(permissionsFromRoles(input, roles)).toEqual({
      permissions: new Set(),
      unknownRoles: [],
    });
  });

  it("does not resolve Object.prototype keys", () => {
    const { permissions, unknownRoles } = permissionsFromRoles("constructor,toString", roles);
    expect(permissions.size).toBe(0);
    expect(unknownRoles).toEqual(["constructor", "toString"]);
  });
});
