import { describe, expect, it } from "vitest";
import { TestResponse } from "../testing/test-response.js";

describe("TestResponse", () => {
  it.skip("helpers", () => {
    // Pending: Rack::Response status predicates (successful?, not_found?,
    // redirection?, server_error?, client_error?) — not ported yet.
  });

  it("response parsing", () => {
    let response = TestResponse.create(200, {}, "");
    expect(response.parsedBody).toBe(response.body);

    response = TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '{ "foo": "fighters" }',
    );
    expect(response.parsedBody).toEqual({ foo: "fighters" });

    // HTML DOM parsing pending Nokogiri-equivalent port; identity parser for now.
    response = TestResponse.create(200, { "Content-Type": "text/html" }, "<html></html>");
    expect(response.parsedBody).toBe("<html></html>");
  });

  it.skip("JSON response Hash pattern matching", () => {
    // Pending: Ruby pattern matching has no direct TS equivalent.
  });

  it.skip("JSON response Array pattern matching", () => {
    // Pending: Ruby pattern matching has no direct TS equivalent.
  });

  it.skip("HTML response pattern matching", () => {
    // Pending: Nokogiri-equivalent DOM parser + pattern matching.
  });
});
