import { describe, it, expect } from "vitest";
import { ContentType } from "./content-type.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::ContentType", () => {
  const request = () => MockRequest.envFor("/");

  it("set content-type to default text/html if none is set", async () => {
    const app = async () => [200, {}, "Hello, World!"] as any;
    const ct = new ContentType(app);
    const [, headers] = await ct.call(request());
    expect(headers["content-type"]).toBe("text/html");
  });

  it("set content-type to chosen default if none is set", async () => {
    const app = async () => [200, {}, "Hello, World!"] as any;
    const ct = new ContentType(app, "application/octet-stream");
    const [, headers] = await ct.call(request());
    expect(headers["content-type"]).toBe("application/octet-stream");
  });

  it("not change content-type if it is already set", async () => {
    const app = async () => [200, { "content-type": "foo/bar" }, "Hello, World!"] as any;
    const ct = new ContentType(app);
    const [, headers] = await ct.call(request());
    expect(headers["content-type"]).toBe("foo/bar");
  });

  for (const code of [100, 204, 304]) {
    it(`not set content-type on ${code} responses`, async () => {
      const app = async () => [code, {}, []] as any;
      const ct = new ContentType(app, "text/html");
      const [, headers] = await ct.call(request());
      expect(headers["content-type"]).toBeUndefined();
    });
  }
});
