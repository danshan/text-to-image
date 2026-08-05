import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { IndexDegradationCode } from "./types.js";

export interface IndexDegradationRecord {
  code: IndexDegradationCode;
  error: string;
  recordedAt: string;
}

const codes = new Set<IndexDegradationCode>([
  "INDEX_WRITER_BUSY",
  "INDEX_COORDINATOR_FAILED",
  "INDEX_PROJECTION_FAILED",
  "INDEX_REBUILD_FAILED",
]);

function statusPath(libraryRoot: string): string {
  return join(resolve(libraryRoot), ".cache", "index-degradation.json");
}

export async function recordIndexDegradation(
  libraryRoot: string,
  code: IndexDegradationCode,
  error: string,
): Promise<void> {
  const path = statusPath(libraryRoot);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({ schemaVersion: 1, code, error, recordedAt: new Date().toISOString() })}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await rename(temporaryPath, path);
}

export async function clearIndexDegradation(libraryRoot: string): Promise<void> {
  await rm(statusPath(libraryRoot), { force: true });
}

export async function readIndexDegradation(
  libraryRoot: string,
): Promise<IndexDegradationRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(statusPath(libraryRoot), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (
      value.schemaVersion !== 1 ||
      typeof value.code !== "string" ||
      !codes.has(value.code as IndexDegradationCode) ||
      typeof value.error !== "string" ||
      typeof value.recordedAt !== "string"
    ) {
      return null;
    }
    return {
      code: value.code as IndexDegradationCode,
      error: value.error,
      recordedAt: value.recordedAt,
    };
  } catch {
    return null;
  }
}
