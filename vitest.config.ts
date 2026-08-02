import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@text-to-image/domain": new URL("./packages/domain/src/index.ts", import.meta.url).pathname,
      "@text-to-image/schemas": new URL("./packages/schemas/src/index.ts", import.meta.url)
        .pathname,
      "@text-to-image/archive": new URL("./packages/archive/src/index.ts", import.meta.url)
        .pathname,
      "@text-to-image/read-model": new URL("./packages/read-model/src/index.ts", import.meta.url)
        .pathname,
      "@text-to-image/api-contract": new URL(
        "./packages/api-contract/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    name: "unit",
    environment: "node",
    passWithNoTests: true,
    include: [
      "apps/server/src/**/*.test.ts",
      "packages/*/src/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/hooks/**/*.test.{ts,tsx}",
      "tests/skill/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/*.integration.test.{ts,tsx}", "**/*.performance.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage/unit",
    },
  },
});
