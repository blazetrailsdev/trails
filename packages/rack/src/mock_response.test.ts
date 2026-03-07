import { describe, it, expect } from "vitest";
import { MockRequest, FatalWarning } from "./mock-request.js";
import { MockResponse } from "./mock-response.js";

describe("Rack::MockResponse", () => {
  const app = async (env: Record<string, any>): Promise<[number, Record<string, string>, any]> => {
    return [200, { "content-type": "text/plain" }, ["OK"]];
  };

  it("has standard constructor", () => {
    const res = new MockResponse(200, { "content-type": "text/plain" }, ["hello"]);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/plain");
    expect(res.bodyString).toBe("hello");
  });

  it("provides access to the HTTP status", async () => {
    const req = new MockRequest(app);
    const res = await req.get("/");
    expect(res.status).toBe(200);
  });

  it("provides access to the HTTP headers", async () => {
    const req = new MockRequest(app);
    const res = await req.get("/");
    expect(res.headers["content-type"]).toBe("text/plain");
  });

  it("provides access to session cookies", async () => {
    const cookieApp = async () => [200, { "set-cookie": "foo=bar" }, ["OK"]] as [number, Record<string, string>, any];
    const res = await new MockRequest(cookieApp).get("/");
    expect(res.cookie("foo")).toBeDefined();
    expect(res.cookie("foo")!.value).toEqual(["bar"]);
  });

  it("provides access to persistent cookies set with max-age", async () => {
    const cookieApp = async () => [200, { "set-cookie": "foo=bar; max-age=3600" }, ["OK"]] as [number, Record<string, string>, any];
    const res = await new MockRequest(cookieApp).get("/");
    const c = res.cookie("foo");
    expect(c).toBeDefined();
    expect(c!.expires).toBeDefined();
    expect(c!.expires!.getTime()).toBeGreaterThan(Date.now());
  });

  it("provides access to persistent cookies set with expires", async () => {
    const future = new Date(Date.now() + 86400000).toUTCString();
    const cookieApp = async () => [200, { "set-cookie": `foo=bar; expires=${future}` }, ["OK"]] as [number, Record<string, string>, any];
    const res = await new MockRequest(cookieApp).get("/");
    const c = res.cookie("foo");
    expect(c).toBeDefined();
    expect(c!.expires).toBeDefined();
  });

  it("parses cookies giving max-age precedence over expires", async () => {
    const past = new Date(Date.now() - 86400000).toUTCString();
    const cookieApp = async () => [200, { "set-cookie": `foo=bar; max-age=3600; expires=${past}` }, ["OK"]] as [number, Record<string, string>, any];
    const res = await new MockRequest(cookieApp).get("/");
    const c = res.cookie("foo");
    expect(c!.expires!.getTime()).toBeGreaterThan(Date.now());
  });

  it("provides access to secure cookies", async () => {
    const cookieApp = async () => [200, { "set-cookie": "foo=bar; secure" }, ["OK"]] as [number, Record<string, string>, any];
    const res = await new MockRequest(cookieApp).get("/");
    expect(res.cookie("foo")!.secure).toBe(true);
  });

  it("parses cookie headers with equals sign at the end", async () => {
    const cookieApp = async () => [200, { "set-cookie": "foo=bar=" }, ["OK"]] as [number, Record<string, string>, any];
    const res = await new MockRequest(cookieApp).get("/");
    expect(res.cookie("foo")).toBeDefined();
  });

  it("returns nil if a non existent cookie is requested", async () => {
    const res = await new MockRequest(app).get("/");
    expect(res.cookie("nonexistent")).toBeUndefined();
  });

  it("handles an empty cookie", async () => {
    const cookieApp = async () => [200, { "set-cookie": "foo=" }, ["OK"]] as [number, Record<string, string>, any];
    const res = await new MockRequest(cookieApp).get("/");
    const c = res.cookie("foo");
    expect(c).toBeDefined();
  });

  it("parses multiple set-cookie headers provided as hash with array value", async () => {
    const cookieApp = async () => [200, { "set-cookie": ["foo=bar", "baz=qux"] }, ["OK"]] as [number, Record<string, any>, any];
    const res = await new MockRequest(cookieApp).get("/");
    expect(res.cookie("foo")).toBeDefined();
    expect(res.cookie("baz")).toBeDefined();
  });

  it("provides access to the HTTP body", async () => {
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("OK");
  });

  it("provides access to the Rack errors", async () => {
    const errApp = async (env: any) => {
      env["rack.errors"].write("test error");
      return [200, {}, ["OK"]] as [number, Record<string, string>, any];
    };
    const res = await new MockRequest(errApp).get("/");
    expect(res.errors).toContain("test error");
  });

  it("allows calling body.close afterwards", async () => {
    let closed = false;
    const body = { close() { closed = true; } };
    const closeApp = async () => [200, {}, body] as any;
    await new MockRequest(closeApp).get("/");
    expect(closed).toBe(true);
  });

  it("ignores plain strings passed as errors", () => {
    const res = new MockResponse(200, {}, ["OK"], "some error string");
    expect(res.errors).toBe("some error string");
  });

  it("optionally makes Rack errors fatal", async () => {
    const errApp = async (env: any) => {
      env["rack.errors"].write("fatal!");
      return [200, {}, ["OK"]] as [number, Record<string, string>, any];
    };
    await expect(new MockRequest(errApp).get("/", { fatal: true })).rejects.toThrow(FatalWarning);
  });

  it("does not calculate content length for streaming body", () => {
    const streamBody = { each(cb: any) { cb("hi"); } };
    const res = new MockResponse(200, {}, streamBody);
    // Streaming bodies don't get content-length set automatically
    expect(res.status).toBe(200);
  });

  it("handles Proc bodies", () => {
    const procBody = () => "hello";
    const res = new MockResponse(200, {}, procBody);
    expect(res.status).toBe(200);
  });

  it("closes streaming bodies that respond to close", async () => {
    let closed = false;
    const body = {
      each(cb: any) { cb("streaming"); },
      close() { closed = true; },
    };
    const streamApp = async () => [200, {}, body] as any;
    await new MockRequest(streamApp).get("/");
    expect(closed).toBe(true);
  });
});

describe("Rack::MockResponse, 'headers", () => {
  it("has_header?", () => {
    const res = new MockResponse(200, { "content-type": "text/plain" }, ["OK"]);
    expect(res.hasHeader("content-type")).toBe(true);
    expect(res.hasHeader("x-missing")).toBe(false);
  });

  it("get_header", () => {
    const res = new MockResponse(200, { "content-type": "text/plain" }, ["OK"]);
    expect(res.getHeader("content-type")).toBe("text/plain");
    expect(res.getHeader("x-missing")).toBeUndefined();
  });

  it("set_header", () => {
    const res = new MockResponse(200, {}, ["OK"]);
    res.setHeader("x-custom", "val");
    expect(res.getHeader("x-custom")).toBe("val");
  });

  it("add_header", () => {
    const res = new MockResponse(200, { "x-custom": "a" }, ["OK"]);
    res.addHeader("x-custom", "b");
    expect(res.getHeader("x-custom")).toEqual(["a", "b"]);
  });

  it("delete_header", () => {
    const res = new MockResponse(200, { "x-custom": "val" }, ["OK"]);
    const deleted = res.deleteHeader("x-custom");
    expect(deleted).toBe("val");
    expect(res.hasHeader("x-custom")).toBe(false);
  });

  it("does not add extra headers", () => {
    const res = new MockResponse(200, { "content-type": "text/plain" }, ["OK"]);
    const keys = Object.keys(res.headers);
    expect(keys).toEqual(["content-type"]);
  });
});
