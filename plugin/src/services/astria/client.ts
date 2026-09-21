// HTTP client for api.astria.ai. Authorization and workspace headers are built
// per request from the credentials handed in, never kept on a shared instance,
// so a job keeps the account and workspace it started with and a sign-out
// leaves nothing behind.

import { ApiError, AuthorizationError, describeApiBody } from "../../domain/errors";

export const PRODUCTION_API_URL = "https://api.astria.ai/";

export type Credentials = {
  apiKey: string;
  /** Workspace id sent as X-Workspace-Id, or "" for Personal. */
  workspaceId?: string;
};

export type RequestInit2 = {
  method?: "GET" | "POST" | "DELETE";
  body?: FormData | string;
  json?: boolean;
  signal?: AbortSignal;
};

export class AstriaClient {
  readonly baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(baseUrl = PRODUCTION_API_URL, fetchImpl: typeof fetch = (input, init) => fetch(input, init)) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.fetchImpl = fetchImpl;
  }

  /** A raw request through the same fetch implementation (result image downloads). */
  fetchRaw(input: string, init?: RequestInit): Promise<Response> {
    return this.fetchImpl(input, init);
  }

  url(path: string): string {
    return this.baseUrl + path.replace(/^\/+/, "");
  }

  headers(credentials: Credentials, json = false): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.apiKey}`
    };
    if (credentials.workspaceId) headers["X-Workspace-Id"] = credentials.workspaceId;
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  /** Performs the request and returns the parsed JSON body; API failures become ApiError / AuthorizationError. */
  async request<T = unknown>(path: string, credentials: Credentials, init: RequestInit2 = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path), {
        method: init.method ?? "GET",
        headers: this.headers(credentials, init.json),
        body: init.body,
        signal: init.signal,
        credentials: "omit"
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError(0, "", "astria.ai could not be reached. Check your connection and try again.");
    }
    const text = await response.text().catch(() => "");
    if (response.ok) {
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ApiError(response.status, text, "astria.ai returned an unreadable reply.");
      }
    }
    if (response.status === 401) throw new AuthorizationError(text);
    if (response.status === 500) throw new ApiError(500, text, "astria.ai had an internal error. Please try again in a few seconds.");
    const detail = describeApiBody(text).slice(0, 300);
    if (response.status === 422) throw new ApiError(422, text, detail || "astria.ai rejected the request.");
    throw new ApiError(response.status, text, detail || `astria.ai answered with HTTP ${response.status}.`);
  }
}
