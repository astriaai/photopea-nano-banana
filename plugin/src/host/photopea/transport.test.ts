import { describe, expect, it } from "vitest";
import { HostError } from "../types";
import { PhotopeaTransport, wrapScript, type HostMessage, type TransportEnvironment } from "./transport";

/** A scripted Photopea: records posted scripts and lets the test answer them. */
function fakeHost() {
  const host = {};
  const listeners = new Set<(message: HostMessage) => void>();
  const posted: string[] = [];
  let timers: { id: number; at: number; callback: () => void }[] = [];
  let now = 0;
  let timerSequence = 0;
  const env: TransportEnvironment = {
    post: (script) => posted.push(script),
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isHostSource: (source) => source === host,
    isHostOrigin: (origin) => origin === "https://www.photopea.com",
    setTimeout: (callback, ms) => {
      const id = ++timerSequence;
      timers.push({ id, at: now + ms, callback });
      return id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((timer) => timer.id !== id);
    }
  };
  const send = (data: unknown, options: { source?: unknown; origin?: string } = {}) => {
    listeners.forEach((listener) => listener({ data, source: options.source ?? host, origin: options.origin ?? "https://www.photopea.com" }));
  };
  const advance = (ms: number) => {
    now += ms;
    const due = timers.filter((timer) => timer.at <= now);
    timers = timers.filter((timer) => timer.at > now);
    due.forEach((timer) => timer.callback());
  };
  /** The request id of the last posted script. */
  const lastId = () => Number(/var __r = "@(\d+):"/.exec(posted[posted.length - 1])![1]);
  return { env, posted, send, advance, lastId };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PhotopeaTransport", () => {
  it("resolves on the end marker with the emitted values and binaries, ignoring done and pings", async () => {
    const fake = fakeHost();
    const transport = new PhotopeaTransport(fake.env);
    const pending = transport.run("__emit({a:1});");
    const id = fake.lastId();
    fake.send("MSFAPI#ping");
    fake.send("done");
    const buffer = new ArrayBuffer(8);
    fake.send(buffer);
    fake.send(`@${id}:{"a":1}`);
    fake.send(`@${id}:$`);
    fake.send("done");
    const reply = await pending;
    expect(reply.values).toEqual(['{"a":1}']);
    expect(reply.buffers).toEqual([buffer]);
    expect(reply.error).toBeNull();
    expect(wrapScript(id, "x")).toContain('app.echoToOE(__r + "$")');
  });

  it("runs one request at a time, in order", async () => {
    const fake = fakeHost();
    const transport = new PhotopeaTransport(fake.env);
    const first = transport.run("first");
    const second = transport.run("second");
    expect(fake.posted).toHaveLength(1);
    const firstId = fake.lastId();
    fake.send(`@${firstId}:$`);
    await first;
    expect(fake.posted).toHaveLength(2);
    const secondId = fake.lastId();
    expect(secondId).toBe(firstId + 1);
    fake.send(`@${secondId}:{"ok":true}`);
    fake.send(`@${secondId}:$`);
    expect((await second).values).toEqual(['{"ok":true}']);
  });

  it("ignores messages from other windows and origins", async () => {
    const fake = fakeHost();
    const transport = new PhotopeaTransport(fake.env);
    const pending = transport.run("x");
    const id = fake.lastId();
    fake.send(`@${id}:$`, { source: {} });
    fake.send(`@${id}:$`, { origin: "https://evil.example" });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);
    fake.send(`@${id}:$`);
    await pending;
  });

  it("times out, then requires a ping before the next request and drops late output", async () => {
    const late: number[] = [];
    const fake = fakeHost();
    const transport = new PhotopeaTransport(fake.env, { onLateReply: (id) => late.push(id) });
    const first = transport.run("slow");
    const firstId = fake.lastId();
    fake.advance(20_000);
    await expect(first).rejects.toMatchObject({ code: "timeout" });
    expect(transport.needsRecovery).toBe(true);

    const second = transport.run("next");
    // A ping goes out first, not the request.
    expect(fake.posted).toHaveLength(2);
    expect(fake.posted[1]).toContain("pong");
    const pingId = fake.lastId();
    // Late output of the timed-out request is ignored.
    fake.send(`@${firstId}:{"late":true}`);
    fake.send(`@${firstId}:$`);
    expect(late).toEqual([firstId, firstId]);
    fake.send(`@${pingId}:{"pong":true}`);
    fake.send(`@${pingId}:$`);
    await flush();
    expect(transport.needsRecovery).toBe(false);
    expect(fake.posted).toHaveLength(3);
    const secondId = fake.lastId();
    fake.send(`@${secondId}:$`);
    await second;
  });

  it("fails queued requests when the recovery ping also times out", async () => {
    const fake = fakeHost();
    const transport = new PhotopeaTransport(fake.env);
    const first = transport.run("slow");
    fake.advance(20_000);
    await expect(first).rejects.toBeInstanceOf(HostError);
    const second = transport.run("next");
    fake.advance(5_000);
    await expect(second).rejects.toMatchObject({ code: "unavailable" });
    expect(transport.needsRecovery).toBe(true);
  });

  it("reports a caught script error", async () => {
    const fake = fakeHost();
    const transport = new PhotopeaTransport(fake.env);
    const pending = transport.run("throw");
    const id = fake.lastId();
    fake.send(`@${id}:!boom`);
    fake.send(`@${id}:$`);
    expect((await pending).error).toBe("boom");
  });

  it("rejects everything on dispose", async () => {
    const fake = fakeHost();
    const transport = new PhotopeaTransport(fake.env);
    const first = transport.run("a");
    const second = transport.run("b");
    transport.dispose();
    await expect(first).rejects.toMatchObject({ code: "unavailable" });
    await expect(second).rejects.toMatchObject({ code: "unavailable" });
    await expect(transport.run("c")).rejects.toMatchObject({ code: "unavailable" });
  });
});
