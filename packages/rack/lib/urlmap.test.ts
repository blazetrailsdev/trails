import { it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { URLMap } from "./urlmap.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";

it("dispatches paths correctly", async () => {
  const app = (env: Record<string, any>) => [
    200,
    {
      "x-scriptname": env["SCRIPT_NAME"],
      "x-pathinfo": env["PATH_INFO"],
      "content-type": "text/plain",
    },
    [""],
  ];
  const map = new Lint(
    new URLMap({
      "http://foo.org/bar": app,
      "/foo": app,
      "/foo/bar": app,
    }),
  );

  let res = await new MockRequest(map).get("/");
  expect(res.isNotFound).toBeTruthy();

  res = await new MockRequest(map).get("/qux");
  expect(res.isNotFound).toBeTruthy();

  res = await new MockRequest(map).get("/foo");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/foo");
  expect(res.get("x-pathinfo")).toBe("");

  res = await new MockRequest(map).get("/foo/");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/foo");
  expect(res.get("x-pathinfo")).toBe("/");

  res = await new MockRequest(map).get("/foo/bar");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/foo/bar");
  expect(res.get("x-pathinfo")).toBe("");

  res = await new MockRequest(map).get("/foo/bard");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/foo");
  expect(res.get("x-pathinfo")).toBe("/bard");

  res = await new MockRequest(map).get("/foo/bar/");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/foo/bar");
  expect(res.get("x-pathinfo")).toBe("/");

  res = await new MockRequest(map).get("/foo///bar//quux");
  expect(res.status).toBe(200);
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/foo/bar");
  expect(res.get("x-pathinfo")).toBe("//quux");

  res = await new MockRequest(map).get("/foo/quux", { SCRIPT_NAME: "/bleh" });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/bleh/foo");
  expect(res.get("x-pathinfo")).toBe("/quux");

  res = await new MockRequest(map).get("/bar", { HTTP_HOST: "foo.org" });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/bar");
  expect(res.get("x-pathinfo").length === 0).toBeTruthy();

  res = await new MockRequest(map).get("/bar/", { HTTP_HOST: "foo.org" });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-scriptname")).toBe("/bar");
  expect(res.get("x-pathinfo")).toBe("/");
});

it("dispatches hosts correctly", async () => {
  const map = new Lint(
    new URLMap({
      "http://foo.org/": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "foo.org",
          "x-host": env["HTTP_HOST"] ?? env["SERVER_NAME"],
        },
        [""],
      ],
      "http://subdomain.foo.org/": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "subdomain.foo.org",
          "x-host": env["HTTP_HOST"] ?? env["SERVER_NAME"],
        },
        [""],
      ],
      "http://bar.org/": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "bar.org",
          "x-host": env["HTTP_HOST"] ?? env["SERVER_NAME"],
        },
        [""],
      ],
      "/": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "default.org",
          "x-host": env["HTTP_HOST"] ?? env["SERVER_NAME"],
        },
        [""],
      ],
    }),
  );

  let res = await new MockRequest(map).get("/");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("default.org");

  res = await new MockRequest(map).get("/", { HTTP_HOST: "bar.org" });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("bar.org");

  res = await new MockRequest(map).get("/", { HTTP_HOST: "foo.org" });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("foo.org");

  res = await new MockRequest(map).get("/", {
    HTTP_HOST: "subdomain.foo.org",
    SERVER_NAME: "foo.org",
  });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("subdomain.foo.org");

  res = await new MockRequest(map).get("http://foo.org/");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("foo.org");

  res = await new MockRequest(map).get("/", { HTTP_HOST: "example.org" });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("default.org");

  res = await new MockRequest(map).get("/", { HTTP_HOST: "any-host.org" });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("default.org");

  res = await new MockRequest(map).get("/", {
    HTTP_HOST: "any-host.org",
    HTTP_X_FORWARDED_HOST: "any-host.org",
  });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("default.org");

  res = await new MockRequest(map).get("/", {
    HTTP_HOST: "example.org:9292",
    SERVER_PORT: "9292",
  });
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("default.org");
});

it("be nestable", async () => {
  const map = new Lint(
    new URLMap({
      "/foo": new URLMap({
        "/bar": new URLMap({
          "/quux": (env: Record<string, any>) => [
            200,
            {
              "content-type": "text/plain",
              "x-position": "/foo/bar/quux",
              "x-pathinfo": env["PATH_INFO"],
              "x-scriptname": env["SCRIPT_NAME"],
            },
            [""],
          ],
        }),
      }),
    }),
  );

  let res = await new MockRequest(map).get("/foo/bar");
  expect(res.isNotFound).toBeTruthy();

  res = await new MockRequest(map).get("/foo/bar/quux");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("/foo/bar/quux");
  expect(res.get("x-pathinfo")).toBe("");
  expect(res.get("x-scriptname")).toBe("/foo/bar/quux");
});

it("route root apps correctly", async () => {
  const map = new Lint(
    new URLMap({
      "/": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "root",
          "x-pathinfo": env["PATH_INFO"],
          "x-scriptname": env["SCRIPT_NAME"],
        },
        [""],
      ],
      "/foo": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "foo",
          "x-pathinfo": env["PATH_INFO"],
          "x-scriptname": env["SCRIPT_NAME"],
        },
        [""],
      ],
    }),
  );

  let res = await new MockRequest(map).get("/foo/bar");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("foo");
  expect(res.get("x-pathinfo")).toBe("/bar");
  expect(res.get("x-scriptname")).toBe("/foo");

  res = await new MockRequest(map).get("/foo");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("foo");
  expect(res.get("x-pathinfo")).toBe("");
  expect(res.get("x-scriptname")).toBe("/foo");

  res = await new MockRequest(map).get("/bar");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("root");
  expect(res.get("x-pathinfo")).toBe("/bar");
  expect(res.get("x-scriptname")).toBe("");

  res = await new MockRequest(map).get("");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("root");
  expect(res.get("x-pathinfo")).toBe("/");
  expect(res.get("x-scriptname")).toBe("");
});

it("not squeeze slashes", async () => {
  const map = new Lint(
    new URLMap({
      "/": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "root",
          "x-pathinfo": env["PATH_INFO"],
          "x-scriptname": env["SCRIPT_NAME"],
        },
        [""],
      ],
      "/foo": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "foo",
          "x-pathinfo": env["PATH_INFO"],
          "x-scriptname": env["SCRIPT_NAME"],
        },
        [""],
      ],
    }),
  );

  const res = await new MockRequest(map).get("/http://example.org/bar");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("root");
  expect(res.get("x-pathinfo")).toBe("/http://example.org/bar");
  expect(res.get("x-scriptname")).toBe("");
});

it("not be case sensitive with hosts", async () => {
  const map = new Lint(
    new URLMap({
      "http://example.org/": (env: Record<string, any>) => [
        200,
        {
          "content-type": "text/plain",
          "x-position": "root",
          "x-pathinfo": env["PATH_INFO"],
          "x-scriptname": env["SCRIPT_NAME"],
        },
        [""],
      ],
    }),
  );

  let res = await new MockRequest(map).get("http://example.org/");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("root");
  expect(res.get("x-pathinfo")).toBe("/");
  expect(res.get("x-scriptname")).toBe("");

  res = await new MockRequest(map).get("http://EXAMPLE.ORG/");
  expect(res.isOk).toBeTruthy();
  expect(res.get("x-position")).toBe("root");
  expect(res.get("x-pathinfo")).toBe("/");
  expect(res.get("x-scriptname")).toBe("");
});

it("not allow locations unless they start with /", () => {
  expect(() => {
    new URLMap({ "a/": (_env: Record<string, any>) => undefined as any });
  }).toThrow(ArgumentError);
});
