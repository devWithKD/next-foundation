"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { ApiError } from "./api-error";
import type { ActionResult } from "../result";

/**
 * Wraps a server action (which returns `ActionResult`, never throws) as a
 * TanStack mutation that THROWS `ApiError` on `{ ok: false }`, so `onError`,
 * `mutateAsync().catch` and `error` all work the usual way.
 *
 * On success every key in `invalidate` is invalidated (and awaited) before
 * `onSuccess` runs, so the callback sees fresh data.
 */
export function useActionMutation<I, O>(
  action: (input: I) => Promise<ActionResult<O>>,
  opts: { invalidate?: readonly (readonly unknown[])[]; onSuccess?: (data: O) => void } = {},
): UseMutationResult<O, ApiError, I> {
  const qc = useQueryClient();
  return useMutation<O, ApiError, I>({
    mutationFn: async (input) => {
      let result: ActionResult<O>;
      try {
        result = await action(input);
      } catch (cause) {
        // The call itself failed (offline, deploy skew), not the action.
        throw new ApiError(0, { code: "network", message: "Network error" }, { cause });
      }
      if (!result.ok) {
        const { ok: _ok, ...payload } = result;
        throw new ApiError(null, payload);
      }
      return result.data;
    },
    onSuccess: async (data) => {
      await Promise.all((opts.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
      opts.onSuccess?.(data);
    },
  });
}
