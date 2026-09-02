import { describe, expect, it } from "vitest";
import { bodyToString } from "@blazetrails/rack";
import { OptionRedirect, PathRedirect, Redirect, redirect } from "./redirection.js";
import { RouteSet } from "./route-set.js";
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
    expect(res.headers.get("Location")).toBe("http://example.com/wiki/hello%20world");
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
    expect(res.headers.get("Location")).toBe("http://example.com/baz?id=42&foo=?&bar=1#id-42");
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
    expect(res.headers.get("Location")).toBe("http://example.com/mount/relative");
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
    expect(headers["location"]).toBe("http://example.com/x");
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
    expect(res.headers.get("Location")).toContain("/documentation/new");
  });

  it("inspect renders option pairs", () => {
    expect(new OptionRedirect(301, { subdomain: "stores" }).inspect()).toBe(
      "redirect(301, subdomain: stores)",
    );
  });
});

describe("RouteSet#call through a Redirect endpoint", () => {
  const env = (path: string): Record<string, unknown> => ({
    REQUEST_METHOD: "GET",
    PATH_INFO: path,
    SERVER_NAME: "example.com",
    SERVER_PORT: "80",
    "rack.url_scheme": "http",
  });

  it("serves the redirect the mapper attached to the route", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/account", { to: r.redirect("/dashboard") });
    });

    const [status, headers, body] = await routes.call(env("/account"));

    expect(status).toBe(301);
    expect(headers["location"]).toBe("http://example.com/dashboard");
    expect(await bodyToString(body)).toBe("");
  });

  it("hands the redirect block the path parameters Journey matched", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old/:id", { to: r.redirect((params) => `/new/${params.id}`) });
    });

    const [status, headers] = await routes.call(env("/old/42"));

    expect(status).toBe(301);
    expect(headers["location"]).toBe("http://example.com/new/42");
  });

  it("falls through to the Journey 404 when nothing matches", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/account", { to: r.redirect("/dashboard") });
    });

    const [status, headers] = await routes.call(env("/nope"));

    expect(status).toBe(404);
    expect(headers["x-cascade"]).toBe("pass");
  });
});
