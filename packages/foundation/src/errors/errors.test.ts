import { describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  isAppError,
} from "./index";

describe("errors", () => {
  it.each([
    [new NotFoundError("x"), "not_found", 404],
    [new ForbiddenError("x"), "forbidden", 403],
    [new ConflictError("x"), "conflict", 409],
    [new RateLimitError("x"), "rate_limit", 429],
    [new UnauthorizedError(), "unauthorized", 401],
    [new ValidationError({ a: ["bad"] }), "validation", 422],
  ])("%s carries its code and status", (err, code, status) => {
    expect(err.code).toBe(code);
    expect(err.httpStatus).toBe(status);
    expect(err.expose).toBe(true);
  });

  it("sets name from the subclass", () => {
    expect(new ConflictError("x").name).toBe("ConflictError");
  });

  it("keeps meta, and ValidationError keeps fieldErrors", () => {
    expect(new ForbiddenError("no", { permission: "so:block_qty" }).meta).toEqual({
      permission: "so:block_qty",
    });
    expect(new ValidationError({ title: ["too short"] }).fieldErrors).toEqual({
      title: ["too short"],
    });
  });

  it("UnauthorizedError has a default message", () => {
    expect(new UnauthorizedError().message).toBe("You need to sign in");
  });

  it("isAppError narrows AppErrors only", () => {
    expect(isAppError(new NotFoundError("x"))).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError("nope")).toBe(false);
    expect(new NotFoundError("x")).toBeInstanceOf(AppError);
  });
});
