import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { lstat, mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { createSchema } from "./schema.js";
import type { IndexProgress } from "./types.js";

interface MarkerRecord {
  kind: string;
  path: string;
  sha256: string;
}

interface CommitMarker {
  id: string;
  createdAt: string;
  records: MarkerRecord[];
}

type JsonRecord = Record<string, unknown>;

function isObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: JsonRecord, key: string, fallback = ""): string {
  return typeof record[key] === "string" ? record[key] : fallback;
}

function nullableString(record: JsonRecord, key: string): string | null {
  return record[key] === null || record[key] === undefined ? null : stringValue(record, key);
}

function booleanValue(record: JsonRecord, key: string, fallback = false): boolean {
  return typeof record[key] === "boolean" ? record[key] : fallback;
}

function numberValue(record: JsonRecord, key: string): number | null {
  return typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : null;
}

function jsonText(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback);
}

async function readJson(path: string): Promise<JsonRecord> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isObject(parsed)) {
    throw new TypeError(`Expected a JSON object at ${path}`);
  }
  return parsed;
}

function safePath(root: string, relativePath: string): string {
  if (
    relativePath.includes("\\") ||
    relativePath.startsWith("/") ||
    relativePath.split("/").includes("..")
  ) {
    throw new TypeError(`Unsafe archive path: ${relativePath}`);
  }
  const candidate = resolve(root, relativePath);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (candidate !== root && !candidate.startsWith(prefix)) {
    throw new TypeError(`Archive path escapes the Library: ${relativePath}`);
  }
  return candidate;
}

async function rejectManagedSymlink(root: string, relativePath: string): Promise<void> {
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink())
      throw new TypeError(`Managed Archive path contains a symlink: ${relativePath}`);
  }
}

async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(directory, entry.name))
      .sort();
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

function mediaFromExtension(extension: string): "image/png" | "image/jpeg" | "image/webp" {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function normalizedExtension(path: string): "png" | "jpg" | "webp" {
  const extension = extname(path).slice(1).toLowerCase();
  if (extension === "jpeg") return "jpg";
  if (extension === "png" || extension === "jpg" || extension === "webp") return extension;
  throw new TypeError(`Unsupported indexed image extension: ${extension}`);
}

async function indexMarker(
  database: DatabaseSync,
  root: string,
  marker: CommitMarker,
): Promise<void> {
  for (const record of marker.records) {
    await rejectManagedSymlink(root, record.path);
    const bytes = await readFile(safePath(root, record.path));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== record.sha256) {
      throw new TypeError(`Committed record digest mismatch: ${record.path}`);
    }
  }
  const promptByDirectory = new Map<string, string>();
  for (const record of marker.records) {
    if (record.kind === "prompt" || record.path.endsWith("/prompt.md")) {
      promptByDirectory.set(
        dirname(record.path),
        await readFile(safePath(root, record.path), "utf8"),
      );
    }
  }

  for (const record of marker.records) {
    const absolutePath = safePath(root, record.path);
    if (record.kind === "creation" || record.path.endsWith("/creation.json")) {
      const value = await readJson(absolutePath);
      database
        .prepare("INSERT OR IGNORE INTO creations(id, created_at) VALUES (?, ?)")
        .run(stringValue(value, "id"), stringValue(value, "createdAt"));
      continue;
    }
    if (
      record.kind === "revision" ||
      record.kind === "prompt_revision" ||
      record.path.endsWith("/revision.json")
    ) {
      const value = await readJson(absolutePath);
      const prompt = promptByDirectory.get(dirname(record.path)) ?? "";
      database
        .prepare(
          `INSERT OR IGNORE INTO revisions(
          id, creation_id, parent_revision_id, change_instruction, prompt, prompt_sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          stringValue(value, "id"),
          stringValue(value, "creationId"),
          nullableString(value, "parentRevisionId"),
          stringValue(value, "changeInstruction"),
          prompt,
          stringValue(value, "promptSha256"),
          stringValue(value, "createdAt"),
        );
      continue;
    }
    if (record.kind === "generation" || record.path.endsWith("/generation.json")) {
      const value = await readJson(absolutePath);
      const tool = isObject(value.tool) ? value.tool : {};
      database
        .prepare(
          `INSERT OR IGNORE INTO generations(
          id, creation_id, prompt_revision_id, replay_of_generation_id, status, outcome_known,
          tool_name, tool_model, parameters_json, started_at, completed_at, error_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          stringValue(value, "id"),
          stringValue(value, "creationId"),
          stringValue(value, "promptRevisionId"),
          nullableString(value, "replayOfGenerationId"),
          stringValue(value, "status"),
          booleanValue(value, "outcomeKnown") ? 1 : 0,
          stringValue(tool, "name", "unknown"),
          nullableString(tool, "model"),
          jsonText(tool.parameters, {}),
          stringValue(value, "startedAt"),
          stringValue(value, "completedAt"),
          value.error === null || value.error === undefined ? null : jsonText(value.error, {}),
        );

      const outputs = Array.isArray(value.outputs) ? value.outputs.filter(isObject) : [];
      for (const output of outputs) {
        const assetSha256 = stringValue(output, "assetSha256");
        const mediaType = stringValue(output, "mediaType", "image/png");
        database
          .prepare(
            `INSERT OR REPLACE INTO generation_outputs(
            generation_id, output_index, asset_sha256, media_type, width, height
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            stringValue(value, "id"),
            numberValue(output, "index") ?? 0,
            assetSha256,
            mediaType,
            numberValue(output, "width") ?? 0,
            numberValue(output, "height") ?? 0,
          );
        database
          .prepare(
            `UPDATE assets SET imported = 0, generation_id = ?, creation_id = ?, generation_status = ?,
            media_type = ?, width = ?, height = ? WHERE sha256 = ?`,
          )
          .run(
            stringValue(value, "id"),
            stringValue(value, "creationId"),
            stringValue(value, "status"),
            mediaType,
            numberValue(output, "width"),
            numberValue(output, "height"),
            assetSha256,
          );
      }

      const references = Array.isArray(value.references) ? value.references.filter(isObject) : [];
      for (const reference of references) {
        database
          .prepare(
            `INSERT OR REPLACE INTO generation_references(
            generation_id, creation_id, asset_sha256, roles_json, guidance
          ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            stringValue(value, "id"),
            stringValue(value, "creationId"),
            stringValue(reference, "assetSha256"),
            jsonText(reference.roles, []),
            nullableString(reference, "guidance"),
          );
      }
      continue;
    }
    if (record.kind === "image_asset" || record.path.startsWith("assets/sha256/")) {
      const extension = normalizedExtension(record.path);
      database
        .prepare(
          `INSERT OR IGNORE INTO assets(
          sha256, extension, media_type, created_at
        ) VALUES (?, ?, ?, ?)`,
        )
        .run(record.sha256, extension, mediaFromExtension(extension), marker.createdAt);
    }
  }

  database.exec(`
    UPDATE assets SET
      imported = 0,
      generation_id = (
        SELECT generation_id FROM generation_outputs WHERE asset_sha256 = assets.sha256
        ORDER BY generation_id LIMIT 1
      ),
      creation_id = (
        SELECT g.creation_id FROM generation_outputs o
        JOIN generations g ON g.id = o.generation_id
        WHERE o.asset_sha256 = assets.sha256 ORDER BY g.id LIMIT 1
      ),
      generation_status = (
        SELECT g.status FROM generation_outputs o
        JOIN generations g ON g.id = o.generation_id
        WHERE o.asset_sha256 = assets.sha256 ORDER BY g.id LIMIT 1
      ),
      media_type = COALESCE((
        SELECT media_type FROM generation_outputs WHERE asset_sha256 = assets.sha256
        ORDER BY generation_id LIMIT 1
      ), media_type),
      width = COALESCE((
        SELECT width FROM generation_outputs WHERE asset_sha256 = assets.sha256
        ORDER BY generation_id LIMIT 1
      ), width),
      height = COALESCE((
        SELECT height FROM generation_outputs WHERE asset_sha256 = assets.sha256
        ORDER BY generation_id LIMIT 1
      ), height)
    WHERE EXISTS (SELECT 1 FROM generation_outputs WHERE asset_sha256 = assets.sha256);
  `);
  database
    .prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('last_indexed_marker', ?)")
    .run(marker.id);
}

async function applyCuration(database: DatabaseSync, root: string): Promise<void> {
  for (const path of await listJsonFiles(join(root, "curation", "creations"))) {
    const value = await readJson(path);
    database
      .prepare(
        `UPDATE creations SET title = ?, status = ?, tags_json = ?, favorite = ?, note = ?,
        entity_revision = ? WHERE id = ?`,
      )
      .run(
        stringValue(value, "title", "Untitled Creation"),
        stringValue(value, "status", "active"),
        jsonText(value.tags, []),
        booleanValue(value, "favorite") ? 1 : 0,
        stringValue(value, "note"),
        numberValue(value, "entityRevision") ?? 0,
        stringValue(value, "creationId"),
      );
  }
  for (const path of await listJsonFiles(join(root, "curation", "images"))) {
    const value = await readJson(path);
    database
      .prepare(
        `UPDATE assets SET tags_json = ?, favorite = ?, rating = ?, hidden = ?, note = ?,
        entity_revision = ? WHERE sha256 = ?`,
      )
      .run(
        jsonText(value.tags, []),
        booleanValue(value, "favorite") ? 1 : 0,
        numberValue(value, "rating"),
        booleanValue(value, "hidden") ? 1 : 0,
        stringValue(value, "note"),
        numberValue(value, "entityRevision") ?? 0,
        stringValue(value, "assetSha256"),
      );
  }
}

function rebuildSearch(database: DatabaseSync): void {
  database.exec("DELETE FROM search_fts");
  database.exec(`
    INSERT INTO search_fts(entity_type, entity_id, body)
      SELECT 'creation', id, title || ' ' || tags_json || ' ' || note FROM creations;
    INSERT INTO search_fts(entity_type, entity_id, body)
      SELECT 'revision', id, change_instruction || ' ' || prompt FROM revisions;
    INSERT INTO search_fts(entity_type, entity_id, body)
      SELECT 'image', sha256, tags_json || ' ' || note FROM assets;
  `);
}

function asCommitMarker(value: JsonRecord, path: string): CommitMarker {
  const recordsValue = value.records;
  if (!Array.isArray(recordsValue))
    throw new TypeError(`Commit Marker records must be an array: ${path}`);
  const records = recordsValue.map((item) => {
    if (!isObject(item)) throw new TypeError(`Invalid Commit Marker record: ${path}`);
    return {
      kind: stringValue(item, "kind"),
      path: stringValue(item, "path"),
      sha256: stringValue(item, "sha256"),
    };
  });
  return {
    id: stringValue(value, "id", basename(path, ".json")),
    createdAt: stringValue(value, "createdAt"),
    records,
  };
}

async function flushFile(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function rebuildReadModel(
  libraryRoot: string,
  onProgress?: (progress: IndexProgress) => void,
): Promise<string> {
  const root = resolve(libraryRoot);
  const cacheDirectory = join(root, ".cache");
  await mkdir(cacheDirectory, { recursive: true });
  const finalPath = join(cacheDirectory, "index.sqlite");
  const temporaryPath = join(cacheDirectory, `index.sqlite.rebuild-${process.pid}-${Date.now()}`);
  const database = new DatabaseSync(temporaryPath);
  try {
    createSchema(database);
    const markerPaths = await listJsonFiles(join(root, "archive", "commits"));
    for (const [index, markerPath] of markerPaths.entries()) {
      const marker = asCommitMarker(await readJson(markerPath), markerPath);
      if (basename(markerPath, ".json") !== marker.id) {
        throw new TypeError(`Commit Marker filename does not match its id: ${markerPath}`);
      }
      database.exec("BEGIN IMMEDIATE");
      try {
        await indexMarker(database, root, marker);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      onProgress?.({ processed: index + 1, total: markerPaths.length, markerId: marker.id });
    }
    await applyCuration(database, root);
    rebuildSearch(database);
    database
      .prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('rebuilt_at', ?)")
      .run(new Date().toISOString());
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    database.close();
  }
  await flushFile(temporaryPath);
  await rename(temporaryPath, finalPath);
  await rm(`${temporaryPath}-wal`, { force: true });
  await rm(`${temporaryPath}-shm`, { force: true });
  return finalPath;
}

export async function latestMarkerId(libraryRoot: string): Promise<string | null> {
  const markers = await listJsonFiles(join(resolve(libraryRoot), "archive", "commits"));
  return markers.length === 0 ? null : basename(markers.at(-1) ?? "", ".json");
}

export function relativeIndexPath(libraryRoot: string, indexPath: string): string {
  return relative(resolve(libraryRoot), resolve(indexPath)).split(sep).join("/");
}
