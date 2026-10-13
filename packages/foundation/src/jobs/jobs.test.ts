import { describe, expect, it, vi } from "vitest";
import { fakeLogger } from "../../test/fakes";
import { createAfterJobs } from ".";

type Jobs = { "email.send": { to: string }; "report.build": { id: number } };

function setup() {
  const tasks: (() => Promise<void>)[] = [];
  const { logger, calls } = fakeLogger();
  const handlers = {
    "email.send": vi.fn(async (_p: { to: string }) => {}),
    "report.build": vi.fn(async (_p: { id: number }) => {
      throw new Error("boom");
    }),
  };
  const jobs = createAfterJobs<Jobs>(handlers, logger, (t) => void tasks.push(t));
  const flush = () => Promise.all(tasks.splice(0).map((t) => t()));
  return { jobs, handlers, calls, flush };
}

describe("createAfterJobs", () => {
  it("defers the right handler until after the response", async () => {
    const { jobs, handlers, flush } = setup();
    await jobs.enqueue("email.send", { to: "a@b.c" });
    expect(handlers["email.send"]).not.toHaveBeenCalled();
    await flush();
    expect(handlers["email.send"]).toHaveBeenCalledWith({ to: "a@b.c" });
    expect(handlers["report.build"]).not.toHaveBeenCalled();
  });

  it("logs a failing handler instead of throwing", async () => {
    const { jobs, calls, flush } = setup();
    await jobs.enqueue("report.build", { id: 1 });
    await flush();
    expect(calls).toMatchObject([{ level: "error", msg: "job_failed", fields: { job: "report.build" } }]);
  });

  it("logs an unknown job name", async () => {
    const { jobs, calls, flush } = setup();
    // Only reachable by bypassing the types (e.g. a name from config).
    await (jobs as { enqueue(n: string, p: unknown): Promise<void> }).enqueue("nope", {});
    await flush();
    expect(calls).toMatchObject([{ level: "error", msg: "job_unknown", fields: { job: "nope" } }]);
  });

  it("does not resolve inherited names as handlers", async () => {
    const { jobs, calls } = setup();
    await (jobs as { enqueue(n: string, p: unknown): Promise<void> }).enqueue("toString", {});
    expect(calls).toMatchObject([{ msg: "job_unknown" }]);
  });

  it("refuses delayed jobs rather than running them early", async () => {
    const { jobs, flush, handlers } = setup();
    await expect(jobs.enqueue("email.send", { to: "x" }, { delaySeconds: 60 })).rejects.toThrow(/cannot delay/);
    await flush();
    expect(handlers["email.send"]).not.toHaveBeenCalled();
  });

  it("type-checks names and payloads", () => {
    const { jobs } = setup();
    // @ts-expect-error unknown job name
    void jobs.enqueue("nope", {}).catch(() => {});
    // @ts-expect-error wrong payload type
    void jobs.enqueue("report.build", { id: "1" }).catch(() => {});
  });
});
