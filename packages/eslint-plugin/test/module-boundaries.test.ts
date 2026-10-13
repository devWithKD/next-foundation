import rule from "../src/rules/module-boundaries.js";
import { file, tester } from "./helpers.js";

const err = (messageId: string) => [{ messageId }];

tester().run("module-boundaries", rule, {
  valid: [
    // Allowed by default: a service reaches another module's service, contract, keys.
    { filename: file("modules/user/user.service.ts"), code: 'import { roleService } from "@/modules/role/role.service";' },
    { filename: file("modules/user/user.service.ts"), code: 'import { roleSchema } from "@/modules/role/role.contract";' },
    { filename: file("modules/user/user.service.ts"), code: 'import { roleKeys } from "../role/role.keys.js";' },
    // sql → sql (foreign keys); queries → sql; repository → sql (precondition reads).
    { filename: file("modules/user/user.sql.ts"), code: 'import { role } from "@/modules/role/role.sql";' },
    { filename: file("modules/user/user.queries.ts"), code: 'import { role } from "@/modules/role/role.sql";' },
    { filename: file("modules/user/user.repository.ts"), code: 'import { role } from "@/modules/role/role.sql";' },
    // Anything inside the same module.
    { filename: file("modules/user/user.service.ts"), code: 'import { UserRepository } from "./user.repository.js";\nimport { x } from "@/modules/user/user.domain";' },
    // Type imports are erased.
    { filename: file("modules/user/user.service.ts"), code: 'import type { Role } from "@/modules/role/role.repository";' },
    { filename: file("modules/user/user.service.ts"), code: 'import { type Role } from "@/modules/role/role.repository";' },
    { filename: file("modules/user/user.service.ts"), code: 'export type { Role } from "@/modules/role/role.repository";' },
    // Packages and files outside modules.
    { filename: file("modules/user/user.repository.ts"), code: 'import { eq } from "drizzle-orm";\nimport { writeDb } from "@/server/db/client";' },
    // Tests may import anything.
    { filename: file("modules/user/user.service.test.ts"), code: 'import { RoleRepository } from "@/modules/role/role.repository";' },
    // The composition root may import modules.
    { filename: file("server/services.ts"), code: 'import { UserRepository } from "@/modules/user/user.repository";' },
    { filename: file("server/db/schema.ts"), code: 'export * from "@/modules/user/user.sql";' },
    { filename: file("server/auth/config.server.ts"), code: 'import { user } from "@/modules/user/user.sql";' },
    { filename: file("server/other.ts"), code: 'import type { UserService } from "@/modules/user/user.service";' },
    // Not in modules or server: this rule has nothing to say.
    { filename: file("app/orders/page.tsx"), code: 'import { UserRepository } from "@/modules/user/user.repository";' },
    // Options: widen a suffix.
    {
      filename: file("modules/user/user.service.ts"),
      code: 'import { x } from "@/modules/role/role.domain";',
      options: [{ allow: { service: ["service", "domain"] } }],
    },
    { filename: file("server/custom.ts"), code: 'import { x } from "@/modules/user/user.service";', options: [{ serverAllow: [`${"test/fixtures/src"}/server/custom.ts`] }] },
  ],
  invalid: [
    { filename: file("modules/user/user.service.ts"), code: 'import { RoleRepository } from "@/modules/role/role.repository";', errors: err("foreignModule") },
    { filename: file("modules/user/user.service.ts"), code: 'import { role } from "@/modules/role/role.sql";', errors: err("foreignModule") },
    { filename: file("modules/user/user.service.ts"), code: 'import { RoleRepository } from "../role/role.repository.js";', errors: err("foreignModule") },
    { filename: file("modules/user/user.repository.ts"), code: 'import { roleService } from "@/modules/role/role.service";', errors: err("foreignModule") },
    { filename: file("modules/user/user.queries.ts"), code: 'import { roleService } from "@/modules/role/role.service";', errors: err("foreignModule") },
    { filename: file("modules/user/user.sql.ts"), code: 'import { roleSchema } from "@/modules/role/role.contract";', errors: err("foreignModule") },
    // A bare module import has no suffix, so it isn't on any allow list.
    { filename: file("modules/user/user.service.ts"), code: 'import { x } from "@/modules/role";', errors: err("foreignModule") },
    { filename: file("modules/user/user.service.ts"), code: 'export { x } from "@/modules/role/role.repository";', errors: err("foreignModule") },
    { filename: file("modules/user/user.service.ts"), code: 'const m = await import("@/modules/role/role.repository");', errors: err("foreignModule") },
    // The server dir outside the composition root.
    { filename: file("server/other.ts"), code: 'import { UserService } from "@/modules/user/user.service";', errors: err("serverImportsModule") },
    { filename: file("server/db/client.ts"), code: 'import { user } from "@/modules/user/user.sql";', errors: err("serverImportsModule") },
    // Options narrow too.
    {
      filename: file("modules/user/user.service.ts"),
      code: 'import { roleSchema } from "@/modules/role/role.contract";',
      options: [{ allow: { service: ["service"] } }],
      errors: err("foreignModule"),
    },
  ],
});
