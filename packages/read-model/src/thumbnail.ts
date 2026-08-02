import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const TRANSFORM_VERSION = 1;
const MAX_WIDTH = 720;
const MAX_HEIGHT = 720;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export class ThumbnailCache {
  readonly #directory: string;
  readonly #active = new Map<string, Promise<string>>();
  readonly #limit: number;
  #running = 0;
  readonly #waiters: Array<() => void> = [];

  constructor(libraryRoot: string, concurrency = 4) {
    this.#directory = join(resolve(libraryRoot), ".cache", "thumbnails");
    this.#limit = Math.max(1, Math.min(concurrency, 16));
  }

  pathFor(sha256: string): string {
    return join(this.#directory, `${sha256}.v${TRANSFORM_VERSION}.${MAX_WIDTH}x${MAX_HEIGHT}.webp`);
  }

  async getOrCreate(sha256: string, originalPath: string): Promise<string> {
    const destination = this.pathFor(sha256);
    if (await exists(destination)) return destination;
    const active = this.#active.get(sha256);
    if (active) return active;
    const operation = this.#create(destination, originalPath).finally(() =>
      this.#active.delete(sha256),
    );
    this.#active.set(sha256, operation);
    return operation;
  }

  async #acquire(): Promise<void> {
    if (this.#running < this.#limit) {
      this.#running += 1;
      return;
    }
    await new Promise<void>((resolveWaiter) => this.#waiters.push(resolveWaiter));
    this.#running += 1;
  }

  #release(): void {
    this.#running -= 1;
    this.#waiters.shift()?.();
  }

  async #create(destination: string, originalPath: string): Promise<string> {
    await this.#acquire();
    const temporary = `${destination}.tmp-${randomUUID()}`;
    try {
      if (await exists(destination)) return destination;
      await mkdir(this.#directory, { recursive: true });
      await sharp(originalPath, { animated: false, limitInputPixels: 100_000_000 })
        .autoOrient()
        .resize(MAX_WIDTH, MAX_HEIGHT, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4, smartSubsample: true })
        .toFile(temporary);
      await rename(temporary, destination);
      return destination;
    } finally {
      await rm(temporary, { force: true });
      this.#release();
    }
  }
}
