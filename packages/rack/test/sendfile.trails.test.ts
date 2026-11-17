import { describe, it, expect } from "vitest";
import { Sendfile } from "../lib/sendfile.js";
import { Lint } from "../lib/lint.js";
import { MockRequest } from "../lib/mock-request.js";

function body() {
  const b: any = ["Hello World"];
  b.toPath = () => "/tmp/rack_sendfile";
  return b;
}

describe("Rack::Sendfile#variation", () => {
  it("prefers the configured variation over sendfile.type", async () => {
    const app = new Sendfile(async () => [200, {}, body()] as any, "x-sendfile");
    const [, headers] = await app.call({ "sendfile.type": "x-lighttpd-send-file" });
    expect(headers["x-sendfile"]).toBe("/tmp/rack_sendfile");
    expect(headers["x-lighttpd-send-file"]).toBeUndefined();
  });

  it("falls back to sendfile.type", async () => {
    const app = new Sendfile(async () => [200, {}, body()] as any);
    const [, headers] = await app.call({ "sendfile.type": "x-lighttpd-send-file" });
    expect(headers["x-lighttpd-send-file"]).toBe("/tmp/rack_sendfile");
  });
});

describe("Rack::Sendfile behind Rack::Lint", () => {
  it("passes a Lint-wrapped body that lacks to_path through untouched", async () => {
    const app = new Sendfile(
      new Lint((_env: Record<string, any>) => [
        200,
        { "content-type": "text/plain" },
        ["Hello World"],
      ]),
      "X-Sendfile",
    );
    const response = await new MockRequest(app).get("/");
    expect(response.isOk).toBe(true);
    expect(response.body).toBe("Hello World");
    expect(response.headers["x-sendfile"]).toBeUndefined();
  });
});
