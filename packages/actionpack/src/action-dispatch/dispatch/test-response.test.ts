import { describe, expect, it } from "vitest";
import { Range } from "@blazetrails/ruby-compat";
import { TestResponse } from "../testing/test-response.js";

describe("TestResponseTest", () => {
  function assertResponseCodeRange(
    range: Range<number> | number[],
    predicate: "successful" | "notFound" | "redirection" | "serverError" | "clientError",
  ): void {
    const response = new TestResponse();
    for (let status = 0; status <= 599; status++) {
      response.status = status;
      expect(response[predicate], `ActionDispatch::TestResponse.new(${status}).${predicate}`).toBe(
        range instanceof Range ? range.isInclude(status) : range.includes(status),
      );
    }
  }

  it("helpers", () => {
    assertResponseCodeRange(new Range(200, 299), "successful");
    assertResponseCodeRange([404], "notFound");
    assertResponseCodeRange(new Range(300, 399), "redirection");
    assertResponseCodeRange(new Range(500, 599), "serverError");
    assertResponseCodeRange(new Range(400, 499), "clientError");
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

    response = TestResponse.create(200, { "Content-Type": "text/html" }, "<html></html>");
    expect(response.parsedBody).toBe("<html></html>");
  });

  it("JSON response Hash pattern matching", () => {
    const response = TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '{ "foo": "fighters" }',
    );

    expect(response.parsedBody).toMatchObject({ foo: expect.stringMatching(/fighter/) });
  });

  it("JSON response Array pattern matching", () => {
    const response = TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '[{ "foo": "fighters" }, { "nir": "vana" }]',
    );
    expect(response.parsedBody).toMatchObject([
      { foo: expect.stringMatching(/fighter/) },
      { nir: expect.stringMatching(/vana/) },
    ]);
  });

  it.skip("HTML response pattern matching", () => {});
});
