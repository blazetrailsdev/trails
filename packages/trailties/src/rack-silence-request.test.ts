import { describe, it, expect } from "vitest";
import { SilenceRequest } from "./rack/silence-request.js";
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
        expected.splice(expected.indexOf("silence"), 1);
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

    await app.call({ PATH_INFO: "/up" });
    await app.call({ PATH_INFO: "/down" });

    expect(mockLogger.verify()).toBeTruthy();
  });
});
