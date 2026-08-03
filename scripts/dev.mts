import concurrently from "concurrently";
import { fileURLToPath } from "node:url";
import { resolveListenHost } from "../apps/server/src/shared/config.js";
import { resolveListenerUrls } from "../apps/server/src/shared/listener.js";

const host = resolveListenHost(process.argv.slice(2), process.env.TEXT_TO_IMAGE_HOST);
const urls = resolveListenerUrls(host, 5173);
process.stdout.write(
  `Text to Image development URLs:\n${urls.map((url) => `- ${url}`).join("\n")}\n`,
);
const { result } = concurrently(
  [
    {
      command: "npm run dev -w @text-to-image/server",
      name: "server",
      env: { TEXT_TO_IMAGE_DEV_HOST: host },
    },
    {
      command: "npm run dev -w @text-to-image/web",
      name: "web",
      env: { TEXT_TO_IMAGE_HOST: host },
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
