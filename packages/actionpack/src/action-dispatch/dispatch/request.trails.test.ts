/**
 * trails-only cover for the two `ActionDispatch::Request` arms that the
 * Rack-header convergence brought over and that `request_test.rb` does not
 * exercise directly: the chunked-transfer branch of `content_length`
 * (request.rb:292-295), the `fetch_header` memoization of `GET`
 * (request.rb:395-404), and the by-reference env `Rack::Request::Env#initialize`
 * gives every `set_header` (rack/request.rb:47-49) — the semantics
 * `HostAuthorization#mark_as_authorized` (host_authorization.rb:167) relies on.
 */
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
});
