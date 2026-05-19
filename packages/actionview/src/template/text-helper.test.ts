import { describe, expect, it } from "vitest";
import type { SafeBuffer } from "@blazetrails/activesupport";
import { pluralize, simpleFormat, truncate, wordWrap } from "../helpers/text-helper.js";
import { raw } from "../helpers/output-safety-helper.js";

// Mirrors actionview/test/template/text_helper_test.rb. Only the methods
// implemented in this PR (truncate/pluralize/wordWrap/simpleFormat) are
// covered; highlight/excerpt/cycle/concat are follow-ups.

const linkTo = (label: string, _href: string): SafeBuffer => raw(`<a href="#">${label}</a>`);

describe("TextHelperTest", () => {
  it("simple_format should be html_safe", () => {
    expect(simpleFormat("<b> test with HTML tags </b>").htmlSafe).toBe(true);
  });

  it("simple_format", () => {
    expect(simpleFormat(null).toString()).toBe("<p></p>");
    expect(simpleFormat("ridiculous\r\n cross\r platform linebreaks").toString()).toBe(
      "<p>ridiculous\n<br /> cross\n<br /> platform linebreaks</p>",
    );
    expect(simpleFormat("A paragraph\n\nand another one!").toString()).toBe(
      "<p>A paragraph</p>\n\n<p>and another one!</p>",
    );
    expect(simpleFormat("A paragraph\n With a newline").toString()).toBe(
      "<p>A paragraph\n<br /> With a newline</p>",
    );

    expect(simpleFormat("A\nB\nC\nD").toString()).toBe("<p>A\n<br />B\n<br />C\n<br />D</p>");

    expect(simpleFormat("A\r\n  \nB\n\n\r\n\t\nC\nD").toString()).toBe(
      "<p>A\n<br />  \n<br />B</p>\n\n<p>\t\n<br />C\n<br />D</p>",
    );

    expect(simpleFormat("This is a classy test", { class: "test" }).toString()).toBe(
      '<p class="test">This is a classy test</p>',
    );
    expect(simpleFormat("para 1\n\npara 2", { class: "test" }).toString()).toBe(
      '<p class="test">para 1</p>\n\n<p class="test">para 2</p>',
    );
  });

  it("simple_format should sanitize input when sanitize option is not false", () => {
    expect(simpleFormat("<b> test with unsafe string </b><script>code!</script>").toString()).toBe(
      "<p><b> test with unsafe string </b>code!</p>",
    );
  });

  it("simple_format should sanitize input when sanitize option is true", () => {
    expect(
      simpleFormat(
        "<b> test with unsafe string </b><script>code!</script>",
        {},
        { sanitize: true },
      ).toString(),
    ).toBe("<p><b> test with unsafe string </b>code!</p>");
  });

  it("simple_format should not sanitize input when sanitize option is false", () => {
    expect(
      simpleFormat(
        "<b> test with unsafe string </b><script>code!</script>",
        {},
        { sanitize: false },
      ).toString(),
    ).toBe("<p><b> test with unsafe string </b><script>code!</script></p>");
  });

  it("simple_format with custom wrapper", () => {
    expect(simpleFormat(null, {}, { wrapperTag: "div" }).toString()).toBe("<div></div>");
    expect(simpleFormat(null, {}, { wrapperTag: undefined }).toString()).toBe("<p></p>");
  });

  it("simple_format with custom wrapper and multi line breaks", () => {
    expect(
      simpleFormat(
        "We want to put a wrapper...\n\n...right there.",
        {},
        { wrapperTag: "div" },
      ).toString(),
    ).toBe("<div>We want to put a wrapper...</div>\n\n<div>...right there.</div>");
  });

  it("simple_format should not change the text passed", () => {
    const text = "<b>Ok</b><script>code!</script>";
    const before = text;
    simpleFormat(text);
    expect(text).toBe(before);
  });

  it("simple_format does not modify the html_options hash", () => {
    const options = { class: "foobar" };
    const passed = { ...options };
    simpleFormat("some text", passed);
    expect(passed).toEqual(options);
  });

  it("simple_format does not modify the options hash", () => {
    const options = { wrapperTag: "div", sanitize: false };
    const passed = { ...options };
    simpleFormat("some text", {}, passed);
    expect(passed).toEqual(options);
  });

  it("truncate", () => {
    expect(truncate("Hello World!", { length: 12 })?.toString()).toBe("Hello World!");
    expect(truncate("Hello World!!", { length: 12 })?.toString()).toBe("Hello Wor...");
  });

  it("truncate should use default length of 30", () => {
    const str = "This is a string that will go longer then the default truncate length of 30";
    expect(truncate(str)?.toString()).toBe(str.slice(0, 27) + "...");
  });

  it("truncate with options hash", () => {
    expect(
      truncate("This is a string that will go longer then the default truncate length of 30", {
        omission: "[...]",
      })?.toString(),
    ).toBe("This is a string that wil[...]");
    expect(truncate("Hello World!", { length: 10 })?.toString()).toBe("Hello W...");
    expect(truncate("Hello World!", { omission: "[...]", length: 10 })?.toString()).toBe(
      "Hello[...]",
    );
    expect(
      truncate("Hello Big World!", { omission: "[...]", length: 13, separator: " " })?.toString(),
    ).toBe("Hello[...]");
    expect(
      truncate("Hello Big World!", { omission: "[...]", length: 14, separator: " " })?.toString(),
    ).toBe("Hello Big[...]");
    expect(
      truncate("Hello Big World!", { omission: "[...]", length: 15, separator: " " })?.toString(),
    ).toBe("Hello Big[...]");
  });

  it("truncate multibyte", () => {
    expect(truncate("아리랑 아리 아라리오", { length: 10 })?.toString()).toBe("아리랑 아리 ...");
  });

  it("truncate does not modify the options hash", () => {
    const options = { length: 10 };
    const passed = { ...options };
    truncate("some text", passed);
    expect(passed).toEqual(options);
  });

  it("truncate with link options", () => {
    expect(
      truncate("Here is a long test and I need a continue to read link", { length: 27 }, () =>
        linkTo("Continue", "#"),
      )?.toString(),
    ).toBe('Here is a long test and ...<a href="#">Continue</a>');
  });

  it("truncate should be html_safe", () => {
    expect(truncate("Hello World!", { length: 12 })?.htmlSafe).toBe(true);
  });

  it("truncate should escape the input", () => {
    expect(truncate("Hello <script>code!</script>World!!", { length: 12 })?.toString()).toBe(
      "Hello &lt;sc...",
    );
  });

  it("truncate should not escape the input with escape false", () => {
    expect(
      truncate("Hello <script>code!</script>World!!", { length: 12, escape: false })?.toString(),
    ).toBe("Hello <sc...");
  });

  it("truncate with escape false should be html_safe", () => {
    expect(
      truncate("Hello <script>code!</script>World!!", { length: 12, escape: false })?.htmlSafe,
    ).toBe(true);
  });

  it("truncate with block should be html_safe", () => {
    const out = truncate(
      "Here's a long test and I need a continue to read link",
      { length: 27 },
      () => linkTo("Continue", "#"),
    );
    expect(out?.htmlSafe).toBe(true);
  });

  it("truncate with block should escape the input", () => {
    expect(
      truncate(
        "<script>code!</script>Here's a long test and I need a continue to read link",
        { length: 27 },
        () => linkTo("Continue", "#"),
      )?.toString(),
    ).toBe('&lt;script&gt;code!&lt;/script&gt;He...<a href="#">Continue</a>');
  });

  it("truncate with block should not escape the input with escape false", () => {
    expect(
      truncate(
        "<script>code!</script>Here's a long test and I need a continue to read link",
        { length: 27, escape: false },
        () => linkTo("Continue", "#"),
      )?.toString(),
    ).toBe('<script>code!</script>He...<a href="#">Continue</a>');
  });

  it("truncate with block with escape false should be html_safe", () => {
    const out = truncate(
      "<script>code!</script>Here's a long test and I need a continue to read link",
      { length: 27, escape: false },
      () => linkTo("Continue", "#"),
    );
    expect(out?.htmlSafe).toBe(true);
  });

  it("truncate with block should escape the block", () => {
    expect(
      truncate(
        "Here is a long test and I need a continue to read link",
        { length: 27 },
        () => "<script>alert('foo');</script>",
      )?.toString(),
    ).toBe("Here is a long test and ...&lt;script&gt;alert(&#39;foo&#39;);&lt;/script&gt;");
  });

  it("word_wrap", () => {
    const input = "123 1234 12 12 123 1 1 1 123";
    expect(wordWrap(input, { lineWidth: 3 })).toBe("123\n1234\n12\n12\n123\n1 1\n1\n123");
    expect(wordWrap(input, { lineWidth: 3, breakSequence: "-+" })).toBe(
      "123-+1234-+12-+12-+123-+1 1-+1-+123",
    );
  });

  it("word_wrap with newlines", () => {
    const input = "1\n1 1 1\n1";
    expect(wordWrap(input, { lineWidth: 3 })).toBe("1\n1 1\n1\n1");
    expect(wordWrap(input, { lineWidth: 3, breakSequence: "-+" })).toBe("1-+1 1-+1-+1");
  });

  it("word_wrap with multiple consecutive newlines", () => {
    const input = "1\n\n\n1 1 1\n\n\n1";
    expect(wordWrap(input, { lineWidth: 3 })).toBe("1\n\n\n1 1\n1\n\n\n1");
    expect(wordWrap(input, { lineWidth: 3, breakSequence: "-+" })).toBe("1-+-+-+1 1-+1-+-+-+1");
  });

  it("word_wrap with trailing newlines", () => {
    const input = "1\n1 1 1\n1\n\n\n";
    expect(wordWrap(input, { lineWidth: 3 })).toBe("1\n1 1\n1\n1");
    expect(wordWrap(input, { lineWidth: 3, breakSequence: "-+" })).toBe("1-+1 1-+1-+1");
  });

  it("word_wrap with leading spaces", () => {
    const input = "  1 1\n  1 1\n";
    expect(wordWrap(input, { lineWidth: 3 })).toBe("  1\n1\n  1\n1");
    expect(wordWrap(input, { lineWidth: 3, breakSequence: "-+" })).toBe("  1-+1-+  1-+1");
  });

  it("word_wrap when no wrapping is necessary", () => {
    expect(wordWrap("1", { lineWidth: 3 })).toBe("1");
    expect(wordWrap("", { lineWidth: 3 })).toBe("");
  });

  it("pluralization", () => {
    expect(pluralize(1, "count")).toBe("1 count");
    expect(pluralize(2, "count")).toBe("2 counts");
    expect(pluralize("1", "count")).toBe("1 count");
    expect(pluralize("2", "count")).toBe("2 counts");
    expect(pluralize("1,066", "count")).toBe("1,066 counts");
    expect(pluralize("1.25", "count")).toBe("1.25 counts");
    expect(pluralize("1.0", "count")).toBe("1.0 count");
    expect(pluralize("1.00", "count")).toBe("1.00 count");
    expect(pluralize(2, "count", "counters")).toBe("2 counters");
    expect(pluralize(null, "count", "counters")).toBe("0 counters");
    expect(pluralize(2, "count", { plural: "counters" })).toBe("2 counters");
    expect(pluralize(null, "count", { plural: "counters" })).toBe("0 counters");
    expect(pluralize(2, "person")).toBe("2 people");
    expect(pluralize(10, "buffalo")).toBe("10 buffaloes");
    expect(pluralize(1, "berry")).toBe("1 berry");
    expect(pluralize(12, "berry")).toBe("12 berries");
  });
});
