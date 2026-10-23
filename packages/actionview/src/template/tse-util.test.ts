import { describe, it, expect } from "vitest";
import {
  htmlEscape,
  h,
  htmlEscapeOnce,
  jsonEscape,
  htmlSafe,
  SafeBuffer,
} from "@blazetrails/activesupport";

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

describe("TseUtilTest", () => {
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

  it("json escape u0026", () => {
    expect(jsonEscape("&").toString()).toBe("\\u0026");
  });

  it("json escape u003e", () => {
    expect(jsonEscape(">").toString()).toBe("\\u003e");
  });

  it("json escape u003c", () => {
    expect(jsonEscape("<").toString()).toBe("\\u003c");
  });

  it("json escape u2028", () => {
    expect(jsonEscape("\u2028").toString()).toBe("\\u2028");
  });

  it("json escape u2029", () => {
    expect(jsonEscape("\u2029").toString()).toBe("\\u2029");
  });

  it("json escape does not alter json string meaning", () => {
    /* eslint-disable vitest/no-conditional-expect -- Rails branches on `expected.nil?` (erb_util_test.rb:64-68) */
    for (const [raw] of JSON_ESCAPE_TEST_CASES) {
      const expected = JSON.parse(raw);
      if (expected == null) {
        expect(JSON.parse(jsonEscape(raw) as string)).toBeNull();
      } else {
        expect(JSON.parse(jsonEscape(raw) as string)).toEqual(expected);
      }
    }
    /* eslint-enable vitest/no-conditional-expect */
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
    expect(value instanceof SafeBuffer && value.htmlSafe).toBeFalsy();
  });

  it("json escape returns safe strings when passed safe strings", () => {
    const value = jsonEscape(htmlSafe("asdf"));
    expect(value instanceof SafeBuffer && value.htmlSafe).toBeTruthy();
  });

  it("html escape is html safe", () => {
    const escaped = h("<p>");
    expect(escaped.toString()).toBe("&lt;p&gt;");
    expect(escaped.htmlSafe).toBeTruthy();
  });

  it("html escape passes html escape unmodified", () => {
    const escaped = h(htmlSafe("<p>"));
    expect(escaped.toString()).toBe("<p>");
    expect(escaped.htmlSafe).toBeTruthy();
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
    expect(value.htmlSafe).toBeTruthy();
  });

  it("html escape once returns safe strings when passed safe strings", () => {
    const value = htmlEscapeOnce("1 < 2 &amp; 3");
    expect(value.htmlSafe).toBeTruthy();
  });
});
