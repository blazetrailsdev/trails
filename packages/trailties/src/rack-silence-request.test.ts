import { describe, it, expect, afterEach } from "vitest";
import { SilenceRequest } from "./rack/silence-request.js";
import { Trails } from "./trails.js";
import { Mock } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import type { RackBody, RackResponse } from "@blazetrails/rack";

const emptyBody = (): RackBody => ({
  async *[Symbol.asyncIterator]() {},
});

describe("RackSilenceRequestTest", () => {
  const logger = Trails.logger;

  afterEach(() => {
    Trails.logger = logger;
  });

  it("silence request only to specific path", async () => {
    const silence = new Mock();
    silence.expect("call", null);
    const mockLogger = { silence: () => silence.call(), verify: () => silence.verify() };

    const app = new SilenceRequest(async () => [200, {}, emptyBody()] as RackResponse, {
      path: "/up",
    });

    Trails.logger = mockLogger as unknown as typeof Trails.logger;
    await app.call(MockRequest.envFor("http://example.com/up"));
    await app.call(MockRequest.envFor("http://example.com/down"));

    expect(mockLogger.verify()).toBeTruthy();
  });
});
