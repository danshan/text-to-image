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
    name: "integration",
    environment: "node",
    include: [
      "packages/*/src/**/*.integration.test.ts",
      "tests/archive/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "apps/server/src/**/*.integration.test.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
  },
});
