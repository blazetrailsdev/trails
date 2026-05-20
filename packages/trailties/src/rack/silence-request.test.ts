import { describe, it, expect } from "vitest";
import { SilenceRequest } from "./silence-request.js";
import type { RackApp, RackBody } from "@blazetrails/rack";

const emptyBody = (): RackBody => ({
  async *[Symbol.asyncIterator]() {
    /* empty */
  },
});

describe("Rack::SilenceRequest", () => {
  it("silence request only to specific path", async () => {
    const calls: string[] = [];
    const logger = {
      silence(_level: number | string, fn: () => void) {
        calls.push("silence");
        fn();
      },
    };

    const app: RackApp = async () => [200, {}, emptyBody()];

    const middleware = new SilenceRequest(app, { path: "/up", logger });

    await middleware.call({ PATH_INFO: "/up" });
    await middleware.call({ PATH_INFO: "/down" });

    expect(calls).toEqual(["silence"]);
  });

  it("prefers silenceAsync when available", async () => {
    const calls: string[] = [];
    const logger = {
      silence(_level: number | string, fn: () => void) {
        calls.push("silence");
        fn();
      },
      async silenceAsync<T>(_level: number | string, fn: () => Promise<T>): Promise<T> {
        calls.push("silenceAsync:start");
        const out = await fn();
        calls.push("silenceAsync:end");
        return out;
      },
    };

    const app: RackApp = async () => {
      calls.push("app");
      return [200, {}, emptyBody()];
    };

    const middleware = new SilenceRequest(app, { path: "/up", logger });
    await middleware.call({ PATH_INFO: "/up" });

    expect(calls).toEqual(["silenceAsync:start", "app", "silenceAsync:end"]);
  });
});
