import { describe, expect, expectTypeOf, it } from "vitest";
import type { BaseActor } from "../authz";
import type { RequestContext } from "../context";
import { auditEntry, defineAuditActions, diff, redact, type AuditContext } from ".";

const ctx: AuditContext = {
  actor: { userId: "u1", label: "Asha (asha)", role: "admin" },
  requestId: "req-1",
  ipAddress: "1.2.3.4",
  userAgent: "vitest",
};

const userAudit = defineAuditActions("user", { created: "medium", deleted: "critical", viewed: "low" });

describe("defineAuditActions", () => {
  it("builds name, resource and the declared severity", () => {
    expect(userAudit.created).toEqual({ name: "user.created", resource: "user", severity: "medium" });
    expect(userAudit.deleted.severity).toBe("critical");
  });

  it("keeps literal types", () => {
    expectTypeOf(userAudit.created.name).toEqualTypeOf<"user.created">();
    expectTypeOf(userAudit.created.severity).toEqualTypeOf<"medium">();
    // @ts-expect-error not declared
    void userAudit.nope;
  });

  it("rejects an unknown severity", () => {
    // @ts-expect-error "urgent" is not a severity
    defineAuditActions("x", { a: "urgent" });
  });
});

describe("AuditContext", () => {
  it("is satisfied structurally by RequestContext", () => {
    expectTypeOf<RequestContext<BaseActor>>().toExtend<AuditContext>();
  });
});

describe("auditEntry", () => {
  it("builds a create entry from the context and action", () => {
    const row = auditEntry(ctx, { action: userAudit.created, resourceId: "r1", after: { name: "Ravi" } });
    expect(row).toEqual({
      actorUserId: "u1",
      actorLabel: "Asha (asha)",
      actorRole: "admin",
      action: "user.created",
      resourceType: "user",
      resourceId: "r1",
      status: "success",
      severity: "medium",
      before: null,
      after: { name: "Ravi" },
      meta: null,
      ipAddress: "1.2.3.4",
      userAgent: "vitest",
      requestId: "req-1",
    });
  });

  it("stores only the changed keys of an update", () => {
    const row = auditEntry(ctx, {
      action: userAudit.created,
      resourceId: "r1",
      before: { name: "A", email: "a@x", age: 3 },
      after: { name: "B", email: "a@x", age: 3 },
    });
    expect(row?.before).toEqual({ name: "A" });
    expect(row?.after).toEqual({ name: "B" });
  });

  it("returns null for an update that changed nothing", () => {
    expect(auditEntry(ctx, { action: userAudit.created, resourceId: "r1", before: { a: 1, b: { c: 2 } }, after: { b: { c: 2 }, a: 1 } })).toBeNull();
  });

  it("keeps the whole snapshot for a delete (before only)", () => {
    const row = auditEntry(ctx, { action: userAudit.deleted, resourceId: "r1", before: { name: "A" } });
    expect(row).toMatchObject({ before: { name: "A" }, after: null, severity: "critical" });
  });

  it("lets the caller override severity and status", () => {
    const row = auditEntry(ctx, { action: userAudit.viewed, resourceId: null, status: "failure", severity: "high" });
    expect(row).toMatchObject({ status: "failure", severity: "high", resourceId: null });
  });

  it("works with no actor (failed sign-in)", () => {
    const row = auditEntry({ ...ctx, actor: null }, { action: userAudit.viewed, resourceId: null, meta: { identifier: "asha" } });
    expect(row).toMatchObject({ actorUserId: null, actorLabel: null, actorRole: null, meta: { identifier: "asha" } });
  });

  it("records a changed password as changed, but never its value", () => {
    const row = auditEntry(ctx, { action: userAudit.created, resourceId: "r1", before: { password: "old", name: "A" }, after: { password: "new", name: "A" } });
    expect(row?.before).toEqual({ password: "[redacted]" });
    expect(row?.after).toEqual({ password: "[redacted]" });
    expect(JSON.stringify(row)).not.toMatch(/old|new/);
  });

  it("redacts meta as well", () => {
    const row = auditEntry(ctx, { action: userAudit.viewed, resourceId: null, meta: { token: "abc", path: "/x" } });
    expect(row?.meta).toEqual({ token: "[redacted]", path: "/x" });
  });
});

describe("redact", () => {
  it("is case-insensitive and recursive, including arrays", () => {
    expect(redact({ Password: "p", nested: { APIKEY: "k", list: [{ accessToken: "t", ok: 1 }] } })).toEqual({
      Password: "[redacted]",
      nested: { APIKEY: "[redacted]", list: [{ accessToken: "[redacted]", ok: 1 }] },
    });
  });

  it("does NOT redact `code` or `hash` (decision A4)", () => {
    expect(redact({ code: "QR-1", hash: "abc", idToken: "x" })).toEqual({ code: "QR-1", hash: "abc", idToken: "[redacted]" });
  });

  it("supports extra keys", () => {
    expect(redact({ pan: "123", name: "A" }, { extraKeys: ["PAN"] })).toEqual({ pan: "[redacted]", name: "A" });
  });

  it("keeps Dates and other class instances intact", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(redact({ at: d })).toEqual({ at: d });
    expect((redact({ at: d }) as { at: unknown }).at).toBeInstanceOf(Date);
  });

  it("scans through depth 6, then truncates instead of storing unscanned data", () => {
    const deep = { a: { b: { c: { d: { e: { f: { password: "p" } } } } } } };
    const out = JSON.stringify(redact(deep));
    expect(out).not.toContain('"p"');
    expect(out).toContain("[truncated]");
    const ok = { a: { b: { c: { d: { e: { password: "p" } } } } } };
    expect(JSON.stringify(redact(ok))).toContain("[redacted]");
  });

  it("does not mutate its input", () => {
    const input = { password: "p", n: { token: "t" } };
    redact(input);
    expect(input).toEqual({ password: "p", n: { token: "t" } });
  });
});

describe("diff", () => {
  it("ignores key order inside nested objects", () => {
    expect(diff({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } }).changed).toBe(false);
  });

  it("compares Dates by value", () => {
    expect(diff({ at: new Date(1) }, { at: new Date(1) }).changed).toBe(false);
    expect(diff({ at: new Date(1) }, { at: new Date(2) }).changed).toBe(true);
  });

  it("treats an added or removed key as a change, and undefined as missing", () => {
    expect(diff({ a: 1 }, { a: 1, b: 2 })).toEqual({ before: { b: undefined }, after: { b: 2 }, changed: true });
    expect(diff({ a: 1, b: undefined }, { a: 1 }).changed).toBe(false);
    expect(diff({ a: null }, { a: undefined }).changed).toBe(true);
  });

  it("is order-sensitive for arrays", () => {
    expect(diff({ l: [1, 2] }, { l: [2, 1] }).changed).toBe(true);
  });
});
