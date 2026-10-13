# audit

Builds audit rows. It owns no table and no repository: each project defines
its own, because the table references the project's user table.

```ts
import { defineAuditActions, auditEntry } from "@devwithkd/foundation/audit";

export const userAudit = defineAuditActions("user", { created: "medium", deleted: "critical" });

// In a service, inside the business transaction:
await auditRepository.record(
  auditEntry(ctx, { action: userAudit.created, resourceId: row.id, after: toAuditShape(row) }),
  tx,
);
```

## Rules

- **Severity is declared per action** (`defineAuditActions`). No regex table.
- Updates pass `before` and `after`; only changed keys are stored, and a no-op
  update returns `null` (the repository skips `null`).
- `redact` blanks exact secret key names only (case-insensitive). `code` and
  `hash` are deliberately not on the list.
- **Domain events** are recorded with the business `tx`, so the log can't
  describe something that rolled back. **Auth hooks and denials** have no
  transaction: write them with the base db inside `after()`.
- No `org_id`. A project that needs a scope column adds its own.
- `RequestContext` from `@devwithkd/foundation/context` satisfies `AuditContext`,
  so IP, user agent and request id are filled for free.

## Canonical table (copy into the project's `audit.sql.ts`)

```ts
export const auditSeverity = pgEnum("audit_severity", ["low", "medium", "high", "critical"]);
export const auditStatus = pgEnum("audit_status", ["success", "failure"]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id").references(() => user.id),
    actorLabel: text("actor_label"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    status: auditStatus("status").notNull().default("success"),
    severity: auditSeverity("severity").notNull().default("low"),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_time_idx").on(t.occurredAt.desc()),
    index("audit_resource_idx").on(t.resourceType, t.resourceId, t.occurredAt.desc()),
    index("audit_actor_idx").on(t.actorUserId, t.occurredAt.desc()),
  ],
);
```

The repository is a thin insert of `AuditRecord`s (`record(entry | null, tx)`
and `recordMany`), plus a batched retention sweep.

## The audit log is the source of "who" and "when"

Business tables carry `created_at` and (if soft-deletable) `deleted_at`, and
nothing else about history: no `created_by`, `updated_by`, `updated_at`.
That makes the log load-bearing:

- Every command that inserts, changes, soft-deletes or restores a row writes
  `<resource>.created` / `.updated` / `.deleted` / `.restored` (plus domain
  verbs) **in the same transaction**, with `resourceId` = the row id. Test it.
- "Created by" = the first `<resource>.created` row; "last activity" = the
  latest row. Put both as SQL expressions (correlated subqueries on
  `audit_resource_idx`) in the project's `audit.sql.ts`, so read models can
  use them.
- **Retention never deletes entity events.** Sweep only auth and
  authorization noise (resource types `auth`, `authz`) older than a set age.
- A column the product filters or branches on is domain data, not audit:
  keep it, named for its meaning (`received_by_id`, `assigned_to_id`).
