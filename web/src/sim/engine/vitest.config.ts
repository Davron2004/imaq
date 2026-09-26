/**
 * Plain vitest config for the engine tests. The root vite.config.ts loads the Cloudflare plugin,
 * which currently makes vitest fail at startup ("There is already a server associated with the
 * config"). Run: npx vitest run web/src/sim --config web/src/sim/engine/vitest.config.ts
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("../../../..", import.meta.url)),
  test: { include: ["web/src/sim/**/*.test.ts"], testTimeout: 60_000 },
});
