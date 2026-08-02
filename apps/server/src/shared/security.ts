import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { SecurityBoundaryError } from "./errors.js";

const publicPaths = new Set(["/health", "/ready", "/api/v1/health", "/api/v1/bootstrap"]);

function equalToken(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export class SecurityContext {
  readonly #sessionToken: string;
  readonly #hosts = new Set<string>();
  readonly #origins = new Set<string>();

  constructor(sessionToken: string) {
    this.#sessionToken = sessionToken;
  }

  get sessionToken(): string {
    return this.#sessionToken;
  }

  allowHost(host: string): void {
    this.#hosts.add(host.toLowerCase());
  }

  allowOrigin(origin: string): void {
    this.#origins.add(new URL(origin).host.toLowerCase());
  }

  validate(request: FastifyRequest): void {
    const host = request.headers.host?.toLowerCase();
    if (!host || !this.#hosts.has(host)) throw new SecurityBoundaryError("INVALID_HOST");

    const origin = request.headers.origin;
    if (origin) {
      let originHost: string;
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== "http:") throw new TypeError("Unsupported local origin protocol");
        originHost = parsed.host.toLowerCase();
      } catch {
        throw new SecurityBoundaryError("INVALID_ORIGIN");
      }
      if (!this.#hosts.has(originHost) && !this.#origins.has(originHost)) {
        throw new SecurityBoundaryError("INVALID_ORIGIN");
      }
    }

    const pathname = request.url.split("?", 1)[0] ?? request.url;
    const imageContent = /^\/api\/v1\/images\/[0-9a-f]{64}\/content(?:\?|$)/u.test(request.url);
    const protectedApiRoute = pathname.startsWith("/api/");
    if (protectedApiRoute && !publicPaths.has(pathname) && !imageContent) {
      const header = request.headers["x-session-token"];
      const actual = Array.isArray(header) ? header[0] : header;
      if (!equalToken(actual, this.#sessionToken))
        throw new SecurityBoundaryError("INVALID_SESSION");
    }
  }
}

export function installSecurity(app: FastifyInstance, security: SecurityContext): void {
  app.addHook("onRequest", async (request, reply) => {
    security.validate(request);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
  });
}
