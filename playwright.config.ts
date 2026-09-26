import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:5173", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npx wrangler d1 migrations apply imaq --local && npx vite --port 5173 --strictPort",
        url: "http://localhost:5173/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
