import { isIP } from "node:net";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const listenHost = process.env.TEXT_TO_IMAGE_HOST ?? "127.0.0.1";
if (isIP(listenHost) === 0) {
  throw new TypeError("TEXT_TO_IMAGE_HOST must be an IPv4 or IPv6 address");
}

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    target: "es2022",
  },
  server: {
    host: listenHost,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4174",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
