import { createApp } from "./app.js";
import { loadServerConfig } from "./shared/config.js";
import { LibraryRuntime } from "./shared/library-runtime.js";
import { resolveListenerUrls } from "./shared/listener.js";

async function main(): Promise<void> {
  const config = loadServerConfig(process.env, process.cwd(), process.argv.slice(2));
  const runtime = await LibraryRuntime.create({
    gitRoot: config.gitRoot,
    ...(config.libraryArgument ? { libraryArgument: config.libraryArgument } : {}),
  });
  const { app, security } = await createApp({
    runtime,
    logLevel: config.logLevel,
  });
  const address = await app.listen({ host: config.host, port: config.port });
  const port = Number(new URL(address).port);
  const urls = resolveListenerUrls(config.host, port);
  for (const url of urls) security.allowHost(new URL(url).host);
  if (config.devOrigin) security.allowOrigin(config.devOrigin);
  if (config.devHost && config.devPort) {
    for (const url of resolveListenerUrls(config.devHost, config.devPort)) {
      security.allowOrigin(url);
    }
  }

  const close = async (): Promise<void> => {
    await app.close();
    runtime.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  app.log.info({ address, urls }, "Text to Image local service is ready");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ level: "error", message })}\n`);
  process.exitCode = 1;
});
