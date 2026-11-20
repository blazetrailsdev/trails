import { describe, it, expect } from "vitest";
import { Logger } from "../../lib/rack/logger.js";
import type { Tagger } from "../../lib/rack/logger.js";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationEvent as Event } from "@blazetrails/activesupport";
import type { RackApp, RackBody, RackResponse } from "@blazetrails/rack";

const emptyBody = (): RackBody => ({
  async *[Symbol.asyncIterator]() {},
});

const okApp: RackApp = async () => [200, {}, emptyBody()];

class TestLogger extends Logger {
  private _testLogger: unknown;

  constructor(logger: unknown, app: RackApp = okApp, taggers: Tagger[] | null = null) {
    super(app, taggers);
    this._testLogger = logger;
  }

  override get logger(): any {
    return this._testLogger;
  }
}

const NULL = { info() {} };

const closeBody = (body: RackBody): void => {
  (body as unknown as { close: () => void }).close();
};

describe("Rack::Logger", () => {
  it("notification", async () => {
    const events: Event[] = [];
    await Notifications.subscribed(
      (event: Event) => events.push(event),
      "request.action_dispatch",
      async () => {
        const middleware = new TestLogger(NULL);
        const [, , body] = await middleware.call({ REQUEST_METHOD: "GET" });
        closeBody(body);
      },
    );
    expect(events).toHaveLength(1);
  });

  it("notification on raise", async () => {
    const failingApp: RackApp = async () => {
      throw new Error("boom");
    };
    const popped: number[] = [];
    let captured: unknown;
    const events: Event[] = [];
    await Notifications.subscribed(
      (event: Event) => events.push(event),
      "request.action_dispatch",
      async () => {
        const middleware = new TestLogger(
          {
            info() {},
            pushTags: (...tags: string[]) => tags,
            popTags: (n = 1) => {
              popped.push(n);
              return [];
            },
          },
          failingApp,
          ["t"],
        );
        try {
          await middleware.call({ REQUEST_METHOD: "GET" });
        } catch (e) {
          captured = e;
        }
      },
    );
    expect((captured as Error).message).toBe("boom");
    expect(events).toHaveLength(1);
    expect(popped).toEqual([1]);
  });

  it("logger does not mutate app return", async () => {
    const response = Object.freeze([200, {}, emptyBody()]) as RackResponse;
    const middleware = new TestLogger(NULL, async () => response);
    const out = await middleware.call({ REQUEST_METHOD: "GET" });
    expect(out).not.toBe(response);
    expect(out[0]).toBe(200);
  });

  it("logger is flushed after request finished", async () => {
    const calls: string[] = [];
    const middleware = new TestLogger({
      info(block: () => string) {
        calls.push(block());
      },
    });
    const [, , body] = await middleware.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/x",
    });
    expect(calls[0]).toMatch(/^Started GET "\/x"/);
    closeBody(body);
  });

  it("logger pushes tags", async () => {
    const pushed: string[][] = [];
    const popped: number[] = [];
    const middleware = new TestLogger(
      {
        info() {},
        pushTags(...tags: string[]) {
          pushed.push(tags);
          return tags;
        },
        popTags(n = 1) {
          popped.push(n);
          return [];
        },
      },
      okApp,
      ["tag1", (request) => request.requestMethod, ":remoteIp"],
    );
    const [, , body] = await middleware.call({ REQUEST_METHOD: "GET", REMOTE_ADDR: "127.0.0.1" });
    expect(pushed).toEqual([["tag1", "GET", "127.0.0.1"]]);
    closeBody(body);
    expect(popped).toEqual([3]);
  });
});
