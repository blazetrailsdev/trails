/**
 * trails-only cover for the two `ActionDispatch::Request` arms that the
 * Rack-header convergence brought over and that `request_test.rb` does not
 * exercise directly: the chunked-transfer branch of `content_length`
 * (request.rb:292-295) and the `fetch_header` memoization of `GET`
 * (request.rb:395-404).
 */
import { describe, it, expect } from "vitest";
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
});
