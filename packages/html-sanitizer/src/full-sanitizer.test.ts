// Mirrors rails-html-sanitizer test/sanitizer_test.rb -> FullSanitizerTest.
// Test names track Rails' test_* methods for test:compare alignment.
// Where libxml2/Loofah outputs differ from sanitize-html/htmlparser2 we
// document the divergence in the assertion comment.

import { describe, expect, test } from "vitest";
import { FullSanitizer } from "./full-sanitizer.js";

const fullSanitize = (input: string | null | undefined) => new FullSanitizer().sanitize(input);

describe("FullSanitizer", () => {
  test("strip_invalid_html", () => {
    expect(fullSanitize("<<<bad html")).toBe("&lt;&lt;");
  });

  test("escape_tags_with_many_open_quotes", () => {
    expect(fullSanitize("<<<bad html>")).toBe("&lt;&lt;");
  });

  test("strip_tags_multiline", () => {
    const input =
      '<h1>This is <b>a <a href="" target="_blank">test</a></b>.</h1>\n\n<!-- it has a comment -->\n\n<p>It no <b>longer <strong>contains <em>any <strike>HTML</strike></em>.</strong></b></p>\n';
    // Rails output is multi-line; sanitize-html collapses block-tag
    // boundaries without inserting Loofah's trailing newlines. Assert
    // the meaningful content survives and tags are gone.
    const out = fullSanitize(input)!;
    expect(out).toContain("This is a test.");
    expect(out).toContain("It no longer contains any HTML.");
    expect(out).not.toMatch(/<[^>]+>/);
  });

  test("strip_blank_string", () => {
    expect(fullSanitize(null)).toBeNull();
    expect(fullSanitize(undefined)).toBeUndefined();
    expect(fullSanitize("")).toBe("");
    expect(fullSanitize("   ")).toBe("   ");
  });

  test("strip_tags_with_plaintext", () => {
    expect(fullSanitize("Don't touch me")).toBe("Don't touch me");
  });

  test("strip_tags_with_tags", () => {
    expect(
      fullSanitize("<p>This <u>is<u> a <a href='test.html'><strong>test</strong></a>.</p>"),
    ).toBe("This is a test.");
  });

  test("strip_tags_with_sentence", () => {
    expect(fullSanitize("This is a test.")).toBe("This is a test.");
  });

  test("strip_tags_with_comment", () => {
    expect(fullSanitize("This has a <!-- comment --> here.")).toBe("This has a  here.");
  });

  test("full_sanitize_respect_html_escaping_of_the_given_string", () => {
    expect(fullSanitize("test\\r\\nstring")).toBe("test\\r\\nstring");
    expect(fullSanitize("&")).toBe("&amp;");
    expect(fullSanitize("&amp;")).toBe("&amp;");
    expect(fullSanitize("&amp;amp;")).toBe("&amp;amp;");
    expect(fullSanitize("omg &lt;script&gt;BOM&lt;/script&gt;")).toBe(
      "omg &lt;script&gt;BOM&lt;/script&gt;",
    );
  });

  test("strip_script_contents", () => {
    // Not in Rails' FullSanitizer suite by this name, but Rails docs
    // guarantee scripts are stripped along with their contents.
    expect(fullSanitize("hi <script>alert(1)</script> bye")).toBe("hi  bye");
  });
});
