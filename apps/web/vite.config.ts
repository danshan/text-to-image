import { isIP } from "node:net";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function developmentPort(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError(`${name} must be an integer between 1 and 65535 in development mode`);
  }
  return value;
}

function developmentHost(): string {
  const value = process.env.TEXT_TO_IMAGE_HOST ?? "127.0.0.1";
  if (isIP(value) === 0) {
    throw new TypeError("TEXT_TO_IMAGE_HOST must be an IPv4 or IPv6 address");
  }
  return value;
}

export default defineConfig(({ command }) => {
  const serving = command === "serve";
  const serverPort = serving ? developmentPort("TEXT_TO_IMAGE_PORT", 4174) : 4174;
  const webPort = serving ? developmentPort("TEXT_TO_IMAGE_DEV_PORT", 5173) : 5173;
  const listenHost = serving ? developmentHost() : "127.0.0.1";

  return {
    plugins: [react()],
    build: {
      sourcemap: true,
      target: "es2022",
    },
    server: {
      host: listenHost,
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
  };
});
