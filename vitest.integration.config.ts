import { defineConfig } from "vitest/config";
import path from "path";

// Integration tests: hit a real Neon dev branch (never production).
// Slower, stateful, run serially to avoid cross-test DB contention.
// Convention copied from the faxterra repo.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    fileParallelism: false,
    passWithNoTests: true,
  },
});
