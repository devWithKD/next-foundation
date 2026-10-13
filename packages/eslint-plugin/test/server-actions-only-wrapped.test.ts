import rule from "../src/rules/server-actions-only-wrapped.js";
import { file, tester } from "./helpers.js";

const f = file("app/orders/_actions.ts");
const head = '"use server";\nimport { createAction } from "@/server/adapters";\n';

tester().run("server-actions-only-wrapped", rule, {
  valid: [
    { filename: f, code: `${head}export const create = createAction({ name: "x" });` },
    { filename: f, code: `${head}export const a = createAction({});\nexport const b = createAction({});` },
    { filename: f, code: `${head}export type Input = { a: 1 };\nexport interface Out { b: 2 }\nexport const a = createAction({});` },
    { filename: f, code: `${head}export type { Foo } from "./types.js";\nexport { type Bar };` },
    { filename: f, code: `${head}const helper = () => 1;\nfunction other() {}\nexport const a = createAction({ h: helper });` }, // not exported
    { filename: f, code: '"use server";\nexport const a = safeAction({});', options: [{ callees: ["safeAction"] }] },
    // Only "use server" files are checked.
    { filename: file("app/orders/page.tsx"), code: "export default function Page() {}\nexport const x = 1;" },
    { filename: f, code: "export function notAnAction() {}" },
  ],
  invalid: [
    { filename: f, code: `${head}export async function create() {}`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export default createAction({});`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export * from "./other.js";`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}const a = createAction({});\nexport { a };`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export { a } from "./other.js";`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export const limit = 5;`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export const a = somethingElse({});`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export let a = createAction({});`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export class A {}`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export enum E { A }`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: `${head}export const ok = createAction({}), bad = 5;`, errors: [{ messageId: "notWrapped" }] },
    { filename: f, code: '"use server";\nexport const a = createAction({});', options: [{ callees: ["safeAction"] }], errors: [{ messageId: "notWrapped" }] },
  ],
});
