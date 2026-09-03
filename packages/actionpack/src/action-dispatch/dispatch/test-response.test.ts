import { describe, expect, it } from "vitest";
import { TestResponse } from "../testing/test-response.js";

describe("TestResponse", () => {
  it.skip("helpers", () => {});

  it("response parsing", () => {
    let response = TestResponse.create(200, {}, "");
    expect(response.parsedBody).toBe(response.body);

    response = TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '{ "foo": "fighters" }',
    );
    expect(response.parsedBody).toEqual({ foo: "fighters" });

    response = TestResponse.create(200, { "Content-Type": "text/html" }, "<html></html>");
    expect(response.parsedBody).toBe("<html></html>");
  });

  it.skip("JSON response Hash pattern matching", () => {});

  it.skip("JSON response Array pattern matching", () => {});

  it.skip("HTML response pattern matching", () => {});
});
