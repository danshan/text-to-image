import { readFileSync, realpathSync, statSync } from "node:fs";
import { ArchiveError, type ImageInspection } from "@text-to-image/domain";
import { inspectImage } from "./image.js";
import { sha256Bytes } from "./internal.js";

export interface ImageSourceInspection extends ImageInspection {
  sourcePath: string;
  assetSha256: string;
  byteLength: number;
}

interface ReadImageSourceResult {
  bytes: Buffer;
  inspection: ImageSourceInspection;
}

export function inspectImageSource(sourcePath: string): ImageSourceInspection {
  return readImageSource(sourcePath).inspection;
}

export function readImageSource(sourcePath: string): ReadImageSourceResult {
  const canonicalSourcePath = canonicalizeImageSource(sourcePath);
  assertRegularFile(canonicalSourcePath, sourcePath);
  const bytes = readSourceBytes(canonicalSourcePath, sourcePath);
  const inspection = inspectImage(bytes, canonicalSourcePath);
  return {
    bytes,
    inspection: {
      ...inspection,
      sourcePath: canonicalSourcePath,
      assetSha256: sha256Bytes(bytes),
      byteLength: bytes.byteLength,
    },
  };
}

function canonicalizeImageSource(sourcePath: string): string {
  try {
    return realpathSync(sourcePath);
  } catch (error) {
    throwSourceAccessError(error, sourcePath);
  }
}

function assertRegularFile(canonicalSourcePath: string, requestedSourcePath: string): void {
  try {
    if (statSync(canonicalSourcePath).isFile()) return;
  } catch (error) {
    throwSourceAccessError(error, requestedSourcePath);
  }
  throw new ArchiveError(
    "IMAGE_SOURCE_UNREADABLE",
    "Image source must be a readable regular file.",
    { sourcePath: requestedSourcePath },
  );
}

function readSourceBytes(canonicalSourcePath: string, requestedSourcePath: string): Buffer {
  try {
    return readFileSync(canonicalSourcePath);
  } catch (error) {
    throwSourceAccessError(error, requestedSourcePath);
  }
}

function throwSourceAccessError(error: unknown, sourcePath: string): never {
  const code = isNodeError(error) ? error.code : undefined;
  if (code === "ENOENT" || code === "ENOTDIR") {
    throw new ArchiveError("IMAGE_SOURCE_MISSING", "Image source does not exist.", {
      sourcePath,
    });
  }
  if (code === "EACCES" || code === "EPERM") {
    throw new ArchiveError("IMAGE_SOURCE_UNREADABLE", "Image source is not readable.", {
      sourcePath,
      cause: code,
    });
  }
  throw new ArchiveError("IMAGE_SOURCE_UNREADABLE", "Image source could not be read.", {
    sourcePath,
    cause: code ?? "UNKNOWN",
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
