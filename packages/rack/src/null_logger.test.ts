import { describe, it, expect } from "vitest";
import { NullLogger } from "./null-logger.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::NullLogger", () => {
  it("act as a noop logger", async () => {
    const app = async (env: Record<string, any>) => {
      (env["rack.logger"] as any).warn("b00m");
      return [200, { "content-type": "text/plain" }, ["Hello, World!"]] as [number, Record<string, string>, any];
    };
    const logger = new NullLogger(app);
    const res = await logger.call(MockRequest.envFor("/"));
    expect(res[0]).toBe(200);
    expect(res[1]["content-type"]).toBe("text/plain");
    expect(res[2]).toEqual(["Hello, World!"]);
  });
});
