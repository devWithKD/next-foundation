import {
  QueryClient,
  defaultShouldDehydrateMutation,
  defaultShouldDehydrateQuery,
  environmentManager,
} from "@tanstack/react-query";

/**
 * Query keys for one module, shaped so invalidating a prefix does the right thing:
 *   invalidateQueries({ queryKey: keys.lists })  → every list, any params
 *   invalidateQueries({ queryKey: keys.all })    → everything for the module
 * The same factory is used by the RSC prefetch and the client hook, so their
 * keys are identical for identical params.
 */
export function createQueryKeys<const M extends string>(module: M) {
  return {
    all: [module] as const,
    lists: [module, "list"] as const,
    list: <P>(params: P) => [module, "list", params] as const,
    details: [module, "detail"] as const,
    detail: (id: string) => [module, "detail", id] as const,
    options: <P>(params: P) => [module, "options", params] as const,
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Without a stale time the client refetches immediately after hydration
        // and the RSC prefetch is wasted.
        staleTime: 30_000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
        shouldDehydrateMutation: (mutation) =>
          defaultShouldDehydrateMutation(mutation) || mutation.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** Server: a fresh client per call (never share between requests). Browser: one singleton. */
export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
