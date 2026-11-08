import { describe, expect, it } from "vitest";
import { assertEqual, assertKindOf, HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { Range } from "@blazetrails/ruby-compat";
import type { Html5Document } from "@blazetrails/nokogiri";
import { TestResponse } from "../../../lib/action-dispatch/testing/test-response.js";

describe("TestResponseTest", () => {
  function assertResponseCodeRange(
    range: Range<number> | number[],
    predicate: "isSuccessful" | "isNotFound" | "isRedirection" | "isServerError" | "isClientError",
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
    assertResponseCodeRange(new Range(200, 299), "isSuccessful");
    assertResponseCodeRange([404], "isNotFound");
    assertResponseCodeRange(new Range(300, 399), "isRedirection");
    assertResponseCodeRange(new Range(500, 599), "isServerError");
    assertResponseCodeRange(new Range(400, 499), "isClientError");
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

    response = TestResponse.create(
      200,
      { "Content-Type": "text/html" },
      `<html>
  <head></head>
  <body>
    <div>Content</div>
  </body>
</html>
`,
    );
    assertEqual("Content", (response.parsedBody as Html5Document).atXpath("/html/body/div")!.text);
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

  // PERMANENT-SKIP: CLAUDE.md, "Ruby pattern matching has no port (`assert_pattern`, `deconstruct_keys`)".
  it.skip("HTML response pattern matching", () => {});
});
