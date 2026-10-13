// Isomorphic: no server-only, so action names and severities can be shared
// with client code (e.g. a filter dropdown on the audit page).

export type AuditSeverity = "low" | "medium" | "high" | "critical";
export type AuditStatus = "success" | "failure";

export type AuditActionDef = {
  name: `${string}.${string}`;
  resource: string;
  severity: AuditSeverity;
};

/**
 * Declares one resource's audit actions with the severity of each.
 *
 *   export const userAudit = defineAuditActions("user", {
 *     created: "medium",
 *     deleted: "critical",
 *   });
 *   userAudit.created // { name: "user.created", resource: "user", severity: "medium" }
 *
 * Severity lives next to the action it describes (decision A3): there is no
 * global pattern table to keep in sync.
 */
export function defineAuditActions<const R extends string, const M extends Record<string, AuditSeverity>>(
  resource: R,
  actions: M,
): { readonly [K in keyof M & string]: AuditActionDef & { name: `${R}.${K}`; resource: R; severity: M[K] } } {
  const out: Record<string, AuditActionDef> = {};
  for (const [key, severity] of Object.entries(actions)) {
    out[key] = { name: `${resource}.${key}`, resource, severity };
  }
  return out as never;
}

/** What `auditEntry` needs from a request. A `RequestContext<A>` satisfies it structurally. */
export type AuditContext = {
  /** null for events with no signed-in actor, e.g. a failed sign-in. */
  actor: { userId: string; label: string; role: string | null } | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuditRecord = {
  actorUserId: string | null;
  actorLabel: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  status: AuditStatus;
  severity: AuditSeverity;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
};

// Decision A4: exact secret key names only. `code` and `hash` are NOT here:
// QR rows have a `code` field, and a hash column is often a public checksum.
const SECRET_KEYS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "secret",
  "apiKey",
  "otp",
  "sessionToken",
  "salt",
];
const SECRET_SET = new Set(SECRET_KEYS.map((k) => k.toLowerCase()));

const MAX_DEPTH = 6;
export const REDACTED = "[redacted]";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Blanks secret values. Redact on WRITE, never on read: a secret that reaches
 * the table is already in every backup and replica.
 *
 * Recurses through plain objects and arrays to depth 6. Dates and other class
 * instances are kept as they are (turning a Date into `{}` would corrupt the
 * row). Anything deeper than 6 levels is replaced by "[truncated]" rather than
 * stored unscanned, because a secret that deep would otherwise slip through.
 */
export function redact(value: unknown, opts: { extraKeys?: readonly string[] } = {}): unknown {
  const secrets = opts.extraKeys?.length
    ? new Set([...SECRET_SET, ...opts.extraKeys.map((k) => k.toLowerCase())])
    : SECRET_SET;

  const walk = (v: unknown, depth: number): unknown => {
    if (Array.isArray(v)) return depth >= MAX_DEPTH ? "[truncated]" : v.map((x) => walk(x, depth + 1));
    if (!isPlainObject(v)) return v;
    if (depth >= MAX_DEPTH) return "[truncated]";
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = secrets.has(k.toLowerCase()) ? REDACTED : walk(x, depth + 1);
    return out;
  };
  return walk(value, 0);
}

/** JSON with sorted keys, so key order never counts as a change. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (isPlainObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(",")}}`;
  }
  // undefined → "undefined" (not valid JSON), so a missing key differs from null.
  return v === undefined ? "undefined" : (JSON.stringify(v) ?? String(v));
}

/**
 * Keeps only what changed. "Changed name from A to B" renders straight from a
 * two-key diff, and the table stays small.
 */
export function diff<T extends Record<string, unknown>>(before: T, after: T): { before: Partial<T>; after: Partial<T>; changed: boolean } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (stableStringify(before[key]) === stableStringify(after[key])) continue;
    b[key] = before[key];
    a[key] = after[key];
  }
  return { before: b as Partial<T>, after: a as Partial<T>, changed: Object.keys(a).length > 0 };
}

/**
 * Builds the row. Callers pass the result straight to their repository, which
 * skips `null`.
 *
 * - `before` and `after` both given = an update: only changed keys are stored,
 *   and an update that changed nothing returns `null`.
 * - One side only = create or delete: the whole snapshot is the event.
 * - Diff first, redact second: a changed password must show up as changed
 *   (`[redacted]` → `[redacted]`), which a diff of redacted values would hide.
 * - `meta` is redacted too.
 */
export function auditEntry(
  ctx: AuditContext,
  e: {
    action: AuditActionDef;
    resourceId: string | null;
    status?: AuditStatus;
    /** Overrides the severity declared on the action (e.g. a failure that is worse than usual). */
    severity?: AuditSeverity;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    meta?: Record<string, unknown> | null;
  },
): AuditRecord | null {
  let before = e.before ?? null;
  let after = e.after ?? null;

  if (before && after) {
    const d = diff(before, after);
    if (!d.changed) return null;
    before = d.before;
    after = d.after;
  }

  return {
    actorUserId: ctx.actor?.userId ?? null,
    actorLabel: ctx.actor?.label ?? null,
    actorRole: ctx.actor?.role ?? null,
    action: e.action.name,
    resourceType: e.action.resource,
    resourceId: e.resourceId,
    status: e.status ?? "success",
    severity: e.severity ?? e.action.severity,
    before: before ? (redact(before) as Record<string, unknown>) : null,
    after: after ? (redact(after) as Record<string, unknown>) : null,
    meta: e.meta ? (redact(e.meta) as Record<string, unknown>) : null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  };
}
