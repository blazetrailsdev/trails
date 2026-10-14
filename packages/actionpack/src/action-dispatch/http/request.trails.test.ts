import { describe, it, expect } from "vitest";
import { ENV_METHODS, Request } from "./request.js";
import { BadRequest } from "../../action-controller/metal/exceptions.js";
import { StringIO } from "@blazetrails/ruby-compat";
import { Request as CacheRequest } from "./cache.js";

describe("Request#GET / #POST", () => {
  it("GET raises BadRequest when the query string cannot be parsed", () => {
    const req = new Request({ QUERY_STRING: "a[]=1&a[b]=2" });
    expect(() => req.GET()).toThrow(BadRequest);
    expect(() => req.GET()).toThrow(
      "Invalid query parameters: expected Hash (got Array) for param `a'",
    );
  });

  it("POST raises BadRequest when the form body cannot be parsed", () => {
    const body = "a[]=1&a[b]=2";
    const req = new Request({
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
      CONTENT_LENGTH: String(body.length),
      "rack.input": new StringIO(body),
    });
    expect(() => req.POST()).toThrow(BadRequest);
    expect(() => req.POST()).toThrow("Invalid request parameters:");
  });
});

describe("Request ENV_METHODS readers", () => {
  it("each ENV_METHODS entry generates a reader named by its header, read through get_header", () => {
    const req = new Request({
      HTTP_X_FORWARDED_HOST: "proxy.example.com",
      HTTP_ACCEPT_CHARSET: "utf-8",
      SERVER_NAME: "example.com",
    });
    expect(ENV_METHODS).toContain("HTTP_X_FORWARDED_HOST");
    expect(req.xForwardedHost).toBe("proxy.example.com");
    expect(req.acceptCharset).toBe("utf-8");
    expect(req.serverName).toBe("example.com");
    expect(req.xRequestId).toBeUndefined();
  });

  it("raw_host_with_port skips a blank X-Forwarded-Host, as presence does", () => {
    const req = new Request({ HTTP_X_FORWARDED_HOST: " ", HTTP_HOST: "example.com:8080" });
    expect(req.rawHostWithPort).toBe("example.com:8080");
  });
});

describe("Request include MimeNegotiation", () => {
  it("keeps its own format / formats / variant readers beside the module's writers", () => {
    expect(typeof Object.getOwnPropertyDescriptor(Request.prototype, "format")?.get).toBe(
      "function",
    );
    expect(typeof Request.prototype.setFormat).toBe("function");
    for (const name of ["formats", "variant"]) {
      const descriptor = Object.getOwnPropertyDescriptor(Request.prototype, name);
      expect(typeof descriptor?.get).toBe("function");
      expect(typeof descriptor?.set).toBe("function");
    }
    const req = new Request({ HTTP_ACCEPT: "application/json" });
    expect(String(req.format)).toBe("application/json");
  });

  it("seats ignore_accept_header on the includer", () => {
    expect(Object.hasOwn(Request, "ignoreAcceptHeader")).toBe(true);
    expect(Request.ignoreAcceptHeader).toBe(false);
    expect(new Request({}).ignoreAcceptHeader).toBe(false);
  });
});

describe("Request module initialize bodies", () => {
  it("starts the FilterParameters memos nil", () => {
    const request = new Request({});
    expect(request._filteredParameters).toBeNull();
    expect(request._filteredEnv).toBeNull();
    expect(request._filteredPath).toBeNull();
    expect(request._parameterFilter).toBeNull();
  });

  it("memoizes protocol and port", () => {
    const request = new Request({ HTTP_HOST: "example.com:8080" });
    expect(request.protocol).toBe("http://");
    expect(request.port).toBe(8080);
    request.env["HTTPS"] = "on";
    request.env["HTTP_HOST"] = "example.com:9090";
    expect(request.protocol).toBe("http://");
    expect(request.port).toBe(8080);
  });

  it("fills a nil memo on first read", () => {
    const request = new Request({ PATH_INFO: "/a", QUERY_STRING: "" });
    expect(request.filteredPath()).toBe("/a");
    expect(request._filteredPath).toBe("/a");
  });
});

describe("Request on_load(:action_dispatch_request)", () => {
  it("includes RequestCookieMethods onto Request.prototype", () => {
    expect(Object.hasOwn(Request.prototype, "cookieJar")).toBe(true);
    const keyGenerator = { generateKey: () => "k" };
    const request = new Request({ "action_dispatch.key_generator": keyGenerator });
    expect(request.keyGenerator()).toBe(keyGenerator);
    expect(request.isHaveCookieJar()).toBe(false);
  });
});

describe("Cache::Request.strict_freshness", () => {
  it("is read by Request#fresh through the module-level seat", () => {
    const old = CacheRequest.strictFreshness;
    const req = new Request({
      HTTP_IF_NONE_MATCH: '"abc"',
      HTTP_IF_MODIFIED_SINCE: "Tue, 01 Jan 2030 00:00:00 GMT",
    });
    const response = { etag: '"abc"', lastModified: new Date("2031-01-01T00:00:00Z") };
    try {
      expect(req.strictFreshness).toBe(false);
      expect(req.fresh(response)).toBe(false);
      CacheRequest.strictFreshness = true;
      expect(req.strictFreshness).toBe(true);
      expect(req.fresh(response)).toBe(true);
    } finally {
      CacheRequest.strictFreshness = old;
    }
  });
});
