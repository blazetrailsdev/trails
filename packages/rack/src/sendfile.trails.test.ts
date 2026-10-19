import { describe, it, expect } from "vitest";
import { Sendfile } from "./sendfile.js";

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
