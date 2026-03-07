import { describe, it, expect } from "vitest";
import { URLMap } from "./urlmap.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::URLMap", () => {
  const echoApp = async (env: Record<string, any>) =>
    [200, {
      "x-scriptname": env["SCRIPT_NAME"],
      "x-pathinfo": env["PATH_INFO"],
      "content-type": "text/plain",
    }, [""]] as any;

  it("dispatches paths correctly", async () => {
    const map = new URLMap({
      "http://foo.org/bar": echoApp,
      "/foo": echoApp,
      "/foo/bar": echoApp,
    });

    let res = await new MockRequest((env) => map.call(env)).get("/");
    expect(res.status).toBe(404);

    res = await new MockRequest((env) => map.call(env)).get("/qux");
    expect(res.status).toBe(404);

    res = await new MockRequest((env) => map.call(env)).get("/foo");
    expect(res.status).toBe(200);
    expect(res.headers["x-scriptname"]).toBe("/foo");
    expect(res.headers["x-pathinfo"]).toBe("");

    res = await new MockRequest((env) => map.call(env)).get("/foo/");
    expect(res.status).toBe(200);
    expect(res.headers["x-scriptname"]).toBe("/foo");
    expect(res.headers["x-pathinfo"]).toBe("/");

    res = await new MockRequest((env) => map.call(env)).get("/foo/bar");
    expect(res.status).toBe(200);
    expect(res.headers["x-scriptname"]).toBe("/foo/bar");
    expect(res.headers["x-pathinfo"]).toBe("");

    res = await new MockRequest((env) => map.call(env)).get("/foo/bard");
    expect(res.status).toBe(200);
    expect(res.headers["x-scriptname"]).toBe("/foo");
    expect(res.headers["x-pathinfo"]).toBe("/bard");

    res = await new MockRequest((env) => map.call(env)).get("/foo/bar/");
    expect(res.status).toBe(200);
    expect(res.headers["x-scriptname"]).toBe("/foo/bar");
    expect(res.headers["x-pathinfo"]).toBe("/");

    res = await new MockRequest((env) => map.call(env)).get("/foo/quux", { SCRIPT_NAME: "/bleh" });
    expect(res.status).toBe(200);
    expect(res.headers["x-scriptname"]).toBe("/bleh/foo");
    expect(res.headers["x-pathinfo"]).toBe("/quux");

    res = await new MockRequest((env) => map.call(env)).get("/bar", { HTTP_HOST: "foo.org" });
    expect(res.status).toBe(200);
    expect(res.headers["x-scriptname"]).toBe("/bar");
    expect(res.headers["x-pathinfo"]).toBe("");

    res = await new MockRequest((env) => map.call(env)).get("/bar/", { HTTP_HOST: "foo.org" });
    expect(res.status).toBe(200);
    expect(res.headers["x-scriptname"]).toBe("/bar");
    expect(res.headers["x-pathinfo"]).toBe("/");
  });

  it("dispatches hosts correctly", async () => {
    const map = new URLMap({
      "http://foo.org/": async (env) =>
        [200, { "content-type": "text/plain", "x-position": "foo.org", "x-host": env["HTTP_HOST"] || env["SERVER_NAME"] }, [""]] as any,
      "http://subdomain.foo.org/": async (env) =>
        [200, { "content-type": "text/plain", "x-position": "subdomain.foo.org", "x-host": env["HTTP_HOST"] || env["SERVER_NAME"] }, [""]] as any,
      "http://bar.org/": async (env) =>
        [200, { "content-type": "text/plain", "x-position": "bar.org", "x-host": env["HTTP_HOST"] || env["SERVER_NAME"] }, [""]] as any,
      "/": async (env) =>
        [200, { "content-type": "text/plain", "x-position": "default.org", "x-host": env["HTTP_HOST"] || env["SERVER_NAME"] }, [""]] as any,
    });

    let res = await new MockRequest((env) => map.call(env)).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("default.org");

    res = await new MockRequest((env) => map.call(env)).get("/", { HTTP_HOST: "bar.org" });
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("bar.org");

    res = await new MockRequest((env) => map.call(env)).get("/", { HTTP_HOST: "foo.org" });
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("foo.org");

    res = await new MockRequest((env) => map.call(env)).get("/", { HTTP_HOST: "subdomain.foo.org", SERVER_NAME: "foo.org" });
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("subdomain.foo.org");

    res = await new MockRequest((env) => map.call(env)).get("/", { HTTP_HOST: "example.org" });
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("default.org");

    res = await new MockRequest((env) => map.call(env)).get("/", { HTTP_HOST: "any-host.org" });
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("default.org");

    res = await new MockRequest((env) => map.call(env)).get("/", { HTTP_HOST: "example.org:9292", SERVER_PORT: "9292" });
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("default.org");
  });

  it("be nestable", async () => {
    const map = new URLMap({
      "/foo": (env) => new URLMap({
        "/bar": (env2) => new URLMap({
          "/quux": async (env3) =>
            [200, {
              "content-type": "text/plain",
              "x-position": "/foo/bar/quux",
              "x-pathinfo": env3["PATH_INFO"],
              "x-scriptname": env3["SCRIPT_NAME"],
            }, [""]] as any,
        }).call(env2),
      }).call(env),
    });

    let res = await new MockRequest((env) => map.call(env)).get("/foo/bar");
    expect(res.status).toBe(404);

    res = await new MockRequest((env) => map.call(env)).get("/foo/bar/quux");
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("/foo/bar/quux");
    expect(res.headers["x-pathinfo"]).toBe("");
    expect(res.headers["x-scriptname"]).toBe("/foo/bar/quux");
  });

  it("route root apps correctly", async () => {
    const map = new URLMap({
      "/": async (env) => [200, { "content-type": "text/plain", "x-position": "root", "x-pathinfo": env["PATH_INFO"], "x-scriptname": env["SCRIPT_NAME"] }, [""]] as any,
      "/foo": async (env) => [200, { "content-type": "text/plain", "x-position": "foo", "x-pathinfo": env["PATH_INFO"], "x-scriptname": env["SCRIPT_NAME"] }, [""]] as any,
    });

    let res = await new MockRequest((env) => map.call(env)).get("/foo/bar");
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("foo");
    expect(res.headers["x-pathinfo"]).toBe("/bar");
    expect(res.headers["x-scriptname"]).toBe("/foo");

    res = await new MockRequest((env) => map.call(env)).get("/foo");
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("foo");
    expect(res.headers["x-pathinfo"]).toBe("");
    expect(res.headers["x-scriptname"]).toBe("/foo");

    res = await new MockRequest((env) => map.call(env)).get("/bar");
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("root");
    expect(res.headers["x-pathinfo"]).toBe("/bar");
    expect(res.headers["x-scriptname"]).toBe("");
  });

  it("not squeeze slashes", async () => {
    const map = new URLMap({
      "/": async (env) => [200, { "content-type": "text/plain", "x-position": "root", "x-pathinfo": env["PATH_INFO"], "x-scriptname": env["SCRIPT_NAME"] }, [""]] as any,
      "/foo": async (env) => [200, { "content-type": "text/plain", "x-position": "foo", "x-pathinfo": env["PATH_INFO"], "x-scriptname": env["SCRIPT_NAME"] }, [""]] as any,
    });

    const res = await new MockRequest((env) => map.call(env)).get("/http://example.org/bar");
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("root");
    expect(res.headers["x-pathinfo"]).toBe("/http://example.org/bar");
    expect(res.headers["x-scriptname"]).toBe("");
  });

  it("not be case sensitive with hosts", async () => {
    const map = new URLMap({
      "http://example.org/": async (env) => [200, { "content-type": "text/plain", "x-position": "root", "x-pathinfo": env["PATH_INFO"], "x-scriptname": env["SCRIPT_NAME"] }, [""]] as any,
    });

    let res = await new MockRequest((env) => map.call(env)).get("http://example.org/");
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("root");

    res = await new MockRequest((env) => map.call(env)).get("http://EXAMPLE.ORG/");
    expect(res.status).toBe(200);
    expect(res.headers["x-position"]).toBe("root");
  });

  it("not allow locations unless they start with /", () => {
    expect(() => new URLMap({ "a/": async () => [200, {}, []] as any })).toThrow();
  });
});
