import { describe, it, expect } from "vitest";
import { ENV_METHODS, Request } from "./request.js";
import { BadRequest } from "../../action-controller/metal/exceptions.js";
import { StringIO } from "@blazetrails/ruby-compat";

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
