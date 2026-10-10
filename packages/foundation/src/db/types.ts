import "server-only";
import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// `any` for the relations generic, and ONLY here: Drizzle's database type is
// parameterised by the project's own relations, which the package can't know.
// Every project database (and every transaction, which extends it) is assignable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabase = PgAsyncDatabase<PgQueryResultHKT, any>;

/** Something you can write through: the database itself, or a transaction (which extends it). */
export type WriteExecutor = AnyDatabase;

/** Something you can only read through. Typing read paths with this makes writing through them a compile error. */
export type ReadExecutor = Pick<AnyDatabase, "select" | "execute">;
