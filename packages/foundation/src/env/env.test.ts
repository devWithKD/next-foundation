import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseEnv } from "./index";

const schema = z.object({
  DATABASE_URL: z.url(),
  POOLED: z.stringbool().default(false),
});

afterEach(() => vi.restoreAllMocks());

describe("parseEnv", () => {
  it("returns parsed, typed values", () => {
    const env = parseEnv(schema, { DATABASE_URL: "postgres://localhost/db", POOLED: "true" });
    expect(env).toEqual({ DATABASE_URL: "postgres://localhost/db", POOLED: true });
  });

  it('reads the string "false" as false (not z.coerce.boolean)', () => {
    const env = parseEnv(schema, { DATABASE_URL: "postgres://localhost/db", POOLED: "false" });
    expect(env.POOLED).toBe(false);
  });

  it("logs the failing fields and throws with the label", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseEnv(schema, { DATABASE_URL: "nope" }, "server env")).toThrow(
      "Invalid server env configuration",
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0]?.[1])).toContain("DATABASE_URL");
  });

  it("defaults the label to 'environment'", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseEnv(schema, {})).toThrow("Invalid environment configuration");
  });
});
