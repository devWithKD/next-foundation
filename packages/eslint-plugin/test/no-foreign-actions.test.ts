import rule from "../src/rules/no-foreign-actions.js";
import { FIXTURES, file, settings, tester } from "./helpers.js";

// "@/orders/" is a more specific alias than "@/": the longest prefix must win.
const nested = { foundation: { ...settings.foundation, alias: { "@/": `${FIXTURES}/`, "@/orders/": `${FIXTURES}/app/orders/` } } };

tester().run("no-foreign-actions", rule, {
  valid: [
    { filename: file("app/orders/page.tsx"), code: 'import { create } from "@/orders/_actions";', settings: nested },
    { filename: file("app/orders/page.tsx"), code: 'import { create } from "./_actions.js";' },
    { filename: file("app/orders/page.tsx"), code: 'import { create } from "./_actions/create.js";' },
    { filename: file("app/orders/[id]/page.tsx"), code: 'import { create } from "../_actions.js";' }, // nested routes are inside the folder
    { filename: file("app/orders/page.tsx"), code: 'import { create } from "@/app/orders/_actions";' }, // via alias
    { filename: file("app/orders/_actions/create.ts"), code: 'import { helper } from "./helper.js";' },
    { filename: file("app/billing/page.tsx"), code: 'import type { Input } from "@/app/orders/_actions";' }, // erased at build
    { filename: file("app/billing/page.tsx"), code: 'import { type Input } from "@/app/orders/_actions";' },
    { filename: file("app/billing/page.tsx"), code: 'import { z } from "zod";\nimport { x } from "./_components/x.js";' },
  ],
  invalid: [
    { filename: file("app/billing/page.tsx"), code: 'import { create } from "@/orders/_actions";', settings: nested, errors: [{ messageId: "foreign" }] },
    { filename: file("app/billing/page.tsx"), code: 'import { create } from "@/app/orders/_actions";', errors: [{ messageId: "foreign" }] },
    { filename: file("app/billing/page.tsx"), code: 'import { create } from "../orders/_actions/create.js";', errors: [{ messageId: "foreign" }] },
    { filename: file("components/button.tsx"), code: 'import { create } from "@/app/orders/_actions";', errors: [{ messageId: "foreign" }] },
    { filename: file("app/billing/page.tsx"), code: 'export { create } from "@/app/orders/_actions";', errors: [{ messageId: "foreign" }] },
    { filename: file("app/billing/page.tsx"), code: 'export * from "@/app/orders/_actions";', errors: [{ messageId: "foreign" }] },
    { filename: file("app/billing/page.tsx"), code: 'const m = await import("@/app/orders/_actions");', errors: [{ messageId: "foreign" }] },
    { filename: file("app/billing/page.tsx"), code: 'import { create } from "@/app/orders/_actions.ts";', errors: [{ messageId: "foreign" }] },
    // A sibling folder with a shared prefix is not "inside" the route folder.
    { filename: file("app/orders-archive/page.tsx"), code: 'import { create } from "@/app/orders/_actions";', errors: [{ messageId: "foreign" }] },
  ],
});
