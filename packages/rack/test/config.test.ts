import { it, expect } from "vitest";
import { Config } from "../lib/config.js";
import { MockRequest } from "../lib/mock-request.js";

it("accept a block that modifies the environment", async () => {
  const inner = async (env: Record<string, any>) =>
    [200, { "content-type": "text/plain" }, [env["greeting"] || ""]] as [
      number,
      Record<string, string>,
      any,
    ];

  const app = new Config(inner, (env) => {
    env["greeting"] = "hello";
  });
  const response = await new MockRequest(app).get("/");
  expect(response.body).toBe("hello");
});
