import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createQueryKeys, getQueryClient } from "./index";

describe("createQueryKeys", () => {
  const keys = createQueryKeys("role-templates");

  it("builds hierarchical keys", () => {
    expect(keys.all).toEqual(["role-templates"]);
    expect(keys.lists).toEqual(["role-templates", "list"]);
    expect(keys.list({ page: 1 })).toEqual(["role-templates", "list", { page: 1 }]);
    expect(keys.details).toEqual(["role-templates", "detail"]);
    expect(keys.detail("abc")).toEqual(["role-templates", "detail", "abc"]);
    expect(keys.options({ q: "x" })).toEqual(["role-templates", "options", { q: "x" }]);
  });

  it("invalidating `lists` hits every list and leaves details alone", async () => {
    const qc = new QueryClient();
    qc.setQueryData(keys.list({ page: 1 }), "a");
    qc.setQueryData(keys.list({ page: 2 }), "b");
    qc.setQueryData(keys.detail("x"), "c");

    await qc.invalidateQueries({ queryKey: keys.lists });

    expect(qc.getQueryState(keys.list({ page: 1 }))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(keys.list({ page: 2 }))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(keys.detail("x"))?.isInvalidated).toBe(false);
  });

  it("invalidating `all` hits everything for the module only", async () => {
    const qc = new QueryClient();
    qc.setQueryData(keys.detail("x"), "c");
    qc.setQueryData(["other", "list"], "d");

    await qc.invalidateQueries({ queryKey: keys.all });

    expect(qc.getQueryState(keys.detail("x"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["other", "list"])?.isInvalidated).toBe(false);
  });
});

describe("getQueryClient", () => {
  it("sets a stale time so hydrated data isn't refetched immediately", () => {
    expect(getQueryClient().getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it("returns a fresh client per call on the server (never shared across requests)", () => {
    // vitest runs in node: no window, so this is the server branch.
    expect(getQueryClient()).not.toBe(getQueryClient());
  });
});
