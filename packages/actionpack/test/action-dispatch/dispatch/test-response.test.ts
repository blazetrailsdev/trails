import { describe, expect, it } from "vitest";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { assertEqual, assertKindOf } from "@blazetrails/activesupport/testing/assertions";
import { Range } from "@blazetrails/ruby-compat/range";
import { XML, type Html5Document } from "@blazetrails/nokogiri";
import { TestResponse } from "../../../lib/action-dispatch/testing/test-response.js";

describe("TestResponseTest", () => {
  async function assertResponseCodeRange(
    range: Range<number> | number[],
    predicate: "isSuccessful" | "isNotFound" | "isRedirection" | "isServerError" | "isClientError",
  ): Promise<void> {
    const response = await TestResponse.new();
    for (let status = 0; status <= 599; status++) {
      response.status = status;
      expect(response[predicate], `ActionDispatch::TestResponse.new(${status}).${predicate}`).toBe(
        range instanceof Range ? range.isInclude(status) : range.includes(status),
      );
    }
  }

  it("helpers", async () => {
    await assertResponseCodeRange(new Range(200, 299), "isSuccessful");
    await assertResponseCodeRange([404], "isNotFound");
    await assertResponseCodeRange(new Range(300, 399), "isRedirection");
    await assertResponseCodeRange(new Range(500, 599), "isServerError");
    await assertResponseCodeRange(new Range(400, 499), "isClientError");
  });

  it("response parsing", async () => {
    let response = await TestResponse.create(200, {}, "");
    assertEqual(response.body, response.parsedBody);

    response = await TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '{ "foo": "fighters" }',
    );
    assertKindOf(HashWithIndifferentAccess, response.parsedBody);
    assertEqual({ foo: "fighters" }, response.parsedBody);

    response = await TestResponse.create(
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
    assertKindOf(XML.Document, response.parsedBody);
    assertEqual("Content", (response.parsedBody as Html5Document).atXpath("/html/body/div")!.text);
  });

  it("JSON response Hash pattern matching", async () => {
    const response = await TestResponse.create(
      200,
      { "Content-Type": "application/json" },
      '{ "foo": "fighters" }',
    );

    expect(Object.fromEntries(response.parsedBody as HashWithIndifferentAccess)).toMatchObject({
      foo: expect.stringMatching(/fighter/),
    });
  });

  it("JSON response Array pattern matching", async () => {
    const response = await TestResponse.create(
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
