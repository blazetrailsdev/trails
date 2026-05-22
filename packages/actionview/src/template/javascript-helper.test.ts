import { describe, expect, it } from "vitest";
import { htmlSafe, SafeBuffer } from "@blazetrails/activesupport";

import { OutputBuffer } from "../buffers.js";
import { OutputFlow } from "../flows.js";
import { concat } from "../helpers/text-helper.js";
import {
  escapeJavascript,
  j,
  javascriptCdataSection,
  javascriptTag,
} from "../helpers/javascript-helper.js";

function host() {
  return { outputBuffer: null as OutputBuffer | null, viewFlow: new OutputFlow() };
}

describe("JavaScriptHelperTest", () => {
  it("escape javascript", () => {
    expect(escapeJavascript(null).toString()).toBe("");
    expect(escapeJavascript(123).toString()).toBe("123");
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
    const unsafeResult = escapeJavascript(given);
    expect(unsafeResult instanceof SafeBuffer).toBe(false);
    const safeResult = escapeJavascript(htmlSafe(given));
    expect(safeResult instanceof SafeBuffer).toBe(true);
    expect((safeResult as SafeBuffer).htmlSafe).toBe(true);
  });

  it("javascript tag", () => {
    const ctx = host();
    ctx.outputBuffer = new OutputBuffer("foo");
    const result = javascriptTag.call(ctx, "alert('hello')").toString();
    expect(result).toBe("<script>\n//<![CDATA[\nalert('hello')\n//]]>\n</script>");
    expect(ctx.outputBuffer.toString().toString()).toBe("foo");
  });

  it("javascript tag with options", () => {
    const result = javascriptTag.call(undefined, "alert('hello')", { id: "the_js_tag" }).toString();
    expect(result).toBe(
      "<script id=\"the_js_tag\">\n//<![CDATA[\nalert('hello')\n//]]>\n</script>",
    );
  });

  it("javascript tag with block", () => {
    const ctx = { outputBuffer: new OutputBuffer(), viewFlow: new OutputFlow() };
    const result = javascriptTag
      .call(ctx, { type: "application/javascript" }, () => {
        concat.call(ctx, htmlSafe("alert('hello')"));
      })
      .toString();
    expect(result).toBe(
      "<script type=\"application/javascript\">\n//<![CDATA[\nalert('hello')\n//]]>\n</script>",
    );
  });

  it("javascript cdata section", () => {
    expect(javascriptCdataSection("alert('hello')").toString()).toBe(
      "\n//<![CDATA[\nalert('hello')\n//]]>\n",
    );
  });
});
