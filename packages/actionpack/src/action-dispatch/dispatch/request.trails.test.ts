import { describe, it, expect } from "vitest";
import type { RackEnv } from "@blazetrails/rack";
import { Request } from "../request.js";

describe("Request", () => {
  it("content_length measures the body when the request is chunked", () => {
    const req = new Request({
      HTTP_TRANSFER_ENCODING: "chunked",
      "rack.input": "héllo",
    });
    expect(req.contentLength).toBe(6);
  });

  it("GET memoizes the parsed query parameters under its env key", () => {
    const req = new Request({ QUERY_STRING: "foo=bar" });
    const first = req.queryParameters;
    expect(first).toEqual({ foo: "bar" });
    expect(req.env["action_dispatch.request.query_parameters"]).toBe(first);
    expect(req.queryParameters).toBe(first);
  });

  it("set_header writes through to the env the request was built from", () => {
    const env: RackEnv = { HTTP_HOST: "example.com" };
    const req = new Request(env);
    req.setHeader("action_dispatch.authorized_host", req.host);
    expect(env["action_dispatch.authorized_host"]).toBe("example.com");
  });

  it("ssl? is true for a wss request, the second arm of Rack::Request::Helpers#ssl?", () => {
    expect(new Request({ "rack.url_scheme": "wss" }).ssl).toBe(true);
    expect(new Request({ "rack.url_scheme": "https" }).ssl).toBe(true);
    expect(new Request({ "rack.url_scheme": "http" }).ssl).toBe(false);
  });

  it("scheme is https when HTTPS is on, the first arm of Rack::Request::Helpers#scheme", () => {
    expect(new Request({ HTTPS: "on", "rack.url_scheme": "http" }).scheme).toBe("https");
  });

  it("scheme is https when X-Forwarded-Ssl is on, the second arm of Rack::Request::Helpers#scheme", () => {
    expect(new Request({ HTTP_X_FORWARDED_SSL: "on", "rack.url_scheme": "http" }).scheme).toBe(
      "https",
    );
  });

  it("scheme reads forwarded_scheme before rack.url_scheme", () => {
    expect(new Request({ HTTP_X_FORWARDED_PROTO: "https", "rack.url_scheme": "http" }).scheme).toBe(
      "https",
    );
    expect(new Request({ "rack.url_scheme": "http" }).scheme).toBe("http");
    expect(new Request({ HTTPS: "on" }).ssl).toBe(true);
  });

  it("answers the Rack::Request::Helpers members it does not declare itself", () => {
    const req = new Request({
      HTTP_REFERER: "http://example.com/referred",
      HTTP_HOST: "example.com",
      REQUEST_METHOD: "OPTIONS",
      SCRIPT_NAME: "/app",
    });
    expect(req.referer).toBe("http://example.com/referred");
    expect(req.referrer).toBe("http://example.com/referred");
    expect(req.hostAuthority).toBe("example.com");
    expect(req.scriptName).toBe("/app");
    expect(req.isOptions()).toBe(true);
    expect(req.isTrace()).toBe(false);
  });

  it("its own request_method and form_data? outrank the included ones", () => {
    const req = new Request({ REQUEST_METHOD: "POST" });
    req.requestMethod = "PATCH";
    expect(req.requestMethod).toBe("PATCH");
    expect(req.getHeader("REQUEST_METHOD")).toBe("PATCH");
    expect(new Request({ REQUEST_METHOD: "POST" }).formData).toBe(false);
  });
});
