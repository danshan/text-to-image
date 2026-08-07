import type { DatabaseSync } from "node:sqlite";

export const READ_MODEL_VERSION = 2;

export function createSchema(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    CREATE TABLE creations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Untitled Creation',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'shelved')),
      tags_json TEXT NOT NULL DEFAULT '[]',
      favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
      note TEXT NOT NULL DEFAULT '',
      provider_preference_json TEXT NOT NULL DEFAULT '[]',
      entity_revision INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE revisions (
      id TEXT PRIMARY KEY,
      creation_id TEXT NOT NULL,
      parent_revision_id TEXT,
      change_instruction TEXT NOT NULL,
      prompt TEXT NOT NULL,
      prompt_sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX revisions_creation ON revisions(creation_id, created_at);
    CREATE TABLE generations (
      id TEXT PRIMARY KEY,
      creation_id TEXT NOT NULL,
      prompt_revision_id TEXT NOT NULL,
      replay_of_generation_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'interrupted')),
      outcome_known INTEGER NOT NULL CHECK (outcome_known IN (0, 1)),
      provider TEXT,
      provider_source TEXT NOT NULL CHECK (provider_source IN ('recorded', 'legacy-derived', 'unknown')),
      tool_name TEXT NOT NULL,
      tool_model TEXT,
      parameters_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      error_json TEXT
    ) STRICT;
    CREATE INDEX generations_creation ON generations(creation_id, started_at DESC);
    CREATE TABLE assets (
      sha256 TEXT PRIMARY KEY,
      extension TEXT NOT NULL CHECK (extension IN ('png', 'jpg', 'webp')),
      media_type TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL,
      imported INTEGER NOT NULL DEFAULT 1 CHECK (imported IN (0, 1)),
      generation_id TEXT,
      creation_id TEXT,
      generation_status TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
      note TEXT NOT NULL DEFAULT '',
      entity_revision INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE INDEX assets_gallery ON assets(hidden, created_at DESC, sha256);
    CREATE TABLE generation_outputs (
      generation_id TEXT NOT NULL,
      output_index INTEGER NOT NULL,
      asset_sha256 TEXT NOT NULL,
      media_type TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      PRIMARY KEY (generation_id, output_index)
    ) STRICT;
    CREATE INDEX outputs_asset ON generation_outputs(asset_sha256);
    CREATE TABLE generation_references (
      generation_id TEXT NOT NULL,
      creation_id TEXT NOT NULL,
      asset_sha256 TEXT NOT NULL,
      roles_json TEXT NOT NULL,
      guidance TEXT,
      PRIMARY KEY (generation_id, asset_sha256)
    ) STRICT;
    CREATE INDEX references_asset ON generation_references(asset_sha256);
    CREATE VIRTUAL TABLE search_fts USING fts5(
      entity_type UNINDEXED,
      entity_id UNINDEXED,
      body,
      tokenize = 'unicode61'
    );
  `);
  database
    .prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?)")
    .run(String(READ_MODEL_VERSION));
  database.prepare("INSERT INTO meta(key, value) VALUES ('indexed_marker_ids', ?)").run("[]");
}
