/** A message the user can act on, derived from an API failure. */
export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class AuthorizationError extends ApiError {
  constructor(body = "") {
    super(401, body, "Your Astria API key was rejected. Sign in again.");
    this.name = "AuthorizationError";
  }
}

export class CancelledError extends Error {
  constructor(message = "Generation cancelled.") {
    super(message);
    this.name = "CancelledError";
  }
}

export class InsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}

/** Flattens a Rails `{ error | errors | base | <field>: [...] }` body into prose; anything else is returned as is. */
export function describeApiBody(text: string): string {
  const raw = String(text || "").trim();
  if (!raw.startsWith("{")) return raw;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return raw;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item !== "string") continue;
      const plain = item.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (!plain) continue;
      parts.push(["error", "errors", "base", "message"].includes(key) ? plain : `${key} ${plain}`);
    }
  }
  return parts.join(" ") || raw;
}

export function errorMessage(error: unknown, fallback = "An unexpected error occurred."): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}

/** True when the API said the payer cannot afford the request. */
export function isBalanceError(message: string): boolean {
  return /not enough balance/i.test(message);
}
