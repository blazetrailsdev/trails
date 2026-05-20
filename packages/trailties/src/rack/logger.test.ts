import { it, expect } from "vitest";
import { Logger } from "./logger.js";
import { Notifications } from "@blazetrails/activesupport";
import type { RackApp, RackResponse } from "@blazetrails/rack";

const emptyBody = (): AsyncIterable<string> => ({
  async *[Symbol.asyncIterator]() {
    /* empty */
  },
});

const okApp: RackApp = async () => [200, {}, emptyBody() as any];

it("notification", async () => {
  const events = await Notifications.collectEventsAsync("request.action_dispatch", async () => {
    const middleware = new Logger(okApp);
    const [, , body] = await middleware.call({ REQUEST_METHOD: "GET" });
    (body as unknown as { close: () => void }).close();
  });
  expect(events).toHaveLength(1);
});

it("notification on raise", async () => {
  const failingApp: RackApp = async () => {
    throw new Error("boom");
  };
  let captured: unknown;
  const events = await Notifications.collectEventsAsync("request.action_dispatch", async () => {
    const middleware = new Logger(failingApp);
    try {
      await middleware.call({ REQUEST_METHOD: "GET" });
    } catch (e) {
      captured = e;
    }
  });
  expect((captured as Error).message).toBe("boom");
  expect(events).toHaveLength(1);
});

it("logger does not mutate app return", async () => {
  const response: RackResponse = Object.freeze([200, {}, emptyBody() as any]) as RackResponse;
  const middleware = new Logger(async () => response);
  const out = await middleware.call({ REQUEST_METHOD: "GET" });
  expect(out).not.toBe(response);
  expect(out[0]).toBe(200);
});

it("logger is flushed after request finished", async () => {
  const calls: string[] = [];
  const middleware = new Logger(okApp, {
    logger: {
      info(msg) {
        calls.push(msg);
      },
    },
  });
  const [, , body] = await middleware.call({ REQUEST_METHOD: "GET", PATH_INFO: "/x" });
  expect(calls[0]).toMatch(/^Started GET "\/x"/);
  (body as unknown as { close: () => void }).close();
});

it("logger pushes tags", async () => {
  const pushed: string[][] = [];
  const popped: number[] = [];
  const middleware = new Logger(okApp, {
    logger: {
      pushTags(...tags) {
        pushed.push(tags);
        return tags;
      },
      popTags(n = 1) {
        popped.push(n);
        return [];
      },
    },
    taggers: ["tag1", (env) => String(env["REQUEST_METHOD"])],
  });
  const [, , body] = await middleware.call({ REQUEST_METHOD: "GET" });
  expect(pushed).toEqual([["tag1", "GET"]]);
  (body as unknown as { close: () => void }).close();
  expect(popped).toEqual([2]);
});
