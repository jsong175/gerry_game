/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages project site is served from /<repo>/. `base` makes asset and
// fetch URLs (via import.meta.env.BASE_URL) resolve correctly there while a
// local `vite dev` at "/" still works. Override with GERRY_BASE if the repo is
// renamed. (ARCHITECTURE.md: GitHub Pages, 100% static.)
const base = process.env.GERRY_BASE ?? "/gerry_game/";

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
