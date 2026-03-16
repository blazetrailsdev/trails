import { describe, it, expect } from "vitest";
import { Events, EventResponse, type EventHandler } from "./events.js";
import { Request } from "./request.js";
import type { RackApp, RackBody } from "./index.js";

function makeHandler(events: [any, string][]): EventHandler & { self: object } {
  const handler = {
    self: {} as object,
    onStart(_req: Request, _res: EventResponse) {
      events.push([handler, "on_start"]);
    },
    onCommit(_req: Request, _res: EventResponse) {
      events.push([handler, "on_commit"]);
    },
    onSend(_req: Request, _res: EventResponse) {
      events.push([handler, "on_send"]);
    },
    onFinish(_req: Request, _res: EventResponse) {
      events.push([handler, "on_finish"]);
    },
    onError(_req: Request, _res: EventResponse, _e: Error) {
      events.push([handler, "on_error"]);
    },
  };
  handler.self = handler;
  return handler;
}

async function consumeBody(body: RackBody): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of body) {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
  }
  return chunks;
}

describe("TestEvents", () => {
  it("events fire", async () => {
    const events: [any, string][] = [];
    const appMarker = { name: "app" };
    const app: RackApp = async (_env) => {
      events.push([appMarker, "call"]);
      return [200, {}, (async function* () {})()];
    };
    const se = makeHandler(events);
    const e = new Events(app, [se]);

    const [_status, _headers, body] = await e.call({});
    await consumeBody(body);
    (body as any).close();

    expect(events.map(([_o, m]) => m)).toEqual([
      "on_start",
      "call",
      "on_commit",
      "on_send",
      "on_finish",
    ]);
  });

  it("send and finish are not run until body is sent", async () => {
    const events: [any, string][] = [];
    const app: RackApp = async (_env) => {
      events.push([null, "call"]);
      return [200, {}, (async function* () {})()];
    };
    const se = makeHandler(events);
    const e = new Events(app, [se]);

    await e.call({});
    // Body not consumed yet
    expect(events.map(([_, m]) => m)).toEqual(["on_start", "call", "on_commit"]);
  });

  it("send is called on each", async () => {
    const events: [any, string][] = [];
    const app: RackApp = async (_env) => {
      events.push([null, "call"]);
      return [200, {}, (async function* () {})()];
    };
    const se = makeHandler(events);
    const e = new Events(app, [se]);

    const [_s, _h, body] = await e.call({});
    await consumeBody(body);

    expect(events.map(([_, m]) => m)).toEqual(["on_start", "call", "on_commit", "on_send"]);
  });

  it("finish is called on close", async () => {
    const events: [any, string][] = [];
    const app: RackApp = async (_env) => {
      events.push([null, "call"]);
      return [200, {}, (async function* () {})()];
    };
    const se = makeHandler(events);
    const e = new Events(app, [se]);

    const [_s, _h, body] = await e.call({});
    await consumeBody(body);
    (body as any).close();

    expect(events.map(([_, m]) => m)).toEqual([
      "on_start",
      "call",
      "on_commit",
      "on_send",
      "on_finish",
    ]);
  });

  it("finish is called in reverse order", async () => {
    const events: [any, string][] = [];
    const app: RackApp = async (_env) => {
      events.push([null, "call"]);
      return [200, {}, (async function* () {})()];
    };
    const se1 = makeHandler(events);
    const se2 = makeHandler(events);
    const se3 = makeHandler(events);

    const e = new Events(app, [se1, se2, se3]);
    const [_s, _h, body] = await e.call({});
    await consumeBody(body);
    (body as any).close();

    const starts = events.filter(([_, m]) => m === "on_start").map(([o]) => o);
    const finishes = events.filter(([_, m]) => m === "on_finish").map(([o]) => o);
    expect(starts).toEqual(finishes.reverse());
  });

  it("finish is called if there is an exception", async () => {
    const events: [any, string][] = [];
    const app: RackApp = async () => {
      throw new Error("boom");
    };
    const se = makeHandler(events);
    const e = new Events(app, [se]);

    await expect(e.call({})).rejects.toThrow("boom");

    expect(events.map(([_, m]) => m)).toEqual(["on_start", "on_error", "on_finish"]);
  });
});
