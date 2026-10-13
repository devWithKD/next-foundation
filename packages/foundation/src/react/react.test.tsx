// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineListQuery } from "../list";
import type { ActionResult } from "../result";
import { ApiError, applyFieldErrors, fetchApi, useActionMutation, useListState } from ".";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchApi", () => {
  const stub = (impl: (input: string, init?: RequestInit) => Promise<Response>) => {
    const fn = vi.fn(impl);
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  it("unwraps { data }", async () => {
    stub(async () => json({ data: { id: 1 } }));
    expect(await fetchApi<{ id: number }>("/api/x")).toEqual({ id: 1 });
  });

  it("sends JSON headers for string bodies, without overriding the caller's", async () => {
    const fn = stub(async () => json({ data: null }));
    await fetchApi("/api/x", { method: "POST", body: "{}" });
    await fetchApi("/api/x", { method: "POST", body: "a=b", headers: { "content-type": "text/plain" } });
    const h = (i: number) => new Headers(fn.mock.calls[i]?.[1]?.headers);
    expect(h(0).get("content-type")).toBe("application/json");
    expect(h(0).get("accept")).toBe("application/json");
    expect(h(1).get("content-type")).toBe("text/plain");
  });

  it("throws ApiError with code and fieldErrors from { error }", async () => {
    stub(async () => json({ error: { code: "validation", message: "Validation failed", fieldErrors: { name: ["Required"] } } }, 422));
    const err = await fetchApi("/api/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "validation", message: "Validation failed", fieldErrors: { name: ["Required"] } });
  });

  it("turns a network failure into ApiError(0, network)", async () => {
    stub(async () => Promise.reject(new TypeError("Failed to fetch")));
    const err = await fetchApi("/api/x").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, code: "network", message: "Network error" });
    expect((err as ApiError).cause).toBeInstanceOf(TypeError);
  });

  it("lets an aborted request through untouched", async () => {
    stub(async () => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(fetchApi("/api/x")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports unreadable and unexpected bodies", async () => {
    stub(async () => new Response("<html>502</html>", { status: 502 }));
    expect(await fetchApi("/a").catch((e: unknown) => e)).toMatchObject({ status: 502, code: "bad_response" });
    stub(async () => json({ nope: 1 }, 500));
    expect(await fetchApi("/a").catch((e: unknown) => e)).toMatchObject({ status: 500, code: "http_500" });
    stub(async () => json({ nope: 1 }, 200));
    expect(await fetchApi("/a").catch((e: unknown) => e)).toMatchObject({ status: 200, code: "bad_response" });
  });

  it("returns undefined for 204", async () => {
    stub(async () => new Response(null, { status: 204 }));
    expect(await fetchApi("/a")).toBeUndefined();
  });
});

describe("applyFieldErrors", () => {
  it("sets the first message per field and reports whether any applied", () => {
    const setError = vi.fn();
    expect(applyFieldErrors(setError, { name: ["Required", "Too short"], email: ["Invalid"] })).toBe(true);
    expect(setError.mock.calls).toEqual([
      ["name", { type: "server", message: "Required" }],
      ["email", { type: "server", message: "Invalid" }],
    ]);
  });

  it("returns false for nothing to apply", () => {
    const setError = vi.fn();
    expect(applyFieldErrors(setError, undefined)).toBe(false);
    expect(applyFieldErrors(setError, { a: [] })).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("accepts a setError typed to a form's field names", () => {
    type Field = "name" | "email";
    const rhfLike = (_name: Field | "root", _e: { type?: string; message?: string }, _o?: { shouldFocus?: boolean }) => {};
    applyFieldErrors(rhfLike, { name: ["x"] });
  });
});

describe("useListState", () => {
  const schema = defineListQuery({
    filters: { q: z.string().optional(), status: z.enum(["open", "closed"]).optional() },
    sortable: ["title", "createdAt"],
    defaultSort: [{ field: "createdAt", dir: "desc" }],
  });

  beforeEach(() => vi.useFakeTimers());

  it("starts at exactly schema.parse({}) (the RSC prefetch params)", () => {
    const { result } = renderHook(() => useListState(schema));
    expect(result.current.params).toEqual(schema.parse({}));
  });

  it("debounces text filters but updates the draft at once", () => {
    const { result } = renderHook(() => useListState(schema, { debounceMs: 300 }));
    act(() => result.current.setFilter("q", "ab"));
    expect(result.current.draft.q).toBe("ab");
    expect(result.current.params.q).toBeUndefined();
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current.params.q).toBeUndefined();
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.params.q).toBe("ab");
  });

  it("debounces exactly the keys it is told are text inputs", () => {
    const { result } = renderHook(() => useListState(schema, { debounceMs: 100, debouncedKeys: ["status"] }));
    act(() => result.current.setFilter("q", "x"));
    expect(result.current.params.q).toBe("x");
    act(() => result.current.setFilter("status", "open"));
    expect(result.current.params.status).toBeUndefined();
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.params.status).toBe("open");
  });

  it("only the last keystroke in a burst is applied", () => {
    const { result } = renderHook(() => useListState(schema, { debounceMs: 300 }));
    act(() => result.current.setFilter("q", "a"));
    act(() => void vi.advanceTimersByTime(200));
    act(() => result.current.setFilter("q", "ab"));
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current.params.q).toBeUndefined();
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.params.q).toBe("ab");
  });

  it("applies non-text filters, sort and page size immediately and returns to page 1", () => {
    const { result } = renderHook(() => useListState(schema));
    act(() => result.current.setPage(4));
    expect(result.current.params.page).toBe(4);
    act(() => result.current.setFilter("status", "open"));
    expect(result.current.params).toMatchObject({ status: "open", page: 1 });
    act(() => result.current.setPage(3));
    act(() => result.current.setSort([{ field: "title", dir: "asc" }]));
    expect(result.current.params).toMatchObject({ sort: [{ field: "title", dir: "asc" }], page: 1 });
    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(50));
    expect(result.current.params).toMatchObject({ pageSize: 50, page: 1 });
  });

  it("resets the page when a text filter is committed, not before", () => {
    const { result } = renderHook(() => useListState(schema, { debounceMs: 100 }));
    act(() => result.current.setPage(3));
    act(() => result.current.setFilter("q", "x"));
    expect(result.current.params.page).toBe(3);
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.params).toMatchObject({ q: "x", page: 1 });
  });

  it("clearing a filter removes it", () => {
    const { result } = renderHook(() => useListState(schema));
    act(() => result.current.setFilter("status", "open"));
    act(() => result.current.setFilter("status", undefined));
    expect(result.current.params.status).toBeUndefined();
  });

  it("a page change flushes nothing it shouldn't: a pending text filter still lands", () => {
    const { result } = renderHook(() => useListState(schema, { debounceMs: 100 }));
    act(() => result.current.setFilter("q", "x"));
    act(() => result.current.setPage(2));
    expect(result.current.params).toMatchObject({ q: "x", page: 2 });
  });

  it("reset returns to the defaults", () => {
    const { result } = renderHook(() => useListState(schema));
    act(() => result.current.setFilter("status", "open"));
    act(() => result.current.reset());
    expect(result.current.params).toEqual(schema.parse({}));
  });

  it("keeps the last good params when the schema rejects the input", () => {
    const { result } = renderHook(() => useListState(schema));
    act(() => result.current.setFilter("status", "open"));
    act(() => result.current.setFilter("status", "bogus"));
    expect(result.current.params.status).toBe("open");
  });

  it("does not fire a debounce timer after unmount", () => {
    const { result, unmount } = renderHook(() => useListState(schema, { debounceMs: 100 }));
    act(() => result.current.setFilter("q", "x"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useActionMutation", () => {
  function setup<O>(action: (i: string) => Promise<ActionResult<O>>, opts?: Parameters<typeof useActionMutation<string, O>>[1]) {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useActionMutation(action, opts), { wrapper });
    return { ...hook, invalidate };
  }

  it("resolves with data and invalidates every key before onSuccess", async () => {
    const order: string[] = [];
    const onSuccess = vi.fn(() => void order.push("onSuccess"));
    const { result, invalidate } = setup(async () => ({ ok: true as const, data: 7 }), {
      invalidate: [["users"], ["roles", "list"]],
      onSuccess,
    });
    invalidate.mockImplementation(async () => {
      await Promise.resolve();
      order.push("invalidated");
    });
    await act(async () => {
      expect(await result.current.mutateAsync("x")).toBe(7);
    });
    expect(invalidate.mock.calls.map((c) => c[0])).toEqual([{ queryKey: ["users"] }, { queryKey: ["roles", "list"] }]);
    expect(order).toEqual(["invalidated", "invalidated", "onSuccess"]);
    expect(onSuccess).toHaveBeenCalledWith(7);
  });

  it("throws ApiError(null, payload) on { ok: false }, keeping field errors", async () => {
    const onSuccess = vi.fn();
    const { result, invalidate } = setup(
      async () => ({ ok: false as const, code: "validation", message: "Validation failed", fieldErrors: { name: ["Required"] } }),
      { invalidate: [["users"]], onSuccess },
    );
    const err = await act(async () => result.current.mutateAsync("x").catch((e: unknown) => e));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: null, code: "validation", fieldErrors: { name: ["Required"] } });
    expect((err as ApiError).payload).not.toHaveProperty("ok");
    await waitFor(() => expect(result.current.error).toBe(err));
    expect(invalidate).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("maps a rejected action call to a network ApiError", async () => {
    const { result } = setup(async () => Promise.reject(new Error("fetch failed")));
    const err = await act(async () => result.current.mutateAsync("x").catch((e: unknown) => e));
    expect(err).toMatchObject({ status: 0, code: "network" });
  });
});
