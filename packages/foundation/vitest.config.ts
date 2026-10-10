import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
  },
});
