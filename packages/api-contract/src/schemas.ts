const uuid = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
const sha256 = "^[0-9a-f]{64}$";

export const idParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", pattern: uuid } },
} as const;

export const creationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["creationId"],
  properties: { creationId: { type: "string", pattern: uuid } },
} as const;

export const generationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["generationId"],
  properties: { generationId: { type: "string", pattern: uuid } },
} as const;

export const generationIssuesQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
} as const;

export const imageParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sha256"],
  properties: { sha256: { type: "string", pattern: sha256 } },
} as const;

export const purgePrepareSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    abandonRecoveryTransactionIds: {
      type: "array",
      uniqueItems: true,
      maxItems: 100,
      items: { type: "string", pattern: uuid },
    },
  },
} as const;

export const purgeExecuteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["planDigest", "confirmed"],
  properties: {
    planDigest: { type: "string", pattern: sha256 },
    confirmed: { type: "boolean" },
    abandonRecoveryTransactionIds: {
      type: "array",
      uniqueItems: true,
      maxItems: 100,
      items: { type: "string", pattern: uuid },
    },
  },
} as const;

export const galleryQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    q: { type: "string", maxLength: 500 },
    creationId: { type: "string", pattern: uuid },
    status: { enum: ["active", "shelved"] },
    favorite: { enum: ["true", "false"] },
    hidden: { enum: ["include", "only", "exclude"] },
    source: { enum: ["output", "imported", "all"] },
    generationStatus: { enum: ["succeeded", "failed", "interrupted"] },
    sort: { enum: ["newest", "oldest", "rating_desc"] },
    tag: {
      anyOf: [
        { type: "string", maxLength: 100 },
        { type: "array", maxItems: 20, items: { type: "string", maxLength: 100 } },
      ],
    },
    rating: { type: "integer", minimum: 1, maximum: 5 },
    role: { enum: ["subject", "style", "composition", "palette", "other"] },
    tool: { type: "string", maxLength: 200 },
    model: { type: "string", maxLength: 200 },
    from: {
      anyOf: [
        { type: "string", format: "date" },
        { type: "string", format: "date-time" },
      ],
    },
    to: {
      anyOf: [
        { type: "string", format: "date" },
        { type: "string", format: "date-time" },
      ],
    },
    cursor: { type: "string", maxLength: 256 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
} as const;

export const curationPatchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["expectedRevision", "patch"],
  properties: {
    expectedRevision: { type: "integer", minimum: 0 },
    patch: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: {
        title: { type: "string", maxLength: 300 },
        status: { enum: ["active", "shelved"] },
        tags: {
          type: "array",
          maxItems: 100,
          items: { type: "string", minLength: 1, maxLength: 100 },
        },
        favorite: { type: "boolean" },
        note: { type: "string", maxLength: 20000 },
        rating: { anyOf: [{ type: "integer", minimum: 1, maximum: 5 }, { type: "null" }] },
        hidden: { type: "boolean" },
      },
    },
  },
} as const;

export const draftPutSchema = {
  type: "object",
  additionalProperties: false,
  required: ["expectedContentSha256", "content", "basedOnRevisionId"],
  properties: {
    expectedContentSha256: { type: "string", pattern: sha256 },
    content: { type: "string", maxLength: 1000000 },
    basedOnRevisionId: { anyOf: [{ type: "string", pattern: uuid }, { type: "null" }] },
  },
} as const;
