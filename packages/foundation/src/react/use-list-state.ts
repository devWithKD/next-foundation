"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import type { SortSpec } from "../list";

type Draft = Record<string, unknown>;

const DEFAULT_DEBOUNCED_KEYS = ["q"] as const;

/**
 * Table state for one list query, built from the same `defineListQuery`
 * schema the server uses. With no input it equals `schema.parse({})`, which is
 * exactly what the RSC prefetch used, so the first render finds the hydrated
 * cache instead of refetching.
 *
 * - `params` is what you put in the query key. Filters named in `debouncedKeys`
 *   (the text inputs; default just `q`) lag typing by `debounceMs`. Everything
 *   else (selects, sort, paging) applies at once. A string value can't tell a
 *   text box from a dropdown, so the caller says which keys are text.
 * - `draft` is the un-debounced input, for controlled text fields.
 * - Any filter, sort or page-size change goes back to page 1.
 */
export function useListState<S extends z.ZodType>(schema: S, opts: { debounceMs?: number; debouncedKeys?: readonly string[] } = {}) {
  const debounceMs = opts.debounceMs ?? 300;
  const debouncedKeys = opts.debouncedKeys ?? DEFAULT_DEBOUNCED_KEYS;
  const [draft, setDraft] = useState<Draft>({});
  const [committed, setCommitted] = useState<Draft>({});
  const draftRef = useRef<Draft>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const apply = useCallback(
    (next: Draft, immediate: boolean) => {
      draftRef.current = next;
      setDraft(next);
      clearTimeout(timer.current);
      if (immediate) setCommitted(next);
      else timer.current = setTimeout(() => setCommitted(draftRef.current), debounceMs);
    },
    [debounceMs],
  );

  // A value the schema rejects (a stale filter, say) keeps the last good params
  // rather than throwing during render.
  const lastGood = useRef<z.output<S> | undefined>(undefined);
  const params = useMemo(() => {
    const parsed = schema.safeParse(committed);
    if (parsed.success) lastGood.current = parsed.data as z.output<S>;
    return (parsed.success ? parsed.data : (lastGood.current ?? schema.parse({}))) as z.output<S>;
  }, [schema, committed]);

  return {
    params,
    draft,
    setPage: useCallback((page: number) => apply({ ...draftRef.current, page }, true), [apply]),
    setPageSize: useCallback((size: number) => apply({ ...draftRef.current, pageSize: size, page: 1 }, true), [apply]),
    setSort: useCallback((sort: SortSpec[]) => apply({ ...draftRef.current, sort, page: 1 }, true), [apply]),
    setFilter: useCallback(
      (key: string, value: unknown) => {
        const next: Draft = { ...draftRef.current, page: 1 };
        if (value === undefined || value === null || value === "") delete next[key];
        else next[key] = value;
        apply(next, !debouncedKeys.includes(key));
      },
      [apply, debouncedKeys],
    ),
    reset: useCallback(() => apply({}, true), [apply]),
  };
}
