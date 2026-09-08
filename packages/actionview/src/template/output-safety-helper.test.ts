import { describe, it, expect } from "vitest";
import { raw, safeJoin, toSentence } from "../helpers/output-safety-helper.js";
import { htmlSafe, htmlEscape } from "@blazetrails/activesupport";

describe("OutputSafetyHelperTest", () => {
  it("raw returns the safe string", () => {
    const result = raw("hello");
    expect(result.toString()).toBe("hello");
    expect(result.htmlSafe).toBe(true);
  });

  it("raw handles nil values correctly", () => {
    expect(raw(null).toString()).toBe("");
  });

  it("safe_join should html_escape any items, including the separator, if they are not html_safe", () => {
    let joined = safeJoin([raw("<p>foo</p>"), "<p>bar</p>"], "<br />");
    expect(joined.toString()).toBe("<p>foo</p>&lt;br /&gt;&lt;p&gt;bar&lt;/p&gt;");

    joined = safeJoin([raw("<p>foo</p>"), raw("<p>bar</p>")], raw("<br />"));
    expect(joined.toString()).toBe("<p>foo</p><br /><p>bar</p>");
  });

  it("safe_join should work recursively similarly to Array.join", () => {
    let joined = safeJoin(["a", ["b", "c"]], ":");
    expect(joined.toString()).toBe("a:b:c");

    joined = safeJoin(['"a"', ["<b>", "<c>"]], " <br/> ");
    expect(joined.toString()).toBe("&quot;a&quot; &lt;br/&gt; &lt;b&gt; &lt;br/&gt; &lt;c&gt;");
  });

  it("safe_join should return the safe string separated by $, when second argument is not passed", () => {
    const joined = safeJoin(["a", "b"]);
    expect(joined.toString()).toBe("ab");
  });

  it("to_sentence should escape non-html_safe values", () => {
    let actual = toSentence(["<", ">", "&", "'", '"']);
    expect(actual.htmlSafe).toBe(true);
    expect(actual.toString()).toBe("&lt;, &gt;, &amp;, &#39;, and &quot;");

    actual = toSentence(["<script>"]);
    expect(actual.htmlSafe).toBe(true);
    expect(actual.toString()).toBe("&lt;script&gt;");
  });

  it("to_sentence does not double escape if single value is html_safe", () => {
    expect(toSentence([htmlEscape("<script>")]).toString()).toBe("&lt;script&gt;");
    expect(toSentence([htmlSafe("&lt;script&gt;")]).toString()).toBe("&lt;script&gt;");
    expect(toSentence(["&lt;script&gt;"]).toString()).toBe("&amp;lt;script&amp;gt;");
  });

  it("to_sentence connector words are checked for HTML safety", () => {
    expect(
      toSentence(["one", "two", "three"], {
        wordsConnector: htmlSafe(" & "),
      }).toString(),
    ).toBe("one & two, and three");
    expect(
      toSentence(["one", "two"], {
        twoWordsConnector: htmlSafe(" & "),
      }).toString(),
    ).toBe("one & two");
    expect(
      toSentence(["one", "two", "three"], {
        lastWordConnector: " <script>alert(1)</script> ",
      }).toString(),
    ).toBe("one, two &lt;script&gt;alert(1)&lt;/script&gt; three");
  });

  it("to_sentence should not escape html_safe values", () => {
    const url = "https://example.com";
    const linkTag = htmlSafe(`<a href="${url}">${url}</a>`);
    const pTag = htmlSafe("<p>&lt;marquee&gt;shady stuff&lt;/marquee&gt;<br /></p>");
    const expected = `<a href="${url}">${url}</a> and <p>&lt;marquee&gt;shady stuff&lt;/marquee&gt;<br /></p>`;
    const actual = toSentence([linkTag, pTag]);
    expect(actual.htmlSafe).toBe(true);
    expect(actual.toString()).toBe(expected);
  });

  it("to_sentence handles blank strings", () => {
    const actual = toSentence(["", "two", "three"]);
    expect(actual.htmlSafe).toBe(true);
    expect(actual.toString()).toBe(", two, and three");
  });

  it("to_sentence handles nil values", () => {
    const actual = toSentence([null, "two", "three"]);
    expect(actual.htmlSafe).toBe(true);
    expect(actual.toString()).toBe(", two, and three");
  });

  it("to_sentence still supports ActiveSupports Array#to_sentence arguments", () => {
    expect(toSentence(["one", "two", "three"], { wordsConnector: " " }).toString()).toBe(
      "one two, and three",
    );
    expect(
      toSentence(["one", "two", "three"], {
        wordsConnector: htmlSafe(" & "),
      }).toString(),
    ).toBe("one & two, and three");
    expect(
      toSentence(["one", "two", "three"], {
        wordsConnector: null,
      }).toString(),
    ).toBe("onetwo, and three");
    expect(
      toSentence(["one", "two", "three"], {
        lastWordConnector: ", and also ",
      }).toString(),
    ).toBe("one, two, and also three");
    expect(
      toSentence(["one", "two", "three"], {
        lastWordConnector: null,
      }).toString(),
    ).toBe("one, twothree");
    expect(
      toSentence(["one", "two", "three"], {
        lastWordConnector: " ",
      }).toString(),
    ).toBe("one, two three");
    expect(
      toSentence(["one", "two", "three"], {
        lastWordConnector: " and ",
      }).toString(),
    ).toBe("one, two and three");
  });

  it("to_sentence is not affected by $,", () => {
    expect(toSentence(["one", "two"]).toString()).toBe("one and two");
    expect(toSentence(["one", "two", "three"]).toString()).toBe("one, two, and three");
  });
});
