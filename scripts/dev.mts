import concurrently from "concurrently";
import { fileURLToPath } from "node:url";
import { resolveListenHost } from "../apps/server/src/shared/config.js";
import { resolveListenerUrls } from "../apps/server/src/shared/listener.js";

function developmentPort(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError(`${name} must be an integer between 1 and 65535 in development mode`);
  }
  return value;
}

const host = resolveListenHost(process.argv.slice(2), process.env.TEXT_TO_IMAGE_HOST);
const serverPort = developmentPort("TEXT_TO_IMAGE_PORT", 4174);
const webPort = developmentPort("TEXT_TO_IMAGE_DEV_PORT", 5173);
const urls = resolveListenerUrls(host, webPort);
process.stdout.write(
  `Text to Image development URLs:\n${urls.map((url) => `- ${url}`).join("\n")}\n`,
);
const { result } = concurrently(
  [
    {
      command: "npm run dev -w @text-to-image/server",
      name: "server",
      env: {
        TEXT_TO_IMAGE_DEV_HOST: host,
        TEXT_TO_IMAGE_DEV_PORT: String(webPort),
        TEXT_TO_IMAGE_PORT: String(serverPort),
      },
    },
    {
      command: "npm run dev -w @text-to-image/web",
      name: "web",
      env: {
        TEXT_TO_IMAGE_DEV_PORT: String(webPort),
        TEXT_TO_IMAGE_HOST: host,
        TEXT_TO_IMAGE_PORT: String(serverPort),
      },
    },
  ],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    killOthersOn: ["failure", "success"],
    prefix: "name",
  },
);

try {
  await result;
} catch {
  process.exitCode = 1;
}
