// Application-level protocol over Photopea's live messaging. Photopea takes a
// script string by postMessage and answers with the strings the script echoes,
// the binaries it exports, and a trailing "done". "done" is not a usable
// terminator: Photopea also sends it when a document opens or closes, and a
// script that dies of an interpreter error sends nothing at all. So each
// request wraps its script with a reply prefix (`@<id>:`), ends with an
// explicit end marker, and everything else - "done", MSFAPI pings, output from
// a request that already timed out - is ignored.
//
// One request runs at a time. After a timeout the transport enters recovery:
// the next request is preceded by a ping that must be answered before
// anything else is sent, so a late reply can never satisfy a later request.

import { HostError } from "../types";
import { PRELUDE } from "./scripts";

export type HostMessage = { data: unknown; source: unknown; origin: string };

/** Everything the transport needs from the browser, injectable for tests. */
export type TransportEnvironment = {
  post(script: string): void;
  onMessage(listener: (message: HostMessage) => void): () => void;
  isHostSource(source: unknown): boolean;
  isHostOrigin(origin: string): boolean;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
};

export type ScriptReply = {
  /** JSON strings the script emitted, in order. */
  values: string[];
  /** Binaries the script exported, in order. */
  buffers: ArrayBuffer[];
  /** Message of an error the script caught, if any. */
  error: string | null;
};

export type RunOptions = {
  timeoutMs?: number;
};

type Pending = {
  id: number;
  script: string;
  timeoutMs: number;
  resolve: (reply: ScriptReply) => void;
  reject: (error: Error) => void;
};

type Active = Pending & {
  prefix: string;
  reply: ScriptReply;
  timer: number;
};

export const DEFAULT_TIMEOUT_MS = 20_000;
export const PING_TIMEOUT_MS = 5_000;

export const ALLOWED_HOST_ORIGINS = ["https://www.photopea.com", "https://photopea.com"];

export function wrapScript(id: number, body: string): string {
  return `var __r = ${JSON.stringify(`@${id}:`)};${PRELUDE}\ntry {\n${body}\n} catch (__e) { app.echoToOE(__r + "!" + String(__e && __e.message ? __e.message : __e)); }\napp.echoToOE(__r + "$");`;
}

export class PhotopeaTransport {
  private env: TransportEnvironment;
  private queue: Pending[] = [];
  private active: Active | null = null;
  private sequence = 0;
  private unsubscribe: (() => void) | null;
  private disposed = false;
  /** Set after a timeout: a ping must succeed before the next request is sent. */
  private recoveryNeeded = false;
  private onLateReply?: (id: number) => void;

  constructor(env: TransportEnvironment, options: { onLateReply?: (id: number) => void } = {}) {
    this.env = env;
    this.onLateReply = options.onLateReply;
    this.unsubscribe = env.onMessage((message) => this.handle(message));
  }

  get busy(): boolean {
    return this.active !== null || this.queue.length > 0;
  }

  get needsRecovery(): boolean {
    return this.recoveryNeeded;
  }

  /** Runs `body` inside the request wrapper; resolves with what it emitted. */
  run(body: string, options: RunOptions = {}): Promise<ScriptReply> {
    if (this.disposed) return Promise.reject(new HostError("unavailable", "The Photopea connection was closed."));
    return new Promise<ScriptReply>((resolve, reject) => {
      this.queue.push({ id: ++this.sequence, script: body, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, resolve, reject });
      this.pump();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const error = new HostError("unavailable", "The Photopea connection was closed.");
    if (this.active) {
      this.env.clearTimeout(this.active.timer);
      this.active.reject(error);
      this.active = null;
    }
    for (const pending of this.queue.splice(0)) pending.reject(error);
  }

  private pump(): void {
    if (this.active || this.disposed) return;
    const next = this.queue.shift();
    if (!next) return;
    if (this.recoveryNeeded && !isPing(next.script)) {
      // Verify a fresh handshake first; the queued request waits behind it.
      this.queue.unshift(next);
      this.queue.unshift({
        id: ++this.sequence,
        script: PING_SCRIPT,
        timeoutMs: PING_TIMEOUT_MS,
        resolve: () => {
          this.recoveryNeeded = false;
        },
        reject: () => {
          // Still unreachable: fail everything that was waiting, keep recovery armed.
          const error = new HostError("unavailable", "Photopea is not responding. Reload the plugin and try again.");
          for (const pending of this.queue.splice(0)) pending.reject(error);
        }
      });
      this.pump();
      return;
    }
    const prefix = `@${next.id}:`;
    const active: Active = {
      ...next,
      prefix,
      reply: { values: [], buffers: [], error: null },
      timer: this.env.setTimeout(() => this.timeout(next.id), next.timeoutMs)
    };
    this.active = active;
    try {
      this.env.post(wrapScript(next.id, next.script));
    } catch (error) {
      this.env.clearTimeout(active.timer);
      this.active = null;
      next.reject(error instanceof Error ? error : new Error(String(error)));
      this.pump();
    }
  }

  private timeout(id: number): void {
    const active = this.active;
    if (!active || active.id !== id) return;
    this.active = null;
    this.recoveryNeeded = true;
    active.reject(new HostError("timeout", "Photopea did not answer in time."));
    this.pump();
  }

  private finish(): void {
    const active = this.active;
    if (!active) return;
    this.env.clearTimeout(active.timer);
    this.active = null;
    active.resolve(active.reply);
    this.pump();
  }

  private handle(message: HostMessage): void {
    if (!this.env.isHostSource(message.source)) return;
    if (!this.env.isHostOrigin(message.origin)) return;
    const { data } = message;
    const active = this.active;
    if (data instanceof ArrayBuffer) {
      if (active) active.reply.buffers.push(data);
      return;
    }
    if (typeof data !== "string") return;
    if (data === "done" || data.includes("MSFAPI#")) return;
    const match = /^@(\d+):([\s\S]*)$/.exec(data);
    if (!match) return;
    const id = Number(match[1]);
    if (!active || active.id !== id) {
      this.onLateReply?.(id);
      return;
    }
    const payload = match[2];
    if (payload === "$") {
      this.finish();
    } else if (payload.startsWith("!")) {
      active.reply.error = payload.slice(1) || "Photopea reported an error.";
    } else {
      active.reply.values.push(payload);
    }
  }
}

const PING_SCRIPT = `__emit({ pong: true });`;

function isPing(script: string): boolean {
  return script === PING_SCRIPT;
}

/** The browser environment: the plugin iframe talking to its parent window. */
export function browserEnvironment(options: { hostOrigin?: string | null; allowedOrigins?: string[] } = {}): TransportEnvironment {
  const allowed = new Set(options.allowedOrigins ?? ALLOWED_HOST_ORIGINS);
  const parent = window.parent;
  const target = options.hostOrigin && allowed.has(options.hostOrigin) ? options.hostOrigin : "*";
  return {
    post: (script) => parent.postMessage(script, target),
    onMessage: (listener) => {
      const handler = (event: MessageEvent) => listener({ data: event.data, source: event.source, origin: event.origin });
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    },
    isHostSource: (source) => source === parent,
    isHostOrigin: (origin) => allowed.has(origin),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (id) => window.clearTimeout(id)
  };
}

/** The embedding page's origin when the browser exposes it, else null. */
export function detectHostOrigin(): string | null {
  try {
    const ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length > 0) return ancestors[0];
  } catch {
    // Firefox has no ancestorOrigins.
  }
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    // An opaque referrer.
  }
  return null;
}

export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
