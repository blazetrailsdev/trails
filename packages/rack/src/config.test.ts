import { describe, it, expect } from "vitest";
import { Config } from "./config.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::Config", () => {
  it("accept a block that modifies the environment", async () => {
    const inner = async (env: Record<string, any>) =>
      [200, { "content-type": "text/plain" }, [env["greeting"] || ""]] as [number, Record<string, string>, any];

    const app = new Config(inner, (env) => { env["greeting"] = "hello"; });
    const response = await new MockRequest((env) => app.call(env)).get("/");
    expect(response.bodyString).toBe("hello");
  });
});
