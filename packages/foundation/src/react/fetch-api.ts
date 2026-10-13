"use client";

import { ApiError } from "./api-error";
import type { ApiFailure, ApiSuccess, ErrorPayload } from "../result";

function isFailure(body: unknown): body is ApiFailure {
  return typeof body === "object" && body !== null && "error" in body && typeof (body as ApiFailure).error?.code === "string";
}

/**
 * Calls a route handler built with `createRoute` and unwraps `{ data }`.
 * Every failure becomes an `ApiError`: `{ error }` bodies keep the server's
 * code and field errors, a dropped connection is `ApiError(0, network)`, and
 * anything unreadable is `bad_response`.
 */
export async function fetchApi<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (typeof init?.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");

  let res: Response;
  try {
    res = await fetch(input, { ...init, headers });
  } catch (cause) {
    // An aborted request is the caller's doing (TanStack cancels stale queries): let it through.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, { code: "network", message: "Network error" }, { cause });
  }

  if (res.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    const payload: ErrorPayload = { code: "bad_response", message: `Unexpected response (${res.status})` };
    throw new ApiError(res.status, payload, { cause });
  }

  if (isFailure(body)) throw new ApiError(res.status, body.error);
  if (!res.ok || typeof body !== "object" || body === null || !("data" in body)) {
    throw new ApiError(res.status, { code: res.ok ? "bad_response" : `http_${res.status}`, message: `Unexpected response (${res.status})` });
  }
  return (body as ApiSuccess<T>).data;
}
