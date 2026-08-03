import { ReadModel } from "@text-to-image/read-model";
import { createApp } from "./app.js";
import { LibraryService } from "./library/library-service.js";
import { createArchiveAdapter } from "./shared/archive-adapter.js";
import { loadServerConfig } from "./shared/config.js";
import { resolveLibraryInitialization } from "./shared/library-initialization.js";

async function main(): Promise<void> {
  const config = loadServerConfig();
  const archive = createArchiveAdapter({
    gitRoot: config.gitRoot,
    ...(config.libraryArgument ? { libraryArgument: config.libraryArgument } : {}),
  });
  const initialization = resolveLibraryInitialization(archive.libraryRoot);
  const readModel = new ReadModel(archive.libraryRoot);
  if (!initialization) await readModel.open();
  const service = new LibraryService(archive, readModel);
  const { app, security } = await createApp({
    archive,
    service,
    initialization,
    logLevel: config.logLevel,
  });
  const address = await app.listen({ host: config.host, port: config.port });
  security.allowHost(new URL(address).host);
  if (config.devOrigin) security.allowOrigin(config.devOrigin);

  const close = async (): Promise<void> => {
    await app.close();
    readModel.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  app.log.info({ address }, "Text to Image local service is ready");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ level: "error", message })}\n`);
  process.exitCode = 1;
});
