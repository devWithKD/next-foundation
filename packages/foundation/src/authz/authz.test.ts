import { describe, expect, expectTypeOf, it } from "vitest";
import { ForbiddenError } from "../errors";
import { createAuthz, type PermissionOf } from "./index";

const statements = {
  sku: ["create", "list"],
  so: ["block_qty"],
} as const;
type Permission = PermissionOf<typeof statements>;

const { can, assertCan, capabilities } = createAuthz<Permission>();
const actor = { permissions: new Set<string>(["sku:list", "so:block_qty"]) };

describe("PermissionOf", () => {
  it("builds the resource:action union", () => {
    expectTypeOf<Permission>().toEqualTypeOf<"sku:create" | "sku:list" | "so:block_qty">();
  });
});

describe("can", () => {
  it("is true only for held permissions", () => {
    expect(can(actor, "sku:list")).toBe(true);
    expect(can(actor, "sku:create")).toBe(false);
  });
});

describe("assertCan", () => {
  it("passes when held", () => {
    expect(() => assertCan(actor, "so:block_qty")).not.toThrow();
  });

  it("throws ForbiddenError carrying the denied permission", () => {
    try {
      assertCan(actor, "sku:create");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as ForbiddenError).meta).toEqual({ permission: "sku:create" });
      expect((e as ForbiddenError).message).toBe("You don't have permission to do this");
    }
  });

  it("uses a custom message when given", () => {
    expect(() => assertCan(actor, "sku:create", "Only managers")).toThrow("Only managers");
  });
});

describe("capabilities", () => {
  it("maps names to booleans", () => {
    const caps = capabilities(actor, { canCreate: "sku:create", canList: "sku:list" });
    expect(caps).toEqual({ canCreate: false, canList: true });
    expectTypeOf(caps).toEqualTypeOf<{ canCreate: boolean; canList: boolean }>();
  });
});
