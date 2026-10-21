import { describe, expect, it } from "vitest";
import { htmlSafe, SafeBuffer } from "@blazetrails/activesupport";

import { OutputBuffer } from "../buffers.js";
import { OutputFlow } from "../flows.js";
import {
  escapeJavascript,
  j,
  javascriptCdataSection,
  javascriptTag,
} from "../helpers/javascript-helper.js";
import { Base } from "../base.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

function host() {
  return {
    outputBuffer: null as OutputBuffer | null,
    viewFlow: new OutputFlow(),
    contentSecurityPolicyNonce: () => null,
  };
}

describe("JavaScriptHelperTest", () => {
  it("escape javascript", () => {
    expect(escapeJavascript(null).toString()).toBe("");
    expect(escapeJavascript(123).toString()).toBe("123");
    expect(escapeJavascript("en").toString()).toBe("en");
    expect(escapeJavascript(false).toString()).toBe("false");
    expect(escapeJavascript(true).toString()).toBe("true");
    expect(escapeJavascript('This "thing" is really\n netos\'').toString()).toBe(
      'This \\"thing\\" is really\\n netos\\\'',
    );
    expect(escapeJavascript("backslash\\test").toString()).toBe("backslash\\\\test");
    expect(escapeJavascript("don't </close> tags").toString()).toBe("don\\'t <\\/close> tags");
    expect(escapeJavascript("unicode \u2028 newline").toString()).toBe("unicode &#x2028; newline");
    expect(escapeJavascript("unicode \u2029 newline").toString()).toBe("unicode &#x2029; newline");

    expect(j("don't </close> tags").toString()).toBe("don\\'t <\\/close> tags");
  });

  it("escape backtick", () => {
    expect(escapeJavascript("`").toString()).toBe("\\`");
  });

  it("escape dollar sign", () => {
    expect(escapeJavascript("$").toString()).toBe("\\$");
  });

  it("escape javascript with safebuffer", () => {
    const given = "'quoted' \"double-quoted\" new-line:\n </closed>";
    const expectedStr = "\\'quoted\\' \\\"double-quoted\\\" new-line:\\n <\\/closed>";
    expect(escapeJavascript(given).toString()).toBe(expectedStr);
    expect(escapeJavascript(htmlSafe(given)).toString()).toBe(expectedStr);
    expect(Object(escapeJavascript(given))).toBeInstanceOf(String);
    expect(escapeJavascript(new SafeBuffer(given))).toBeInstanceOf(SafeBuffer);
  });

  it("javascript tag", () => {
    const ctx = host();
    ctx.outputBuffer = new OutputBuffer("foo");
    assertDomEqual(
      "<script>\n//<![CDATA[\nalert('hello')\n//]]>\n</script>",
      javascriptTag.call(ctx, "alert('hello')"),
    );
    expect(
      ctx.outputBuffer.toString().toString(),
      "javascript_tag without a block should not concat to output_buffer",
    ).toBe("foo");
  });

  it("javascript include tag", () => {
    const view = new (Base.withEmptyTemplateCache())(null, {}, null) as Base &
      Record<string, (...args: unknown[]) => unknown>;
    assertDomEqual("<script src='/foo.js'></script>", view.javascriptIncludeTag("/foo"));
    assertDomEqual(
      "<script src='/foo'></script>",
      view.javascriptIncludeTag("/foo", { extname: false }),
    );
    assertDomEqual(
      "<script src='/foo.bar'></script>",
      view.javascriptIncludeTag("/foo", { extname: ".bar" }),
    );
  });

  it("javascript tag with options", () => {
    assertDomEqual(
      "<script id=\"the_js_tag\">\n//<![CDATA[\nalert('hello')\n//]]>\n</script>",
      javascriptTag.call(host(), "alert('hello')", { id: "the_js_tag" }),
    );
  });

  it("javascript cdata section", () => {
    assertDomEqual(
      "\n//<![CDATA[\nalert('hello')\n//]]>\n",
      javascriptCdataSection("alert('hello')"),
    );
  });
});
