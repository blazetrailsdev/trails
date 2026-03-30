import { describe, it, expect } from "vitest";
import { htmlEscape, h, htmlEscapeOnce, jsonEscape } from "../helpers/ejs-util.js";
import { htmlSafe, SafeBuffer } from "@blazetrails/activesupport";

const HTML_ESCAPE_TEST_CASES: [string, string][] = [
  ["<br>", "&lt;br&gt;"],
  ["a & b", "a &amp; b"],
  ['"quoted" string', "&quot;quoted&quot; string"],
  ["'quoted' string", "&#39;quoted&#39; string"],
  [
    '<script type="application/javascript">alert("You are \'pwned\'!")</script>',
    "&lt;script type=&quot;application/javascript&quot;&gt;alert(&quot;You are &#39;pwned&#39;!&quot;)&lt;/script&gt;",
  ],
];

const JSON_ESCAPE_TEST_CASES: [string, string][] = [
  ["1", "1"],
  ["null", "null"],
  ['"&"', '"\\u0026"'],
  ['"</script>"', '"\\u003c/script\\u003e"'],
  ['["</script>"]', '["\\u003c/script\\u003e"]'],
  ['{"name":"</script>"}', '{"name":"\\u003c/script\\u003e"}'],
  ['{"name":"d\u2028h\u2029h"}', '{"name":"d\\u2028h\\u2029h"}'],
];

describe("EjsUtilTest", () => {
  it("html escape", () => {
    for (const [raw, expected] of HTML_ESCAPE_TEST_CASES) {
      expect(htmlEscape(raw).toString()).toBe(expected);
    }
  });

  it("json escape", () => {
    for (const [raw, expected] of JSON_ESCAPE_TEST_CASES) {
      expect(jsonEscape(raw).toString()).toBe(expected);
    }
  });

  it("json escape does not alter json string meaning", () => {
    for (const [raw] of JSON_ESCAPE_TEST_CASES) {
      const expected = JSON.parse(raw);
      const escaped = jsonEscape(raw) as string;
      const actual = JSON.parse(escaped);
      if (expected === null) {
        expect(actual).toBeNull();
      } else {
        expect(actual).toEqual(expected);
      }
    }
  });

  it("json escape is idempotent", () => {
    for (const [raw] of JSON_ESCAPE_TEST_CASES) {
      const once = jsonEscape(raw) as string;
      const twice = jsonEscape(once) as string;
      expect(once).toBe(twice);
    }
  });

  it("json escape returns unsafe strings when passed unsafe strings", () => {
    const value = jsonEscape("asdf");
    expect(value instanceof SafeBuffer && value.htmlSafe).toBe(false);
  });

  it("json escape returns safe strings when passed safe strings", () => {
    const value = jsonEscape(htmlSafe("asdf"));
    expect(value instanceof SafeBuffer && value.htmlSafe).toBe(true);
  });

  it("html escape is html safe", () => {
    const escaped = h("<p>");
    expect(escaped.toString()).toBe("&lt;p&gt;");
    expect(escaped.htmlSafe).toBe(true);
  });

  it("html escape passes html escape unmodified", () => {
    const escaped = h(htmlSafe("<p>"));
    expect(escaped.toString()).toBe("<p>");
    expect(escaped.htmlSafe).toBe(true);
  });

  it("rest in ascii", () => {
    for (let i = 0; i <= 127; i++) {
      const chr = String.fromCharCode(i);
      if ("'\"&<>".includes(chr)) continue;
      expect(htmlEscape(chr).toString()).toBe(chr);
    }
  });

  it("html escape once", () => {
    expect(htmlEscapeOnce("1 <>&\"' 2 &amp; 3").toString()).toBe(
      "1 &lt;&gt;&amp;&quot;&#39; 2 &amp; 3",
    );
    expect(htmlEscapeOnce(" &#X27; &#x27; &#x03BB; &#X03bb; \" ' < > ").toString()).toBe(
      " &#X27; &#x27; &#x03BB; &#X03bb; &quot; &#39; &lt; &gt; ",
    );
  });

  it("html escape once returns safe strings when passed unsafe strings", () => {
    const value = htmlEscapeOnce("1 < 2 &amp; 3");
    expect(value.htmlSafe).toBe(true);
  });

  it("html escape once returns safe strings when passed safe strings", () => {
    const value = htmlEscapeOnce("1 < 2 &amp; 3");
    expect(value.htmlSafe).toBe(true);
  });

  it("html escape amp", () => {
    expect(htmlEscape("&").toString()).toBe("&amp;");
  });

  it("html escape lt", () => {
    expect(htmlEscape("<").toString()).toBe("&lt;");
  });

  it("html escape gt", () => {
    expect(htmlEscape(">").toString()).toBe("&gt;");
  });

  it("html escape quot", () => {
    expect(htmlEscape('"').toString()).toBe("&quot;");
  });

  it("html escape 39", () => {
    expect(htmlEscape("'").toString()).toBe("&#39;");
  });
});
