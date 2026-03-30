import { describe, it, expect } from "vitest";
import {
  escapeJavascript,
  j,
  javascriptTag,
  javascriptCdataSection,
} from "../helpers/javascript-helper.js";
import { htmlSafe, SafeBuffer } from "@blazetrails/activesupport";

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
    // Unsafe string returns plain string
    const unsafeResult = escapeJavascript(given);
    expect(unsafeResult instanceof SafeBuffer).toBe(false);
    // Safe string returns SafeBuffer
    const safeResult = escapeJavascript(htmlSafe(given));
    expect(safeResult instanceof SafeBuffer).toBe(true);
    expect((safeResult as SafeBuffer).htmlSafe).toBe(true);
  });

  it("javascript tag", () => {
    const result = javascriptTag("alert('hello')").toString();
    expect(result).toBe("<script>\n//<![CDATA[\nalert('hello')\n//]]>\n</script>");
  });

  it("javascript tag with options", () => {
    const result = javascriptTag("alert('hello')", {
      id: "the_js_tag",
    }).toString();
    expect(result).toBe(
      "<script id=\"the_js_tag\">\n//<![CDATA[\nalert('hello')\n//]]>\n</script>",
    );
  });

  it("javascript cdata section", () => {
    expect(javascriptCdataSection("alert('hello')").toString()).toBe(
      "\n//<![CDATA[\nalert('hello')\n//]]>\n",
    );
  });
});
