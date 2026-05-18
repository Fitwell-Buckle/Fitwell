import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests: fast, hermetic, mocked. No real DB or network.
// Integration tests (*.integration.test.ts) run via vitest.integration.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
    // Don't fail the suite (or CI) just because a directory has no tests yet.
    passWithNoTests: true,
  },
});
