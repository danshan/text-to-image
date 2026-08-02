import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { ArchiveError } from "@text-to-image/domain";

export interface RuntimeAdapters {
  now(): string;
  uuid(): string;
  hostname(): string;
  pid: number;
}

export const defaultRuntimeAdapters: RuntimeAdapters = {
  now: () => new Date().toISOString(),
  uuid: () => randomUUID(),
  hostname: () => process.env.HOSTNAME ?? "localhost",
  pid: process.pid,
};

export function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeJsonAtomic(path: string, value: unknown): void {
  writeBytesAtomic(path, jsonBytes(value));
}

export function writeTextAtomic(path: string, value: string): void {
  writeBytesAtomic(path, Buffer.from(value, "utf8"));
}

export function writeBytesAtomic(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeBytesExclusive(temporaryPath, bytes);
  renameSync(temporaryPath, path);
  syncDirectory(dirname(path));
}

export function writeBytesExclusive(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function syncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch {
    // Directory fsync is unavailable on some best-effort platforms.
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}

export function assertContainedPath(root: string, candidate: string): string {
  const absoluteRoot = resolve(root);
  const absoluteCandidate = resolve(candidate);
  const pathFromRoot = relative(absoluteRoot, absoluteCandidate);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new ArchiveError(
      "ARCHIVE_PATH_ESCAPE",
      "Managed path escapes the canonical Library root.",
      { relativePath: pathFromRoot },
    );
  }
  return absoluteCandidate;
}

export function resolveManagedPath(root: string, posixRelativePath: string): string {
  if (
    !posixRelativePath ||
    posixRelativePath.startsWith("/") ||
    posixRelativePath.includes("\\") ||
    posixRelativePath.split("/").includes("..")
  ) {
    throw new ArchiveError(
      "ARCHIVE_PATH_ESCAPE",
      "Archive record contains an unsafe relative path.",
      { relativePath: posixRelativePath },
    );
  }
  const segments = posixRelativePath.split("/");
  const candidate = assertContainedPath(root, resolve(root, ...segments));
  let cursor = resolve(root);
  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new ArchiveError(
        "ARCHIVE_SYMLINK_FORBIDDEN",
        "Managed Library path contains a symbolic link.",
        { relativePath: relative(resolve(root), cursor).split(sep).join("/") },
      );
    }
  }
  return candidate;
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

export function isDirectoryEmpty(path: string): boolean {
  return statSync(path).isDirectory() && readdirSync(path).length === 0;
}
