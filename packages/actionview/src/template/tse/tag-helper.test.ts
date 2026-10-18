import { describe, expect, it } from "vitest";
import "../../test-helpers/abstract-unit.js";
import { renderContent } from "../../test-helpers/tse-block-test-case.js";

describe("TagHelperTest", () => {
  it("percent equals works for content_tag and does not require parenthesis on method call", async () => {
    expect(await renderContent('contentTag("div", null, null, true, ', "Hello world")).toBe(
      "<div>Hello world</div>",
    );
  });

  it("percent equals works for javascript_tag", async () => {
    const expectedOutput = "<script>\n//<![CDATA[\nalert('Hello')\n//]]>\n</script>";
    expect(await renderContent("javascriptTag(null, {}, ", "alert('Hello')")).toBe(expectedOutput);
  });

  it("percent equals works for javascript_tag with options", async () => {
    const expectedOutput =
      "<script id=\"the_js_tag\">\n//<![CDATA[\nalert('Hello')\n//]]>\n</script>";
    expect(await renderContent("javascriptTag({ id: 'the_js_tag' }, {}, ", "alert('Hello')")).toBe(
      expectedOutput,
    );
  });

  it("percent equals works with form tags", async () => {
    const expectedOutput = /<form.*action="\/foo".*method="post">.*hello*<\/form>/;
    expect(await renderContent("formTag('/foo', {}, ", "<%= 'hello' %>")).toMatch(expectedOutput);
  });

  it("percent equals works with fieldset tags", async () => {
    const expectedOutput = "<fieldset><legend>foo</legend>hello</fieldset>";
    expect(await renderContent("fieldSetTag('foo', null, ", "<%= 'hello' %>")).toBe(expectedOutput);
  });
});
