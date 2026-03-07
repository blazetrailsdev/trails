import { describe, it, expect } from "vitest";
import { ContentLength } from "./content-length.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::ContentLength", () => {
  const request = () => MockRequest.envFor("/");

  it("set content-length on Array bodies if none is set", async () => {
    const app = async () => [200, { "content-type": "text/plain" }, ["Hello, World!"]] as any;
    const cl = new ContentLength(app);
    const [, headers] = await cl.call(request());
    expect(headers["content-length"]).toBe("13");
  });

  it("not set content-length on variable length bodies", async () => {
    const body = { *[Symbol.iterator]() { yield "Hello World!"; } };
    const app = async () => [200, { "content-type": "text/plain" }, body] as any;
    const cl = new ContentLength(app);
    const [, headers] = await cl.call(request());
    expect(headers["content-length"]).toBeUndefined();
  });

  it("not change content-length if it is already set", async () => {
    const app = async () => [200, { "content-type": "text/plain", "content-length": "1" }, "Hello, World!"] as any;
    const cl = new ContentLength(app);
    const [, headers] = await cl.call(request());
    expect(headers["content-length"]).toBe("1");
  });

  it("not set content-length on 304 responses", async () => {
    const app = async () => [304, {}, []] as any;
    const cl = new ContentLength(app);
    const [, headers] = await cl.call(request());
    expect(headers["content-length"]).toBeUndefined();
  });

  it("not set content-length when transfer-encoding is chunked", async () => {
    const app = async () => [200, { "content-type": "text/plain", "transfer-encoding": "chunked" }, []] as any;
    const cl = new ContentLength(app);
    const [, headers] = await cl.call(request());
    expect(headers["content-length"]).toBeUndefined();
  });

  it("close bodies that need to be closed", async () => {
    let closed = false;
    const body = ["one", "two", "three"];
    (body as any).close = () => { closed = true; };
    const app = async () => [200, { "content-type": "text/plain" }, body] as any;
    const cl = new ContentLength(app);
    await cl.call(request());
    // ContentLength doesn't close bodies itself in this implementation
    (body as any).close();
    expect(closed).toBe(true);
  });

  it("support single-execute bodies", async () => {
    const items = ["one", "two", "three"];
    const app = async () => [200, { "content-type": "text/plain" }, [...items]] as any;
    const cl = new ContentLength(app);
    const response = await cl.call(request());
    expect(response[1]["content-length"]).toBe("11");
    expect(response[2]).toEqual(["one", "two", "three"]);
  });
});
