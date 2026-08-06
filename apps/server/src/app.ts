import { randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import {
  API_VERSION,
  creationParamsSchema,
  curationPatchSchema,
  draftPutSchema,
  galleryQuerySchema,
  generationIssuesQuerySchema,
  generationParamsSchema,
  imageParamsSchema,
  purgeExecuteSchema,
  purgePrepareSchema,
  type BootstrapResponse,
  type CurationPatchRequest,
  type DraftPutRequest,
  type GalleryResponse,
  type HealthResponse,
  type LibraryTransition,
  type LibraryTransitionCommitResponse,
  type LibraryTransitionRequest,
  type PurgeExecuteRequest,
  type PurgePrepareRequest,
} from "@text-to-image/api-contract";
import { creationPurgeTarget, imagePurgeTarget } from "@text-to-image/archive";
import type { GalleryQuery, IndexDegradationCode } from "@text-to-image/read-model";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { AppError, isErrorWithCode, NotFoundError } from "./shared/errors.js";
import type { LibraryContext } from "./shared/library-runtime.js";
import type { LibraryRuntime } from "./shared/library-runtime.js";
import { installSecurity, SecurityContext } from "./shared/security.js";

export interface AppOptions {
  runtime: LibraryRuntime;
  logLevel?: string;
  webRoot?: string;
}

function indexDiagnostic(code: IndexDegradationCode): string {
  switch (code) {
    case "INDEX_WRITER_BUSY":
      return "The Gallery index is waiting for another index writer. Retry after it finishes.";
    case "INDEX_COORDINATOR_FAILED":
      return "The Gallery index coordinator is unavailable. Use Settings to rebuild the index.";
    case "INDEX_PROJECTION_FAILED":
      return "A committed Archive record could not be projected into the Gallery index.";
    case "INDEX_REBUILD_FAILED":
      return "The Gallery index could not be rebuilt from the Archive.";
  }
}

function galleryQuery(value: Record<string, unknown>): GalleryQuery {
  const result: GalleryQuery = {};
  if (typeof value.q === "string") result.q = value.q;
  if (typeof value.creationId === "string") result.creationId = value.creationId;
  if (value.status === "active" || value.status === "shelved") result.status = value.status;
  if (value.favorite === "true" || value.favorite === "false")
    result.favorite = value.favorite === "true";
  if (value.hidden === "include" || value.hidden === "only" || value.hidden === "exclude")
    result.hidden = value.hidden;
  if (value.source === "output" || value.source === "imported" || value.source === "all")
    result.source = value.source;
  if (
    value.generationStatus === "succeeded" ||
    value.generationStatus === "failed" ||
    value.generationStatus === "interrupted"
  )
    result.generationStatus = value.generationStatus;
  if (value.sort === "newest" || value.sort === "oldest" || value.sort === "rating_desc")
    result.sort = value.sort;
  if (typeof value.tag === "string") result.tags = [value.tag];
  if (Array.isArray(value.tag) && value.tag.every((tag) => typeof tag === "string")) {
    result.tags = value.tag;
  }
  if (typeof value.rating === "number") result.rating = value.rating;
  if (
    value.role === "subject" ||
    value.role === "style" ||
    value.role === "composition" ||
    value.role === "palette" ||
    value.role === "other"
  )
    result.role = value.role;
  if (typeof value.tool === "string") result.tool = value.tool;
  if (typeof value.model === "string") result.model = value.model;
  if (typeof value.from === "string") {
    result.from = /^\d{4}-\d{2}-\d{2}$/u.test(value.from)
      ? `${value.from}T00:00:00.000Z`
      : value.from;
  }
  if (typeof value.to === "string") {
    result.to = /^\d{4}-\d{2}-\d{2}$/u.test(value.to) ? `${value.to}T23:59:59.999Z` : value.to;
  }
  if (typeof value.cursor === "string") result.cursor = value.cursor;
  if (typeof value.limit === "number") result.limit = value.limit;
  return result;
}

function statusCodeForExternalError(code: string): number {
  if (code === "PURGE_TARGET_NOT_FOUND") return 404;
  if (code === "PURGE_CONFIRMATION_REQUIRED") return 422;
  if (code === "PURGE_INSUFFICIENT_SPACE") return 507;
  if (
    code === "PURGE_PLAN_STALE" ||
    code === "PURGE_REFERENCE_BLOCKED" ||
    code === "PURGE_RECOVERY_BLOCKED" ||
    code === "PURGE_MAINTENANCE_ACTIVE" ||
    code === "PURGE_RECOVERY_REQUIRED"
  )
    return 409;
  if (code.includes("CONFLICT")) return 409;
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("VALIDATION") || code.includes("INVALID")) return 422;
  if (code.includes("READ_ONLY") || code.includes("CORRUPT")) return 503;
  return 500;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function createApp(
  options: AppOptions,
): Promise<{ app: FastifyInstance; security: SecurityContext }> {
  const app = Fastify({
    logger: {
      level: options.logLevel ?? "info",
      redact: ["req.headers.x-session-token", "res.headers.x-session-token"],
    },
    genReqId: () => randomUUID(),
    bodyLimit: 2 * 1024 * 1024,
  });
  const security = new SecurityContext(randomBytes(32).toString("base64url"));
  const requestContexts = new WeakMap<
    FastifyRequest,
    {
      context: LibraryContext;
      release: () => void;
      handlerComplete: boolean;
      responseClosed: boolean;
    }
  >();
  const releaseRequestContext = (request: FastifyRequest): void => {
    const lease = requestContexts.get(request);
    if (!lease) return;
    lease.release();
    requestContexts.delete(request);
  };
  const markHandlerComplete = (request: FastifyRequest): void => {
    const lease = requestContexts.get(request);
    if (!lease) return;
    lease.handlerComplete = true;
    if (lease.responseClosed) releaseRequestContext(request);
  };
  const markResponseClosed = (request: FastifyRequest): void => {
    const lease = requestContexts.get(request);
    if (!lease) return;
    lease.responseClosed = true;
    if (lease.handlerComplete) releaseRequestContext(request);
  };
  const contextFor = (request: FastifyRequest): LibraryContext => {
    const lease = requestContexts.get(request);
    if (!lease) throw new Error("Library context was not acquired for the request");
    return lease.context;
  };
  installSecurity(app, security);
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Correlation-ID", request.id);
    return payload;
  });

  await app.register(fastifyMultipart, {
    limits: { files: 1, fields: 0, parts: 1, fileSize: 25 * 1024 * 1024 },
    throwFileSizeLimit: true,
  });

  app.setErrorHandler(async (error, request, reply) => {
    const correlationId = request.id;
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
        recoveryHint: error.recoveryHint,
        correlationId,
        ...(error.details && "current" in error.details ? { current: error.details.current } : {}),
      });
    }
    if (isErrorWithCode(error)) {
      return reply.status(statusCodeForExternalError(error.code)).send({
        code: error.code,
        message: error.message,
        details: error.details,
        correlationId,
      });
    }
    request.log.error({ err: error }, "Unhandled request error");
    return reply
      .status(500)
      .send({ code: "INTERNAL_ERROR", message: "An unexpected error occurred.", correlationId });
  });

  app.addHook("preHandler", async (request, reply) => {
    const pathname = request.url.split("?", 1)[0] ?? request.url;
    if (!pathname.startsWith("/api/v1/")) return;
    if (pathname === "/api/v1/bootstrap" || pathname === "/api/v1/health") return;
    if (pathname.startsWith("/api/v1/library/")) return;
    if (pathname.startsWith("/api/v1/purge/")) return;
    const lease = await options.runtime.acquire();
    requestContexts.set(request, {
      ...lease,
      handlerComplete: false,
      responseClosed: false,
    });
    reply.raw.once("close", () => markResponseClosed(request));
  });
  app.addHook("onSend", async (request, _reply, payload) => {
    markHandlerComplete(request);
    return payload;
  });
  app.addHook("onTimeout", (request, _reply, done) => {
    markResponseClosed(request);
    done();
  });
  app.addHook("onRequestAbort", (request, done) => {
    markResponseClosed(request);
    done();
  });
  app.addHook("onResponse", (request) => {
    releaseRequestContext(request);
  });

  const health = async (): Promise<HealthResponse> => {
    const state = options.runtime.state;
    if (state.status === "unavailable") {
      return {
        status: "unavailable",
        apiVersion: API_VERSION,
        libraryFormatVersion: null,
        index: {
          available: false,
          latestArchiveMarker: null,
          lastIndexedMarker: null,
          lagCount: 0,
          degraded: false,
          code: null,
        },
        recoveryCount: 0,
        diagnostics: [`Asset Library is unavailable at ${state.libraryRoot}: ${state.reason}.`],
      };
    }
    try {
      return await options.runtime.withContext(async ({ archive, readModel }) => {
        const [index, diagnostics, recovery] = await Promise.all([
          readModel.status(),
          archive.diagnostics(),
          archive.listRecovery(),
        ]);
        const status = archive.readOnly
          ? "read_only"
          : diagnostics.length > 0 || index.degraded
            ? "degraded"
            : recovery.items.length > 0
              ? "recovery_required"
              : index.lagCount > 0
                ? "indexing"
                : "healthy";
        return {
          status,
          apiVersion: API_VERSION,
          libraryFormatVersion: archive.formatVersion,
          index: {
            available: index.available,
            latestArchiveMarker: index.latestArchiveMarker,
            lastIndexedMarker: index.lastIndexedMarker,
            lagCount: index.lagCount,
            degraded: index.degraded ?? false,
            code: index.code ?? null,
          },
          recoveryCount: recovery.items.length,
          diagnostics: [
            ...diagnostics,
            ...(index.degraded ? [indexDiagnostic(index.code ?? "INDEX_REBUILD_FAILED")] : []),
          ],
        };
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "LIBRARY_UNAVAILABLE") return health();
      throw error;
    }
  };

  const bootstrap = async (): Promise<BootstrapResponse> => {
    const state = options.runtime.state;
    let formatVersion: number | null = null;
    let readOnly = true;
    if (state.status === "ready") {
      try {
        const metadata = await options.runtime.withContext(({ archive }) => ({
          formatVersion: archive.formatVersion,
          readOnly: archive.readOnly,
        }));
        formatVersion = metadata.formatVersion;
        readOnly = metadata.readOnly;
      } catch (error) {
        if (error instanceof AppError && error.code === "LIBRARY_UNAVAILABLE") return bootstrap();
        throw error;
      }
    }
    return {
      apiVersion: API_VERSION,
      libraryFormatVersion: formatVersion,
      sessionToken: security.sessionToken,
      library: state,
      capabilities: {
        curation: state.status === "ready" && !readOnly,
        recovery: state.status === "ready",
        libraryManagement: true,
        generationFromWeb: false,
      },
    };
  };

  app.get("/health", health);
  app.get("/ready", async (_request, reply) => {
    const value = await health();
    return reply.status(value.status === "unavailable" ? 503 : 200).send(value);
  });
  app.get("/api/v1/health", health);
  app.get("/api/v1/bootstrap", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return bootstrap();
  });

  app.get<{ Reply: { data: LibraryTransition | null } }>("/api/v1/library/transition", () => ({
    data: options.runtime.transition,
  }));
  app.post<{ Body: LibraryTransitionRequest; Reply: { data: LibraryTransition } }>(
    "/api/v1/library/transitions",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["action"],
          properties: {
            action: { enum: ["initialize", "select", "retry"] },
            libraryRoot: { type: "string", minLength: 1, maxLength: 4096 },
          },
        },
      },
    },
    async (request, reply) =>
      reply.status(202).send({
        data: options.runtime.startTransition(request.body.action, request.body.libraryRoot),
      }),
  );
  app.post<{
    Params: { transitionId: string };
    Reply: LibraryTransitionCommitResponse;
  }>(
    "/api/v1/library/transitions/:transitionId/commit",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["transitionId"],
          properties: { transitionId: { type: "string", pattern: "^[0-9a-f-]{36}$" } },
        },
      },
    },
    async (request) => {
      const transition = await options.runtime.commitTransition(request.params.transitionId);
      security.rotateSessionToken();
      return { transition, bootstrap: await bootstrap() };
    },
  );

  app.get<{ Querystring: Record<string, unknown>; Reply: GalleryResponse }>(
    "/api/v1/gallery",
    { schema: { querystring: galleryQuerySchema } },
    (request) => contextFor(request).service.gallery(galleryQuery(request.query)),
  );
  app.get<{ Querystring: Record<string, unknown>; Reply: GalleryResponse }>(
    "/api/v1/references",
    { schema: { querystring: galleryQuerySchema } },
    (request) => contextFor(request).service.references(galleryQuery(request.query)),
  );
  app.get<{ Querystring: { limit?: number } }>(
    "/api/v1/generation-issues",
    { schema: { querystring: generationIssuesQuerySchema } },
    (request) => contextFor(request).service.generationIssues(request.query.limit),
  );
  app.get<{ Querystring: { status?: "active" | "shelved" } }>("/api/v1/creations", (request) => {
    const items = contextFor(request).readModel.listCreations(request.query.status);
    return { items, page: { nextCursor: null, total: items.length } };
  });
  app.get<{ Params: { creationId: string } }>(
    "/api/v1/creations/:creationId",
    { schema: { params: creationParamsSchema } },
    async (request) => contextFor(request).service.creation(request.params.creationId),
  );
  app.post<{ Body: { title: string; prompt: string } }>(
    "/api/v1/creations",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["title", "prompt"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 300 },
            prompt: { type: "string", maxLength: 1000000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { archive, readModel } = contextFor(request);
      const created = await archive.createCreation(request.body);
      await readModel.rebuild();
      return reply.status(201).send({ data: created });
    },
  );
  app.get<{ Params: { generationId: string } }>(
    "/api/v1/generations/:generationId",
    { schema: { params: generationParamsSchema } },
    (request) => contextFor(request).service.generation(request.params.generationId),
  );
  app.get<{ Params: { sha256: string } }>(
    "/api/v1/images/:sha256",
    { schema: { params: imageParamsSchema } },
    (request) => contextFor(request).service.image(request.params.sha256),
  );
  app.get<{ Params: { sha256: string }; Querystring: { variant?: "thumbnail" | "original" } }>(
    "/api/v1/images/:sha256/content",
    {
      schema: {
        params: imageParamsSchema,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { variant: { enum: ["thumbnail", "original"] } },
        },
      },
    },
    async (request, reply) => {
      const { readModel, thumbnails } = contextFor(request);
      const path = readModel.contentPath(request.params.sha256);
      if (!path) throw new NotFoundError("Image Asset", request.params.sha256);
      const image = readModel.getImage(request.params.sha256);
      if (!image) throw new NotFoundError("Image Asset", request.params.sha256);
      const contentPath =
        request.query.variant === "original"
          ? path
          : await thumbnails.getOrCreate(request.params.sha256, path);
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply
        .type(request.query.variant === "original" ? image.mediaType : "image/webp")
        .send(createReadStream(contentPath));
    },
  );

  app.patch<{ Params: { creationId: string }; Body: CurationPatchRequest }>(
    "/api/v1/curation/creations/:creationId",
    { schema: { params: creationParamsSchema, body: curationPatchSchema } },
    async (request) => {
      const { archive, readModel } = contextFor(request);
      try {
        await archive.updateCreationCuration(request.params.creationId, request.body);
      } catch (error) {
        if (!isErrorWithCode(error) || error.code !== "CURATION_CONFLICT") throw error;
        await readModel.rebuild();
        throw new AppError("CURATION_CONFLICT", error.message, 409, {
          ...error.details,
          current: readModel.getCreation(request.params.creationId),
        });
      }
      await readModel.rebuild();
      const data = readModel.getCreation(request.params.creationId);
      if (!data) throw new NotFoundError("Creation", request.params.creationId);
      return { data };
    },
  );
  app.patch<{ Params: { sha256: string }; Body: CurationPatchRequest }>(
    "/api/v1/curation/images/:sha256",
    { schema: { params: imageParamsSchema, body: curationPatchSchema } },
    async (request) => {
      const { archive, readModel } = contextFor(request);
      try {
        await archive.updateImageCuration(request.params.sha256, request.body);
      } catch (error) {
        if (!isErrorWithCode(error) || error.code !== "CURATION_CONFLICT") throw error;
        await readModel.rebuild();
        throw new AppError("CURATION_CONFLICT", error.message, 409, {
          ...error.details,
          current: readModel.getImage(request.params.sha256),
        });
      }
      await readModel.rebuild();
      const data = readModel.getImage(request.params.sha256);
      if (!data) throw new NotFoundError("Image Asset", request.params.sha256);
      return { data };
    },
  );
  app.put<{ Params: { creationId: string }; Body: DraftPutRequest }>(
    "/api/v1/creations/:creationId/draft",
    { schema: { params: creationParamsSchema, body: draftPutSchema } },
    async (request) => {
      const { archive, service } = contextFor(request);
      try {
        await archive.updateDraft(request.params.creationId, request.body);
      } catch (error) {
        if (!isErrorWithCode(error) || error.code !== "DRAFT_CONFLICT") throw error;
        throw new AppError("DRAFT_CONFLICT", error.message, 409, {
          ...error.details,
          current: (await service.creation(request.params.creationId)).draft,
        });
      }
      return { data: (await service.creation(request.params.creationId)).draft };
    },
  );

  app.post("/api/v1/imports", async (request, reply) => {
    const { archive, readModel } = contextFor(request);
    const uploadDirectory = join(tmpdir(), "text-to-image-uploads");
    await mkdir(uploadDirectory, { recursive: true });
    const uploadPath = join(uploadDirectory, `${randomUUID()}.upload`);
    try {
      const part = await request.file({
        limits: { fileSize: 25 * 1024 * 1024, files: 1, parts: 1 },
      });
      if (!part) throw new AppError("IMPORT_FILE_REQUIRED", "One image file is required.", 422);
      await pipeline(part.file, createWriteStream(uploadPath, { flags: "wx", mode: 0o600 }));
      if (part.file.truncated)
        throw new AppError("IMPORT_FILE_TOO_LARGE", "The image exceeds 25 MiB.", 413);
      const imported = await archive.importImage(uploadPath);
      await readModel.rebuild();
      return reply.status(201).send({ data: imported });
    } finally {
      await rm(uploadPath, { force: true });
    }
  });

  app.get("/api/v1/recovery", async (request) => contextFor(request).archive.listRecovery());
  app.post<{ Params: { transactionId: string; action: string }; Body: { dryRun?: boolean } }>(
    "/api/v1/recovery/:transactionId/:action",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["transactionId", "action"],
          properties: {
            transactionId: { type: "string", pattern: "^[0-9a-f-]{36}$" },
            action: {
              enum: ["cancel", "finalize_interrupted", "continue", "commit", "quarantine"],
            },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: { dryRun: { type: "boolean" } },
        },
      },
    },
    async (request) => ({
      data: await contextFor(request).archive.recover(
        request.params.transactionId,
        request.params.action,
        request.body.dryRun ?? true,
      ),
    }),
  );
  app.post("/api/v1/index/rebuild", async (request) => {
    const { readModel } = contextFor(request);
    await readModel.rebuild();
    return { data: await readModel.status() };
  });

  app.post<{
    Params: { creationId: string };
    Body: PurgePrepareRequest;
  }>(
    "/api/v1/purge/creations/:creationId/prepare",
    { schema: { params: creationParamsSchema, body: purgePrepareSchema } },
    async (request) => ({
      data: await options.runtime.preparePurge(
        creationPurgeTarget(request.params.creationId),
        request.body,
      ),
    }),
  );
  app.post<{
    Params: { creationId: string };
    Body: PurgeExecuteRequest;
  }>(
    "/api/v1/purge/creations/:creationId/execute",
    { schema: { params: creationParamsSchema, body: purgeExecuteSchema } },
    async (request) => {
      const data = await options.runtime.executePurge(
        creationPurgeTarget(request.params.creationId),
        request.body,
      );
      security.rotateSessionToken();
      return { data, bootstrap: await bootstrap() };
    },
  );
  app.post<{ Params: { sha256: string }; Body: PurgePrepareRequest }>(
    "/api/v1/purge/images/:sha256/prepare",
    { schema: { params: imageParamsSchema, body: purgePrepareSchema } },
    async (request) => ({
      data: await options.runtime.preparePurge(
        imagePurgeTarget(request.params.sha256),
        request.body,
      ),
    }),
  );
  app.post<{ Params: { sha256: string }; Body: PurgeExecuteRequest }>(
    "/api/v1/purge/images/:sha256/execute",
    { schema: { params: imageParamsSchema, body: purgeExecuteSchema } },
    async (request) => {
      const data = await options.runtime.executePurge(
        imagePurgeTarget(request.params.sha256),
        request.body,
      );
      security.rotateSessionToken();
      return { data, bootstrap: await bootstrap() };
    },
  );
  app.get<{ Params: { operationId: string } }>(
    "/api/v1/purge/operations/:operationId",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["operationId"],
          properties: { operationId: { type: "string", pattern: "^[0-9a-f-]{36}$" } },
        },
      },
    },
    (request) => ({ data: options.runtime.purgeStatus(request.params.operationId) }),
  );

  const webRoot = resolve(options.webRoot ?? join(process.cwd(), "apps", "web", "dist"));
  if (await pathExists(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false, index: false });
    app.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/")) throw new NotFoundError("API route", request.url);
      reply.header("Cache-Control", "no-store");
      return reply.sendFile("index.html");
    });
  }

  return { app, security };
}
