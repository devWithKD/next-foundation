import "server-only";
import { after } from "next/server";
import type { Logger } from "../logger";

export type EnqueueOptions = {
  /** Adapters with persistence (queue, pg-boss) dedupe on it. */
  idempotencyKey?: string;
  delaySeconds?: number;
};

/**
 * Where slow, external or scheduled work goes. `J` maps job names to payload
 * types, so `enqueue("email.send", payload)` is checked at compile time.
 */
export interface JobPort<J extends Record<string, unknown> = Record<string, unknown>> {
  enqueue<N extends keyof J & string>(name: N, payload: J[N], opts?: EnqueueOptions): Promise<void>;
}

export type JobHandlers<J extends Record<string, unknown>> = {
  [N in keyof J]: (payload: J[N]) => Promise<void>;
};

/**
 * Runs each job inside `after()`, once the response is sent. No retry, no
 * persistence, no delay: best effort only (decision D10). Work that must not
 * be lost needs a persistent adapter behind the same `JobPort`.
 */
export function createAfterJobs<J extends Record<string, unknown>>(
  handlers: JobHandlers<J>,
  logger: Logger,
  schedule: (task: () => Promise<void>) => void = (task) => after(task),
): JobPort<J> {
  return {
    async enqueue(name, payload, opts) {
      const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
      if (!handler) {
        logger.error({ job: name }, "job_unknown");
        return;
      }
      if (opts?.delaySeconds) {
        // Running it now would be wrong; dropping it silently would be worse.
        throw new Error(`createAfterJobs cannot delay jobs (job "${name}"). Use a persistent JobPort adapter.`);
      }
      schedule(async () => {
        try {
          await handler(payload);
        } catch (err) {
          logger.error({ err, job: name }, "job_failed");
        }
      });
    },
  };
}
