import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import {
  ArchiveError,
  captureGenerationOutputBytes,
  commitGeneration,
  completeGeneration,
  failGeneration,
  finalizeGenerationInterrupted,
  inspectImage,
  markInvocationStarted,
  readPreparedGenerationInvocation,
  readTransaction,
  type GenerationRecord,
} from "@text-to-image/archive";

const XAI_BASE_URL = "https://api.x.ai/v1";
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export interface XaiInvocationOptions {
  apiKey?: string;
  timeoutSeconds: number;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  captureOutput?: typeof captureGenerationOutputBytes;
}

export interface DirectProviderInvocationResult {
  committed: true;
  commitMarkerPath: string;
  generation: GenerationRecord;
  draftUpdated: boolean;
  diagnostic: DirectProviderInvocationDiagnostic | null;
}

export type DirectProviderInvocationDiagnostic =
  | { code: "XAI_TIMEOUT"; stage: "transport" }
  | { code: "XAI_TRANSPORT_FAILED"; stage: "transport" }
  | { code: "XAI_RESPONSE_READ_FAILED"; stage: "response_read" }
  | { code: "XAI_RESPONSE_INVALID"; stage: "response_validation" }
  | { code: "XAI_OUTPUT_INVALID"; stage: "output_validation" };

export type ProviderExecutorKind = "codex_builtin" | "direct_api" | "host";

export interface ImageProviderAdapter {
  id: "openai" | "xai";
  displayName: string;
  executorKind: ProviderExecutorKind;
  maximumReferenceCount: number | null;
  credentialEnvironmentVariable: string | null;
  requiresExplicitModel: boolean;
  resolveCredential?: (gitRoot: string) => string | null;
  invoke?: typeof invokeXaiGeneration;
}

export function resolveXaiApiKey(gitRoot: string, environment = process.env): string | null {
  const existing = environment.XAI_API_KEY?.trim();
  if (existing) return existing;
  try {
    const parsed = parseEnv(readFileSync(join(gitRoot, ".env"), "utf8"));
    return parsed.XAI_API_KEY?.trim() || null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw new ArchiveError(
      "IMAGE_PROVIDER_CONFIG_INVALID",
      "Unable to read the repository provider environment file.",
    );
  }
}

export async function invokeXaiGeneration(
  libraryRoot: string,
  transactionId: string,
  options: XaiInvocationOptions,
): Promise<DirectProviderInvocationResult> {
  const invocation = readPreparedGenerationInvocation(libraryRoot, transactionId);
  if (invocation.provider !== "xai") {
    throw new ArchiveError(
      "IMAGE_PROVIDER_MISMATCH",
      "The prepared Generation does not belong to the xAI provider.",
      { provider: invocation.provider },
    );
  }
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new ArchiveError(
      "IMAGE_PROVIDER_AUTH_MISSING",
      "xAI is unavailable because XAI_API_KEY is not configured.",
    );
  }
  const model = invocation.tool.model?.trim();
  if (!model) {
    throw new ArchiveError(
      "IMAGE_PROVIDER_CONFIG_INVALID",
      "xAI requires an explicit Image Model.",
    );
  }
  if (invocation.references.length > 3) {
    throw new ArchiveError(
      "IMAGE_PROVIDER_CAPABILITY_UNSUPPORTED",
      "xAI supports at most three Reference Images.",
      { referenceCount: invocation.references.length },
    );
  }

  const body = buildXaiRequestBody(invocation, model);
  const endpoint = invocation.references.length > 0 ? "/images/edits" : "/images/generations";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutSeconds * 1000);
  markInvocationStarted(libraryRoot, transactionId, invocation.promptSha256);
  try {
    let response: Response;
    try {
      response = await (options.fetch ?? globalThis.fetch)(
        `${options.baseUrl ?? XAI_BASE_URL}${endpoint}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
    } catch {
      return commitXaiInterrupted(libraryRoot, transactionId, {
        code: controller.signal.aborted ? "XAI_TIMEOUT" : "XAI_TRANSPORT_FAILED",
        stage: "transport",
      });
    }

    let responseText: string;
    try {
      responseText = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
    } catch {
      return commitXaiInterrupted(
        libraryRoot,
        transactionId,
        controller.signal.aborted
          ? { code: "XAI_TIMEOUT", stage: "transport" }
          : { code: "XAI_RESPONSE_READ_FAILED", stage: "response_read" },
      );
    }
    clearTimeout(timeout);
    if (!response.ok) {
      failGeneration(libraryRoot, transactionId, {
        error: normalizedXaiHttpError(response.status, responseText),
      });
      return { ...commitGeneration(libraryRoot, transactionId), diagnostic: null };
    }

    let outputs: Buffer[];
    try {
      outputs = parseXaiOutputs(responseText);
    } catch {
      return commitXaiInterrupted(libraryRoot, transactionId, {
        code: "XAI_RESPONSE_INVALID",
        stage: "response_validation",
      });
    }

    try {
      outputs.forEach((bytes, index) => inspectImage(bytes, `xai-output-${index}`));
    } catch {
      return commitXaiInterrupted(libraryRoot, transactionId, {
        code: "XAI_OUTPUT_INVALID",
        stage: "output_validation",
      });
    }

    const captureOutput = options.captureOutput ?? captureGenerationOutputBytes;
    outputs.forEach((bytes, index) =>
      captureOutput(libraryRoot, transactionId, bytes, `xai-output-${index}`),
    );
    completeGeneration(libraryRoot, transactionId, {
      toolResult: {
        model,
        parameters: invocation.tool.parameters,
        outputCount: outputs.length,
      },
    });
    return { ...commitGeneration(libraryRoot, transactionId), diagnostic: null };
  } finally {
    clearTimeout(timeout);
  }
}

function commitXaiInterrupted(
  libraryRoot: string,
  transactionId: string,
  diagnostic: DirectProviderInvocationDiagnostic,
): DirectProviderInvocationResult {
  const transaction = readTransaction(libraryRoot, transactionId);
  if (transaction.state !== "invocation_started") {
    throw new ArchiveError(
      "TRANSACTION_INVALID_STATE",
      "Provider uncertainty can only finalize before Archive Output capture.",
      { transactionId, state: transaction.state },
    );
  }
  finalizeGenerationInterrupted(libraryRoot, transactionId);
  return { ...commitGeneration(libraryRoot, transactionId), diagnostic };
}

export const IMAGE_PROVIDER_ADAPTERS: readonly ImageProviderAdapter[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    executorKind: "codex_builtin",
    maximumReferenceCount: null,
    credentialEnvironmentVariable: null,
    requiresExplicitModel: false,
  },
  {
    id: "xai",
    displayName: "Grok / xAI",
    executorKind: "direct_api",
    maximumReferenceCount: 3,
    credentialEnvironmentVariable: "XAI_API_KEY",
    requiresExplicitModel: true,
    resolveCredential: resolveXaiApiKey,
    invoke: invokeXaiGeneration,
  },
] as const;

export function getImageProviderAdapter(provider: string): ImageProviderAdapter | null {
  return IMAGE_PROVIDER_ADAPTERS.find((adapter) => adapter.id === provider) ?? null;
}

export function resolveProviderInvocationModels<
  T extends { provider: string; tool: { model: string | null } },
>(
  invocations: readonly T[],
  configuration: Record<"openai" | "xai", { defaultModel?: string }>,
): T[] {
  return invocations.map((invocation) => {
    const adapter = getImageProviderAdapter(invocation.provider);
    if (!adapter?.requiresExplicitModel || invocation.tool.model) return invocation;
    return {
      ...invocation,
      tool: {
        ...invocation.tool,
        model: configuration[adapter.id].defaultModel ?? null,
      },
    };
  });
}

function buildXaiRequestBody(
  invocation: ReturnType<typeof readPreparedGenerationInvocation>,
  model: string,
): Record<string, unknown> {
  const parameters = normalizeXaiParameters(invocation.tool.parameters);
  const base = {
    model,
    prompt: invocation.prompt,
    n: 1,
    response_format: "b64_json",
    ...parameters,
  };
  if (invocation.references.length === 0) return base;
  return {
    ...base,
    images: invocation.references.map((reference) => {
      const bytes = readFileSync(reference.path);
      const inspection = inspectImage(bytes, reference.path);
      return { url: `data:${inspection.mediaType};base64,${bytes.toString("base64")}` };
    }),
  };
}

function normalizeXaiParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(["aspect_ratio", "resolution"]);
  const unknown = Object.keys(parameters).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ArchiveError(
      "IMAGE_PROVIDER_CONFIG_INVALID",
      "xAI invocation contains unsupported parameters.",
      { parameters: unknown },
    );
  }
  return parameters;
}

async function readBoundedResponseText(response: Response, maximumBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new ArchiveError(
      "IMAGE_PROVIDER_RESPONSE_TOO_LARGE",
      "xAI response exceeded the configured safety bound.",
    );
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ArchiveError(
        "IMAGE_PROVIDER_RESPONSE_TOO_LARGE",
        "xAI response exceeded the configured safety bound.",
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function parseXaiOutputs(responseText: string): Buffer[] {
  let value: unknown;
  try {
    value = JSON.parse(responseText);
  } catch {
    throw new ArchiveError(
      "IMAGE_PROVIDER_RESPONSE_INVALID",
      "xAI returned an invalid JSON response.",
    );
  }
  const data = isObject(value) && Array.isArray(value.data) ? value.data : null;
  if (!data || data.length === 0 || data.length > 10) {
    throw new ArchiveError(
      "IMAGE_PROVIDER_RESPONSE_INVALID",
      "xAI response did not contain a bounded Output list.",
    );
  }
  return data.map((item) => {
    const encoded = isObject(item) && typeof item.b64_json === "string" ? item.b64_json : null;
    if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new ArchiveError(
        "IMAGE_PROVIDER_RESPONSE_INVALID",
        "xAI response contained an invalid base64 Output.",
      );
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_OUTPUT_BYTES) {
      throw new ArchiveError(
        "IMAGE_PROVIDER_RESPONSE_INVALID",
        "xAI Output exceeded the supported image size bound.",
      );
    }
    return bytes;
  });
}

function normalizedXaiHttpError(
  status: number,
  responseText: string,
): {
  code: string;
  message: string;
  retryable: boolean;
  moderation?: { stage: "unknown"; categories: string[] };
} {
  const providerCode = readProviderErrorCode(responseText);
  if (providerCode.includes("safety") || providerCode.includes("moderation")) {
    return {
      code: "IMAGE_GENERATION_SAFETY_REJECTED",
      message: "xAI rejected the image generation request or result.",
      retryable: false,
      moderation: { stage: "unknown", categories: [] },
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "IMAGE_PROVIDER_AUTH_FAILED",
      message: "xAI authentication failed.",
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      code: "IMAGE_PROVIDER_RATE_LIMITED",
      message: "xAI rate limited the image generation request.",
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      code: "IMAGE_PROVIDER_UNAVAILABLE",
      message: "xAI returned a server failure.",
      retryable: true,
    };
  }
  return {
    code: "IMAGE_PROVIDER_REQUEST_REJECTED",
    message: "xAI rejected the image generation request.",
    retryable: false,
  };
}

function readProviderErrorCode(responseText: string): string {
  try {
    const value = JSON.parse(responseText) as unknown;
    if (!isObject(value) || !isObject(value.error)) return "";
    return typeof value.error.code === "string" ? value.error.code.toLowerCase() : "";
  } catch {
    return "";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
