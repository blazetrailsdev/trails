import { describe, it, expect } from "vitest";
import { SilenceRequest } from "./rack/silence-request.js";
import { MockRequest } from "@blazetrails/rack";
import type { RackBody, RackResponse } from "@blazetrails/rack";

const emptyBody = (): RackBody => ({
  async *[Symbol.asyncIterator]() {},
});

describe("RackSilenceRequestTest", () => {
  it("silence request only to specific path", async () => {
    const expected: string[] = [];
    const mockLogger = {
      expect(name: string) {
        expected.push(name);
      },
      silence(_level: number | string, fn: () => void) {
        if (expected.shift() !== "silence") throw new Error("unmocked method :silence");
        fn();
      },
      verify() {
        return expected.length === 0;
      },
    };
    mockLogger.expect("silence");

    const app = new SilenceRequest(async () => [200, {}, emptyBody()] as RackResponse, {
      path: "/up",
      logger: mockLogger,
    });

    await app.call(MockRequest.envFor("http://example.com/up"));
    await app.call(MockRequest.envFor("http://example.com/down"));

    expect(mockLogger.verify()).toBeTruthy();
  });
});
