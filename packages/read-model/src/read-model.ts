import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { assertLibraryManifestPresent, latestMarkerId, rebuildReadModel } from "./rebuild.js";
import type {
  GalleryQuery,
  IndexedCreation,
  IndexedGeneration,
  IndexedGenerationIssue,
  IndexedImage,
  IndexedRevision,
  IndexStatus,
} from "./types.js";

type SqlValue = string | number | bigint | Uint8Array | null;
type SqlRow = Record<string, SqlValue>;

function stringColumn(row: SqlRow, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function nullableStringColumn(row: SqlRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function numberColumn(row: SqlRow, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function parseJson<T>(value: SqlValue | undefined, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function offsetFromCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function cursorFromOffset(offset: number, total: number): string | null {
  return offset >= total ? null : Buffer.from(JSON.stringify(offset)).toString("base64url");
}

function ftsQuery(input: string): string {
  const tokens = input.trim().split(/\s+/u).filter(Boolean).slice(0, 20);
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
}

function toImage(row: SqlRow): IndexedImage {
  return {
    sha256: stringColumn(row, "sha256"),
    mediaType: stringColumn(row, "media_type") as IndexedImage["mediaType"],
    width: row.width === null ? null : numberColumn(row, "width"),
    height: row.height === null ? null : numberColumn(row, "height"),
    createdAt: stringColumn(row, "created_at"),
    creationId: nullableStringColumn(row, "creation_id"),
    creationTitle: stringColumn(row, "creation_title") || "Imported",
    generationId: nullableStringColumn(row, "generation_id"),
    generationStatus: nullableStringColumn(
      row,
      "generation_status",
    ) as IndexedImage["generationStatus"],
    tags: parseJson<string[]>(row.tags_json, []),
    favorite: numberColumn(row, "favorite") === 1,
    rating: row.rating === null ? null : numberColumn(row, "rating"),
    hidden: numberColumn(row, "hidden") === 1,
    note: stringColumn(row, "note"),
    entityRevision: numberColumn(row, "entity_revision"),
    imported: numberColumn(row, "imported") === 1,
    extension: stringColumn(row, "extension") as IndexedImage["extension"],
  };
}

export class ReadModel {
  readonly #root: string;
  readonly #path: string;
  #database: DatabaseSync | null = null;
  #rebuildPromise: Promise<void> | null = null;

  constructor(libraryRoot: string) {
    this.#root = resolve(libraryRoot);
    this.#path = join(this.#root, ".cache", "index.sqlite");
  }

  async open(options: { rebuildIfMissing?: boolean } = {}): Promise<void> {
    await assertLibraryManifestPresent(this.#root);
    try {
      this.#database = new DatabaseSync(this.#path, { readOnly: true });
      this.#database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    } catch (error) {
      this.close();
      if (options.rebuildIfMissing === false) throw error;
      await this.rebuild();
      return;
    }
    if ((await this.status()).lagCount > 0) await this.rebuild();
  }

  close(): void {
    this.#database?.close();
    this.#database = null;
  }

  async rebuild(): Promise<void> {
    if (this.#rebuildPromise) return this.#rebuildPromise;
    this.#rebuildPromise = this.#replaceReadModel();
    try {
      await this.#rebuildPromise;
    } finally {
      this.#rebuildPromise = null;
    }
  }

  async #replaceReadModel(): Promise<void> {
    await rebuildReadModel(this.#root);
    const replacement = new DatabaseSync(this.#path, { readOnly: true });
    const previous = this.#database;
    this.#database = replacement;
    previous?.close();
  }

  #db(): DatabaseSync {
    if (!this.#database) throw new Error("Read model is not open");
    return this.#database;
  }

  async status(): Promise<IndexStatus> {
    const latest = await latestMarkerId(this.#root);
    if (!this.#database) {
      return {
        available: false,
        latestArchiveMarker: latest,
        lastIndexedMarker: null,
        lagCount: latest ? 1 : 0,
      };
    }
    const row = this.#db()
      .prepare("SELECT value FROM meta WHERE key = 'last_indexed_marker'")
      .get() as SqlRow | undefined;
    const indexed = row ? stringColumn(row, "value") : null;
    return {
      available: true,
      latestArchiveMarker: latest,
      lastIndexedMarker: indexed,
      lagCount: latest === indexed ? 0 : latest ? 1 : 0,
    };
  }

  listGallery(query: GalleryQuery = {}): {
    items: IndexedImage[];
    total: number;
    nextCursor: string | null;
  } {
    const conditions: string[] = [];
    const parameters: SqlValue[] = [];
    let commonTableExpressions = "";
    const hidden = query.hidden ?? "exclude";
    if (hidden === "exclude") conditions.push("a.hidden = 0");
    if (hidden === "only") conditions.push("a.hidden = 1");
    if (query.creationId) {
      conditions.push("a.creation_id = ?");
      parameters.push(query.creationId);
    }
    if (query.status) {
      conditions.push("c.status = ?");
      parameters.push(query.status);
    }
    if (query.favorite !== undefined) {
      conditions.push("a.favorite = ?");
      parameters.push(query.favorite ? 1 : 0);
    }
    const source = query.source ?? "output";
    if (source !== "all")
      conditions.push(source === "imported" ? "a.imported = 1" : "a.imported = 0");
    if (query.generationStatus) {
      conditions.push("a.generation_status = ?");
      parameters.push(query.generationStatus);
    }
    for (const tag of query.tags ?? []) {
      conditions.push("a.tags_json LIKE ? ESCAPE '\\'");
      parameters.push(`%"${tag.replaceAll("%", "\\%").replaceAll("_", "\\_")}"%`);
    }
    if (query.rating !== undefined) {
      conditions.push("a.rating = ?");
      parameters.push(query.rating);
    }
    if (query.role) {
      conditions.push(`EXISTS (
        SELECT 1 FROM generation_references reference
        WHERE reference.asset_sha256 = a.sha256 AND reference.roles_json LIKE ?
      )`);
      parameters.push(`%"${query.role}"%`);
    }
    if (query.tool) {
      conditions.push("g.tool_name = ?");
      parameters.push(query.tool);
    }
    if (query.model) {
      conditions.push("g.tool_model = ?");
      parameters.push(query.model);
    }
    if (query.from) {
      conditions.push("a.created_at >= ?");
      parameters.push(query.from);
    }
    if (query.to) {
      conditions.push("a.created_at <= ?");
      parameters.push(query.to);
    }
    if (query.q?.trim()) {
      commonTableExpressions = `WITH
        search_matches(entity_type, entity_id) AS MATERIALIZED (
          SELECT entity_type, entity_id FROM search_fts WHERE search_fts MATCH ?
        ),
        matching_creations(creation_id) AS MATERIALIZED (
          SELECT entity_id FROM search_matches WHERE entity_type = 'creation'
          UNION
          SELECT revisions.creation_id
          FROM revisions
          JOIN search_matches
            ON search_matches.entity_type = 'revision' AND search_matches.entity_id = revisions.id
        )`;
      conditions.push(`(
        a.sha256 IN (SELECT entity_id FROM search_matches WHERE entity_type = 'image')
        OR a.creation_id IN (SELECT creation_id FROM matching_creations)
      )`);
      parameters.unshift(ftsQuery(query.q));
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const order =
      query.sort === "oldest"
        ? "a.created_at ASC, a.sha256 ASC"
        : query.sort === "rating_desc"
          ? "a.rating DESC NULLS LAST, a.created_at DESC, a.sha256 ASC"
          : "a.created_at DESC, a.sha256 ASC";
    const totalRow = this.#db()
      .prepare(
        `${commonTableExpressions} SELECT COUNT(*) AS total FROM assets a
      LEFT JOIN creations c ON c.id = a.creation_id
      LEFT JOIN generations g ON g.id = a.generation_id ${where}`,
      )
      .get(...parameters) as SqlRow;
    const total = numberColumn(totalRow, "total");
    const offset = offsetFromCursor(query.cursor);
    const limit = Math.min(Math.max(query.limit ?? 40, 1), 100);
    const rows = this.#db()
      .prepare(
        `${commonTableExpressions}
      SELECT a.*, COALESCE(c.title, 'Imported') AS creation_title
      FROM assets a
      LEFT JOIN creations c ON c.id = a.creation_id
      LEFT JOIN generations g ON g.id = a.generation_id
      ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `,
      )
      .all(...parameters, limit, offset) as SqlRow[];
    return {
      items: rows.map(toImage),
      total,
      nextCursor: cursorFromOffset(offset + rows.length, total),
    };
  }

  listReferences(query: GalleryQuery = {}): {
    items: IndexedImage[];
    total: number;
    nextCursor: string | null;
  } {
    const result = this.listGallery({
      ...query,
      source: "all",
      hidden: query.hidden ?? "include",
      limit: 100,
    });
    const referenced = result.items.filter((item) => {
      const row = this.#db()
        .prepare("SELECT 1 FROM generation_references WHERE asset_sha256 = ? LIMIT 1")
        .get(item.sha256);
      return item.imported || row !== undefined;
    });
    return { items: referenced, total: referenced.length, nextCursor: null };
  }

  listCreations(status?: "active" | "shelved"): IndexedCreation[] {
    const rows = this.#db()
      .prepare(
        `
      SELECT c.*,
        (SELECT COUNT(*) FROM generations g WHERE g.creation_id = c.id) AS generation_count,
        (SELECT COUNT(*) FROM assets a WHERE a.creation_id = c.id) AS image_count
      FROM creations c
      ${status ? "WHERE c.status = ?" : ""}
      ORDER BY c.created_at DESC, c.id ASC
    `,
      )
      .all(...(status ? [status] : [])) as SqlRow[];
    return rows.map((row) => ({
      id: stringColumn(row, "id"),
      createdAt: stringColumn(row, "created_at"),
      title: stringColumn(row, "title"),
      status: stringColumn(row, "status") as IndexedCreation["status"],
      tags: parseJson<string[]>(row.tags_json, []),
      favorite: numberColumn(row, "favorite") === 1,
      note: stringColumn(row, "note"),
      entityRevision: numberColumn(row, "entity_revision"),
      generationCount: numberColumn(row, "generation_count"),
      imageCount: numberColumn(row, "image_count"),
    }));
  }

  getCreation(id: string): IndexedCreation | null {
    return this.listCreations().find((creation) => creation.id === id) ?? null;
  }

  getRevisions(creationId: string): IndexedRevision[] {
    const rows = this.#db()
      .prepare("SELECT * FROM revisions WHERE creation_id = ? ORDER BY created_at, id")
      .all(creationId) as SqlRow[];
    return rows.map((row) => ({
      id: stringColumn(row, "id"),
      creationId: stringColumn(row, "creation_id"),
      parentRevisionId: nullableStringColumn(row, "parent_revision_id"),
      changeInstruction: stringColumn(row, "change_instruction"),
      prompt: stringColumn(row, "prompt"),
      promptSha256: stringColumn(row, "prompt_sha256"),
      createdAt: stringColumn(row, "created_at"),
    }));
  }

  getGeneration(id: string): IndexedGeneration | null {
    const row = this.#db().prepare("SELECT * FROM generations WHERE id = ?").get(id) as
      SqlRow | undefined;
    if (!row) return null;
    const outputRows = this.#db()
      .prepare("SELECT * FROM generation_outputs WHERE generation_id = ? ORDER BY output_index")
      .all(id) as SqlRow[];
    const referenceRows = this.#db()
      .prepare("SELECT * FROM generation_references WHERE generation_id = ? ORDER BY asset_sha256")
      .all(id) as SqlRow[];
    return {
      id: stringColumn(row, "id"),
      creationId: stringColumn(row, "creation_id"),
      promptRevisionId: stringColumn(row, "prompt_revision_id"),
      replayOfGenerationId: nullableStringColumn(row, "replay_of_generation_id"),
      status: stringColumn(row, "status") as IndexedGeneration["status"],
      outcomeKnown: numberColumn(row, "outcome_known") === 1,
      references: referenceRows.map((reference) => ({
        assetSha256: stringColumn(reference, "asset_sha256"),
        roles: parseJson<IndexedGeneration["references"][number]["roles"]>(
          reference.roles_json,
          [],
        ),
        guidance: nullableStringColumn(reference, "guidance"),
      })),
      outputs: outputRows.map((output) => ({
        index: numberColumn(output, "output_index"),
        assetSha256: stringColumn(output, "asset_sha256"),
        mediaType: stringColumn(
          output,
          "media_type",
        ) as IndexedGeneration["outputs"][number]["mediaType"],
        width: numberColumn(output, "width"),
        height: numberColumn(output, "height"),
      })),
      tool: {
        name: stringColumn(row, "tool_name"),
        model: nullableStringColumn(row, "tool_model"),
        parameters: parseJson<Record<string, unknown>>(row.parameters_json, {}),
      },
      startedAt: stringColumn(row, "started_at"),
      completedAt: stringColumn(row, "completed_at"),
      error:
        row.error_json === null
          ? null
          : parseJson<IndexedGeneration["error"]>(row.error_json, null),
    };
  }

  listGenerationIssues(limit = 100): IndexedGenerationIssue[] {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const rows = this.#db()
      .prepare(
        `WITH latest AS (
          SELECT
            g.id,
            g.creation_id,
            c.title AS creation_title,
            g.status,
            g.outcome_known,
            g.completed_at,
            g.error_json,
            ROW_NUMBER() OVER (
              PARTITION BY g.creation_id
              ORDER BY g.completed_at DESC, g.id DESC
            ) AS row_number
          FROM generations g
          JOIN creations c ON c.id = g.creation_id
          WHERE c.status = 'active'
        )
        SELECT * FROM latest
        WHERE row_number = 1 AND status IN ('failed', 'interrupted')
        ORDER BY completed_at DESC, id DESC
        LIMIT ?`,
      )
      .all(boundedLimit) as SqlRow[];
    return rows.map((row) => ({
      generationId: stringColumn(row, "id"),
      creationId: stringColumn(row, "creation_id"),
      creationTitle: stringColumn(row, "creation_title") || "Untitled Creation",
      status: stringColumn(row, "status") as IndexedGenerationIssue["status"],
      outcomeKnown: numberColumn(row, "outcome_known") === 1,
      completedAt: stringColumn(row, "completed_at"),
      error:
        row.error_json === null
          ? null
          : parseJson<IndexedGenerationIssue["error"]>(row.error_json, null),
    }));
  }

  getGenerations(creationId: string): IndexedGeneration[] {
    const rows = this.#db()
      .prepare("SELECT id FROM generations WHERE creation_id = ? ORDER BY started_at DESC, id")
      .all(creationId) as SqlRow[];
    return rows.flatMap((row) => {
      const generation = this.getGeneration(stringColumn(row, "id"));
      return generation ? [generation] : [];
    });
  }

  getImage(sha256: string): IndexedImage | null {
    const row = this.#db()
      .prepare(
        `
      SELECT a.*, COALESCE(c.title, 'Imported') AS creation_title
      FROM assets a LEFT JOIN creations c ON c.id = a.creation_id
      WHERE a.sha256 = ?
    `,
      )
      .get(sha256) as SqlRow | undefined;
    return row ? toImage(row) : null;
  }

  getReferenceRelations(
    sha256: string,
  ): Array<{ generationId: string; creationId: string; roles: string[]; guidance: string | null }> {
    const rows = this.#db()
      .prepare("SELECT * FROM generation_references WHERE asset_sha256 = ? ORDER BY generation_id")
      .all(sha256) as SqlRow[];
    return rows.map((row) => ({
      generationId: stringColumn(row, "generation_id"),
      creationId: stringColumn(row, "creation_id"),
      roles: parseJson<string[]>(row.roles_json, []),
      guidance: nullableStringColumn(row, "guidance"),
    }));
  }

  contentPath(sha256: string): string | null {
    const row = this.#db().prepare("SELECT extension FROM assets WHERE sha256 = ?").get(sha256) as
      SqlRow | undefined;
    if (!row) return null;
    return join(
      this.#root,
      "assets",
      "sha256",
      sha256.slice(0, 2),
      `${sha256}.${stringColumn(row, "extension")}`,
    );
  }

  async readDraft(
    creationId: string,
  ): Promise<{ content: string; metadata: Record<string, unknown> | null }> {
    const directory = join(this.#root, "creations", creationId);
    const content = await readFile(join(directory, "prompt-draft.md"), "utf8");
    try {
      const metadata = JSON.parse(
        await readFile(join(directory, "prompt-draft.json"), "utf8"),
      ) as unknown;
      return {
        content,
        metadata:
          typeof metadata === "object" && metadata !== null
            ? (metadata as Record<string, unknown>)
            : null,
      };
    } catch {
      return { content, metadata: null };
    }
  }

  assetMediaType(path: string): IndexedImage["mediaType"] {
    const extension = extname(path).toLowerCase();
    if (extension === ".png") return "image/png";
    if (extension === ".webp") return "image/webp";
    return "image/jpeg";
  }
}
