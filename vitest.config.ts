// Tests run without the Cloudflare Vite plugin (it can't start inside vitest).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["web/src/**/*.test.ts", "shared/**/*.test.ts", "worker/**/*.test.ts"],
    exclude: ["**/node_modules/**", "e2e/**", ".claude/**"],
  },
});
