import { describe, it, expect } from "vitest";
import { Cascade } from "./cascade.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::Cascade", () => {
  const notFoundApp = async () => [404, { "content-type": "text/plain" }, ["Not Found"]] as any;
  const methodNotAllowedApp = async () => [405, {}, []] as any;
  const okApp = async () => [200, { "content-type": "text/plain" }, ["OK"]] as any;
  const forbiddenApp = async () => [403, {}, ["Forbidden"]] as any;

  it("dispatch onward on 404 and 405 by default", async () => {
    const cascade = new Cascade([notFoundApp, methodNotAllowedApp, okApp]);
    const response = await new MockRequest((env) => cascade.call(env)).get("/foo");
    expect(response.status).toBe(200);
  });

  it("dispatch onward on whatever is passed", async () => {
    const cascade = new Cascade([forbiddenApp, notFoundApp], [404, 403]);
    const response = await new MockRequest((env) => cascade.call(env)).get("/bla");
    expect(response.status).toBe(404);
  });

  it("include? returns whether app is included", () => {
    const cascade = new Cascade([notFoundApp, okApp]);
    expect(cascade.includeApp(notFoundApp)).toBe(true);
    expect(cascade.includeApp(okApp)).toBe(true);
    expect(cascade.includeApp(forbiddenApp)).toBe(false);
  });

  it("return 404 if empty", async () => {
    const cascade = new Cascade([]);
    const response = await new MockRequest((env) => cascade.call(env)).get("/");
    expect(response.status).toBe(404);
  });

  it("uses new response object if empty", async () => {
    const cascade = new Cascade([]);
    let res = await cascade.call({});
    expect(res[0]).toBe(404);
    expect(res[1]["content-type"]).toBe("text/plain");
    expect(res[2]).toEqual([]);

    // Mutating the result shouldn't affect next call
    res[0] = 200;
    res[1]["content-type"] = "text/html";
    res[2].push("a");

    res = await cascade.call({});
    expect(res[0]).toBe(404);
    expect(res[1]["content-type"]).toBe("text/plain");
    expect(res[2]).toEqual([]);
  });

  it("returns final response if all responses are cascaded", async () => {
    const cascade = new Cascade([]);
    cascade.add(methodNotAllowedApp);
    const res = await cascade.call({});
    expect(res[0]).toBe(405);
  });

  it("append new app", async () => {
    const cascade = new Cascade([], [404, 403]);
    let res = await new MockRequest((env) => cascade.call(env)).get("/");
    expect(res.status).toBe(404);

    cascade.add(notFoundApp);
    res = await new MockRequest((env) => cascade.call(env)).get("/");
    expect(res.status).toBe(404);

    cascade.add(okApp);
    res = await new MockRequest((env) => cascade.call(env)).get("/");
    expect(res.status).toBe(200);
  });

  it("close the body on cascade", async () => {
    let closed = false;
    const body = { close() { closed = true; } };
    const closerApp = async () => [404, {}, body] as any;
    const cascade = new Cascade([closerApp, okApp], [404]);
    await new MockRequest((env) => cascade.call(env)).get("/foo");
    expect(closed).toBe(true);
  });
});
