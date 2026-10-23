import { describe, it, expect } from "vitest";
import { Events, BufferedResponse, type EventHandler } from "./events.js";
import { Request } from "./request.js";
import type { RackApp, RackBody } from "./index.js";
import { groupBy } from "@blazetrails/ruby-compat";

function makeHandler(events: [any, string][]): EventHandler & { self: object } {
  const handler = {
    self: {} as object,
    onStart(_req: Request, _res: BufferedResponse) {
      events.push([handler, "on_start"]);
    },
    onCommit(_req: Request, _res: BufferedResponse) {
      events.push([handler, "on_commit"]);
    },
    onSend(_req: Request, _res: BufferedResponse) {
      events.push([handler, "on_send"]);
    },
    onFinish(_req: Request, _res: BufferedResponse) {
      events.push([handler, "on_finish"]);
    },
    onError(_req: Request, _res: BufferedResponse, _e: Error) {
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
    const ret: [number, Record<string, string>, any] = [200, {}, []];
    const app: RackApp = async (_env) => {
      events.push([app, "call"]);
      return ret;
    };
    const se = makeHandler(events);
    const e = new Events(app, [se]);
    const triple = await e.call({});
    const responseBody = await consumeBody(triple[2]);
    (triple[2] as any).close();
    triple[2] = responseBody;
    expect(triple).toEqual(ret);
    expect(events).toEqual([
      [se, "on_start"],
      [app, "call"],
      [se, "on_commit"],
      [se, "on_send"],
      [se, "on_finish"],
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
    const ret: [number, Record<string, string>, any] = [200, {}, []];
    const app: RackApp = async (_env) => {
      events.push([app, "call"]);
      return ret;
    };
    const se1 = makeHandler(events);
    const se2 = makeHandler(events);
    const se3 = makeHandler(events);

    const e = new Events(app, [se1, se2, se3]);
    const triple = await e.call({});
    await consumeBody(triple[2]);
    (triple[2] as any).close();

    const groups = groupBy(events, (x) => x[1]);
    expect(groups.get("on_start")!.map((x) => x[0])).toEqual(
      groups
        .get("on_finish")!
        .map((x) => x[0])
        .reverse(),
    );
    expect(groups.get("on_commit")!.map((x) => x[0])).toEqual(
      groups.get("on_finish")!.map((x) => x[0]),
    );
    expect(groups.get("on_send")!.map((x) => x[0])).toEqual(
      groups.get("on_finish")!.map((x) => x[0]),
    );
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
