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
  generationParamsSchema,
  imageParamsSchema,
  type CurationPatchRequest,
  type DraftPutRequest,
  type GalleryResponse,
  type HealthResponse,
  type LibraryInitializationRequired,
} from "@text-to-image/api-contract";
import { ThumbnailCache, type GalleryQuery } from "@text-to-image/read-model";
import Fastify, { type FastifyInstance } from "fastify";
import type { LibraryService } from "./library/library-service.js";
import type { ArchivePort } from "./shared/archive-port.js";
import { AppError, isErrorWithCode, NotFoundError } from "./shared/errors.js";
import { installSecurity, SecurityContext } from "./shared/security.js";

export interface AppOptions {
  archive: ArchivePort;
  service: LibraryService;
  initialization?: LibraryInitializationRequired | null;
  logLevel?: string;
  webRoot?: string;
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
  const thumbnails = new ThumbnailCache(options.archive.libraryRoot);
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
    if (!options.initialization) return;
    const pathname = request.url.split("?", 1)[0] ?? request.url;
    if (
      !pathname.startsWith("/api/v1/") ||
      pathname === "/api/v1/bootstrap" ||
      pathname === "/api/v1/health"
    ) {
      return;
    }
    return reply.status(503).send({
      code: "LIBRARY_INITIALIZATION_REQUIRED",
      message: `Library manifest does not exist at ${options.initialization.libraryRoot}.`,
      details: { libraryRoot: options.initialization.libraryRoot },
      recoveryHint: options.initialization.initCommand,
      correlationId: request.id,
    });
  });

  const health = async (): Promise<HealthResponse> => {
    if (options.initialization) {
      return {
        status: "unavailable",
        apiVersion: API_VERSION,
        libraryFormatVersion: null,
        index: {
          available: false,
          latestArchiveMarker: null,
          lastIndexedMarker: null,
          lagCount: 0,
        },
        recoveryCount: 0,
        diagnostics: [
          `Library manifest does not exist at ${options.initialization.libraryRoot}.`,
          `Initialize it with: ${options.initialization.initCommand}`,
        ],
      };
    }
    const [index, diagnostics, recovery] = await Promise.all([
      options.service.readModel.status(),
      options.archive.diagnostics(),
      options.archive.listRecovery(),
    ]);
    const status = options.archive.readOnly
      ? "read_only"
      : diagnostics.length > 0
        ? "degraded"
        : recovery.items.length > 0
          ? "recovery_required"
          : index.lagCount > 0
            ? "indexing"
            : "healthy";
    return {
      status,
      apiVersion: API_VERSION,
      libraryFormatVersion: options.archive.formatVersion,
      index,
      recoveryCount: recovery.items.length,
      diagnostics,
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
    return {
      apiVersion: API_VERSION,
      libraryFormatVersion: options.archive.formatVersion,
      sessionToken: security.sessionToken,
      initialization: options.initialization ?? null,
      capabilities: {
        curation: !options.initialization && !options.archive.readOnly,
        recovery: !options.initialization,
        generationFromWeb: false,
      },
    };
  });

  app.get<{ Querystring: Record<string, unknown>; Reply: GalleryResponse }>(
    "/api/v1/gallery",
    { schema: { querystring: galleryQuerySchema } },
    (request) => options.service.gallery(galleryQuery(request.query)),
  );
  app.get<{ Querystring: Record<string, unknown>; Reply: GalleryResponse }>(
    "/api/v1/references",
    { schema: { querystring: galleryQuerySchema } },
    (request) => options.service.references(galleryQuery(request.query)),
  );
  app.get<{ Querystring: { status?: "active" | "shelved" } }>("/api/v1/creations", (request) => {
    const items = options.service.readModel.listCreations(request.query.status);
    return { items, page: { nextCursor: null, total: items.length } };
  });
  app.get<{ Params: { creationId: string } }>(
    "/api/v1/creations/:creationId",
    { schema: { params: creationParamsSchema } },
    async (request) => options.service.creation(request.params.creationId),
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
      const created = await options.archive.createCreation(request.body);
      await options.service.readModel.rebuild();
      return reply.status(201).send({ data: created });
    },
  );
  app.get<{ Params: { generationId: string } }>(
    "/api/v1/generations/:generationId",
    { schema: { params: generationParamsSchema } },
    (request) => options.service.generation(request.params.generationId),
  );
  app.get<{ Params: { sha256: string } }>(
    "/api/v1/images/:sha256",
    { schema: { params: imageParamsSchema } },
    (request) => options.service.image(request.params.sha256),
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
      const path = options.service.readModel.contentPath(request.params.sha256);
      if (!path) throw new NotFoundError("Image Asset", request.params.sha256);
      const image = options.service.readModel.getImage(request.params.sha256);
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
      try {
        await options.archive.updateCreationCuration(request.params.creationId, request.body);
      } catch (error) {
        if (!isErrorWithCode(error) || error.code !== "CURATION_CONFLICT") throw error;
        await options.service.readModel.rebuild();
        throw new AppError("CURATION_CONFLICT", error.message, 409, {
          ...error.details,
          current: options.service.readModel.getCreation(request.params.creationId),
        });
      }
      await options.service.readModel.rebuild();
      const data = options.service.readModel.getCreation(request.params.creationId);
      if (!data) throw new NotFoundError("Creation", request.params.creationId);
      return { data };
    },
  );
  app.patch<{ Params: { sha256: string }; Body: CurationPatchRequest }>(
    "/api/v1/curation/images/:sha256",
    { schema: { params: imageParamsSchema, body: curationPatchSchema } },
    async (request) => {
      try {
        await options.archive.updateImageCuration(request.params.sha256, request.body);
      } catch (error) {
        if (!isErrorWithCode(error) || error.code !== "CURATION_CONFLICT") throw error;
        await options.service.readModel.rebuild();
        throw new AppError("CURATION_CONFLICT", error.message, 409, {
          ...error.details,
          current: options.service.readModel.getImage(request.params.sha256),
        });
      }
      await options.service.readModel.rebuild();
      const data = options.service.readModel.getImage(request.params.sha256);
      if (!data) throw new NotFoundError("Image Asset", request.params.sha256);
      return { data };
    },
  );
  app.put<{ Params: { creationId: string }; Body: DraftPutRequest }>(
    "/api/v1/creations/:creationId/draft",
    { schema: { params: creationParamsSchema, body: draftPutSchema } },
    async (request) => {
      try {
        await options.archive.updateDraft(request.params.creationId, request.body);
      } catch (error) {
        if (!isErrorWithCode(error) || error.code !== "DRAFT_CONFLICT") throw error;
        throw new AppError("DRAFT_CONFLICT", error.message, 409, {
          ...error.details,
          current: (await options.service.creation(request.params.creationId)).draft,
        });
      }
      return { data: (await options.service.creation(request.params.creationId)).draft };
    },
  );

  app.post("/api/v1/imports", async (request, reply) => {
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
      const imported = await options.archive.importImage(uploadPath);
      await options.service.readModel.rebuild();
      return reply.status(201).send({ data: imported });
    } finally {
      await rm(uploadPath, { force: true });
    }
  });

  app.get("/api/v1/recovery", async () => options.archive.listRecovery());
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
      data: await options.archive.recover(
        request.params.transactionId,
        request.params.action,
        request.body.dryRun ?? true,
      ),
    }),
  );
  app.post("/api/v1/index/rebuild", async () => {
    await options.service.readModel.rebuild();
    return { data: await options.service.readModel.status() };
  });

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
