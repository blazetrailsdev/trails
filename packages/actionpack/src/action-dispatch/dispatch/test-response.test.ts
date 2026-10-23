import { describe, expect, it } from "vitest";
import { assertEqual, assertKindOf, HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { Range } from "@blazetrails/ruby-compat";
import { TestResponse } from "../testing/test-response.js";

describe("TestResponseTest", () => {
  function assertResponseCodeRange(
    range: Range<number> | number[],
    predicate: "successful" | "notFound" | "isRedirection" | "serverError" | "clientError",
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
    assertResponseCodeRange(new Range(300, 399), "isRedirection");
    assertResponseCodeRange(new Range(500, 599), "serverError");
    assertResponseCodeRange(new Range(400, 499), "clientError");
  });

  it("response parsing", () => {
    let response = TestResponse.create(200, {}, "");
    assertEqual(response.body, response.parsedBody);

    response = TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '{ "foo": "fighters" }',
    );
    assertKindOf(HashWithIndifferentAccess, response.parsedBody);
    assertEqual({ foo: "fighters" }, response.parsedBody);
  });

  it("JSON response Hash pattern matching", () => {
    const response = TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '{ "foo": "fighters" }',
    );

    expect(Object.fromEntries(response.parsedBody as HashWithIndifferentAccess)).toMatchObject({
      foo: expect.stringMatching(/fighter/),
    });
  });

  it("JSON response Array pattern matching", () => {
    const response = TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '[{ "foo": "fighters" }, { "nir": "vana" }]',
    );
    expect(
      (response.parsedBody as HashWithIndifferentAccess[]).map((hash) => Object.fromEntries(hash)),
    ).toMatchObject([
      { foo: expect.stringMatching(/fighter/) },
      { nir: expect.stringMatching(/vana/) },
    ]);
  });

  // BLOCKED: test-response-html-parsed-body-at-xpath
  it.skip("HTML response pattern matching", () => {});
});
