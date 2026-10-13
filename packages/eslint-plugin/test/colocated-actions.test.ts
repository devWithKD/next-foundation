import rule from "../src/rules/colocated-actions.js";
import { file, tester } from "./helpers.js";

const USE_SERVER = '"use server";\nexport const x = 1;';

tester().run("colocated-actions", rule, {
  valid: [
    { filename: file("app/orders/_actions.ts"), code: USE_SERVER },
    { filename: file("app/orders/[id]/_actions/create.ts"), code: USE_SERVER },
    { filename: file("app/with-js/_actions.tsx"), code: USE_SERVER }, // a .js page counts
    { filename: file("app/orders/helpers.ts"), code: "export const x = 1;" },
    { filename: file("app/noentry/_data.ts"), code: '"use client";\nexport const x = 1;' },
    { filename: file("app/orders/_actions.ts"), code: '"use strict";\n"use server";\nexport const x = 1;' },
    // Outside srcDir the rule doesn't apply.
    { filename: `${process.cwd()}/scripts/seed.actions.ts`, code: USE_SERVER },
  ],
  invalid: [
    { filename: file("app/orders/actions.ts"), code: USE_SERVER, errors: [{ messageId: "wrongName" }] },
    { filename: file("app/orders/_actions/deep/x.ts"), code: USE_SERVER, errors: [{ messageId: "wrongName" }] },
    { filename: file("app/noentry/_actions.ts"), code: USE_SERVER, errors: [{ messageId: "noRouteEntry" }] },
    { filename: file("app/missing-folder/_actions/x.ts"), code: USE_SERVER, errors: [{ messageId: "noRouteEntry" }] },
    { filename: file("modules/user/user.actions.ts"), code: "export const x = 1;", errors: [{ messageId: "legacyName" }] },
    { filename: file("modules/user/user.action.tsx"), code: "export const x = 1;", errors: [{ messageId: "legacyName" }] },
    { filename: file("server/do.ts"), code: USE_SERVER, errors: [{ messageId: "outsideApp" }] },
    {
      filename: file("app/orders/page.tsx"),
      code: 'export default async function Page() {\n  async function save() {\n    "use server";\n  }\n}',
      errors: [{ messageId: "inline", line: 2 }],
    },
    {
      filename: file("app/orders/page.tsx"),
      code: 'export const save = async () => {\n  "use server";\n};',
      errors: [{ messageId: "inline" }],
    },
    {
      filename: file("app/orders/page.tsx"),
      code: 'export const save = async function () {\n  "use server";\n};',
      errors: [{ messageId: "inline" }],
    },
    {
      // Both problems are reported: a legacy name AND a wrong place.
      filename: file("app/orders/orders.actions.ts"),
      code: USE_SERVER,
      errors: [{ messageId: "legacyName" }, { messageId: "wrongName" }],
    },
  ],
});
