export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
    readonly recoveryHint?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier: string) {
    super("NOT_FOUND", `${resource} was not found.`, 404, { identifier });
  }
}

export class SecurityBoundaryError extends AppError {
  constructor(code: "INVALID_HOST" | "INVALID_ORIGIN" | "INVALID_SESSION") {
    super(code, "The request did not satisfy the local service security boundary.", 403);
  }
}

export function isErrorWithCode(
  value: unknown,
): value is Error & { code: string; details?: Record<string, unknown> } {
  return value instanceof Error && "code" in value && typeof value.code === "string";
}
