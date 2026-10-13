# jobs

`JobPort`: where slow, external or scheduled work goes, behind one interface so
the transport can change.

```ts
import { createAfterJobs, type JobPort } from "@devwithkd/foundation/jobs";

type Jobs = { "email.send": { to: string }; "report.build": { id: string } };

export const jobs: JobPort<Jobs> = createAfterJobs<Jobs>(
  { "email.send": sendEmail, "report.build": buildReport },
  logger,
);

await jobs.enqueue("email.send", { to: "a@b.c" }); // names and payloads are type-checked
```

- `createAfterJobs` runs the handler inside Next's `after()`: **best effort**. No retry, no persistence, no delay (`delaySeconds` throws rather than run early). A failing handler is logged, never thrown into the request.
- Anything that must not be lost needs a persistent adapter (pg-boss, a queue, a worker) implementing the same `JobPort`.
- Not for the ledger or other transactional work: those commit with the request's transaction.
