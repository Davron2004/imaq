import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Agent worktrees live under .claude/; their builds must not reload this dev server.
  server: { watch: { ignored: ["**/.claude/**", "**/dist/**"] } },
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Imaq",
        short_name: "Imaq",
        description: "Water delivery requests, driver log and water office screen for truck-served communities.",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0b3d5c",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
