import { describe, expect, it } from "vitest";
import { OptionRedirect, PathRedirect, Redirect, redirect } from "./redirection.js";
import { Request } from "../http/request.js";

function makeRequest(env: Record<string, unknown> = {}): Request {
  return new Request({
    REQUEST_METHOD: "GET",
    SERVER_NAME: "example.com",
    SERVER_PORT: "80",
    PATH_INFO: "/foo",
    "rack.url_scheme": "http",
    ...env,
  });
}

describe("redirect()", () => {
  it("returns a PathRedirect for a string path", () => {
    const r = redirect("/posts");
    expect(r).toBeInstanceOf(PathRedirect);
    expect(r.status).toBe(301);
  });

  it("returns an OptionRedirect when given options", () => {
    const r = redirect({ subdomain: "stores", path: "/foo" });
    expect(r).toBeInstanceOf(OptionRedirect);
  });

  it("accepts a status option", () => {
    const r = redirect("/foo", { status: 307 });
    expect(r.status).toBe(307);
  });

  it("accepts a block", () => {
    const r = redirect(() => "/dyn");
    expect(r).toBeInstanceOf(Redirect);
    expect(r.status).toBe(301);
  });

  it("raises for unsupported arguments", () => {
    expect(() => redirect(123 as unknown as string)).toThrow(/not supported/);
  });
});

describe("PathRedirect", () => {
  it("interpolates %{key} placeholders with escaped path values", () => {
    const r = new PathRedirect(301, "/wiki/%{article}");
    const req = makeRequest();
    const res = r.buildResponse(
      new Request({
        ...req.env,
        "action_dispatch.request.path_parameters": { article: "hello world" },
      }),
    );
    expect(res.headers["Location"]).toBe("http://example.com/wiki/hello%20world");
  });

  it("preserves query and fragment, interpolating each part separately", () => {
    const r = new PathRedirect(301, "/baz?id=%{id}&foo=?&bar=1#id-%{id}");
    const req = new Request({
      REQUEST_METHOD: "GET",
      SERVER_NAME: "example.com",
      SERVER_PORT: "80",
      "rack.url_scheme": "http",
      "action_dispatch.request.path_parameters": { id: "42" },
    });
    const res = r.buildResponse(req);
    expect(res.headers["Location"]).toBe("http://example.com/baz?id=42&foo=?&bar=1#id-42");
  });

  it("inspects with status and template", () => {
    expect(new PathRedirect(302, "/x").inspect()).toBe("redirect(302, /x)");
  });
});

describe("Redirect", () => {
  it("prepends SCRIPT_NAME for relative paths", () => {
    const r = new Redirect(301, () => "relative");
    const req = new Request({
      REQUEST_METHOD: "GET",
      SERVER_NAME: "example.com",
      SERVER_PORT: "80",
      SCRIPT_NAME: "/mount",
      "rack.url_scheme": "http",
    });
    const res = r.buildResponse(req);
    expect(res.headers["Location"]).toBe("http://example.com/mount/relative");
  });

  it("call() returns a rack triple", () => {
    const r = new Redirect(302, () => "/x");
    const [status, headers] = r.call({
      REQUEST_METHOD: "GET",
      SERVER_NAME: "example.com",
      SERVER_PORT: "80",
      "rack.url_scheme": "http",
    });
    expect(status).toBe(302);
    expect(headers["Location"]).toBe("http://example.com/x");
  });

  it("redirect?() is true", () => {
    expect(new Redirect(301, () => "/x").redirect()).toBe(true);
  });
});

describe("OptionRedirect", () => {
  it("builds a URL from options merged into the request defaults", () => {
    const r = new OptionRedirect(301, { path: "/documentation/new" });
    const req = makeRequest({ PATH_INFO: "/new_documentation" });
    const res = r.buildResponse(req);
    expect(res.headers["Location"]).toContain("/documentation/new");
  });

  it("inspect renders option pairs", () => {
    expect(new OptionRedirect(301, { subdomain: "stores" }).inspect()).toBe(
      "redirect(301, subdomain: stores)",
    );
  });
});
