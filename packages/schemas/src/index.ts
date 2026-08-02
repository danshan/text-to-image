import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

export const SCHEMA_FILENAMES = {
  library: "library.schema.json",
  creation: "creation.schema.json",
  draft: "draft.schema.json",
  revision: "revision.schema.json",
  generation: "generation.schema.json",
  commit: "commit.schema.json",
  transaction: "transaction.schema.json",
  creationCuration: "creation-curation.schema.json",
  imageCuration: "image-curation.schema.json",
} as const;

export type SchemaKind = keyof typeof SCHEMA_FILENAMES;

export interface SchemaValidationIssue {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params: Record<string, unknown>;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaValidationIssue[];
}

export interface SchemaRegistry {
  readonly schemaDirectory: string;
  validate(kind: SchemaKind, value: unknown): SchemaValidationResult;
  assert(kind: SchemaKind, value: unknown): void;
}

export class RecordSchemaError extends Error {
  readonly kind: SchemaKind;
  readonly issues: SchemaValidationIssue[];

  constructor(kind: SchemaKind, issues: SchemaValidationIssue[]) {
    super(`Record does not match the ${kind} schema.`);
    this.name = "RecordSchemaError";
    this.kind = kind;
    this.issues = issues;
  }
}

export function defaultSchemaDirectory(): string {
  return fileURLToPath(new URL("../../../schemas/asset-library/v1/", import.meta.url));
}

export function createSchemaRegistry(schemaDirectory = defaultSchemaDirectory()): SchemaRegistry {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: true,
  });
  const addFormats = addFormatsModule as unknown as (
    instance: Ajv2020,
    options: { mode: "full" },
  ) => Ajv2020;
  addFormats(ajv, { mode: "full" });

  const schemas = new Map<string, Record<string, unknown>>();
  for (const filename of readdirSync(schemaDirectory).sort()) {
    if (!filename.endsWith(".schema.json")) {
      continue;
    }
    const schema = JSON.parse(readFileSync(join(schemaDirectory, filename), "utf8")) as Record<
      string,
      unknown
    >;
    schemas.set(filename, schema);
    ajv.addSchema(schema);
  }

  const validators = new Map<SchemaKind, ValidateFunction>();
  for (const [kind, filename] of Object.entries(SCHEMA_FILENAMES) as [SchemaKind, string][]) {
    const schema = schemas.get(filename);
    if (!schema) {
      throw new Error(`Missing schema file: ${filename}`);
    }
    validators.set(kind, ajv.getSchema(String(schema.$id)) ?? ajv.compile(schema));
  }

  const validate = (kind: SchemaKind, value: unknown): SchemaValidationResult => {
    const validator = validators.get(kind);
    if (!validator) {
      throw new Error(`Unknown schema kind: ${kind}`);
    }
    const valid = validator(value);
    return {
      valid: Boolean(valid),
      issues: valid ? [] : mapErrors(validator.errors),
    };
  };

  return {
    schemaDirectory,
    validate,
    assert(kind, value) {
      const result = validate(kind, value);
      if (!result.valid) {
        throw new RecordSchemaError(kind, result.issues);
      }
    },
  };
}

function mapErrors(errors: ErrorObject[] | null | undefined): SchemaValidationIssue[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "Schema validation failed.",
    params: error.params as Record<string, unknown>,
  }));
}
