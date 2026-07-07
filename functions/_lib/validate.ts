// Input validation. SPEC.md §3.1, §6.3.

const POOL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function isValidPoolName(name: unknown): name is string {
  return typeof name === "string" && POOL_NAME_RE.test(name);
}

export function validatePoolName(name: unknown): string {
  if (!isValidPoolName(name)) {
    throw new ValidationError(
      "pool name must match ^[a-z0-9][a-z0-9-]{0,31}$ (lowercase, digits, dashes, 1-32 chars, no leading dash)",
    );
  }
  return name;
}

const MAX_TOKENS_PER_REQUEST = 5000;
const MAX_TOKEN_LENGTH = 4096;

export function validateTokenValues(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new ValidationError("tokens must be an array of strings");
  }
  if (input.length === 0) {
    throw new ValidationError("tokens must not be empty");
  }
  if (input.length > MAX_TOKENS_PER_REQUEST) {
    throw new ValidationError(
      `too many tokens in one request (max ${MAX_TOKENS_PER_REQUEST})`,
    );
  }
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") {
      throw new ValidationError("each token must be a string");
    }
    const trimmed = t.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("token must not be empty");
    }
    if (trimmed.length > MAX_TOKEN_LENGTH) {
      throw new ValidationError(
        `token exceeds max length of ${MAX_TOKEN_LENGTH}`,
      );
    }
    out.push(trimmed);
  }
  return out;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
