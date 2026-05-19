// Mirrors rails-html-sanitizer test/sanitizer_test.rb -> SafeListSanitizerTest.
// Test names track Rails' test_* methods for test:compare alignment.
//
// Rails' suite is heavily intertwined with libxml2 / Loofah specifics
// (many tests use `acceptable_results = [...]` to span libxml2 versions
// and the gumbo/neko parsers). For engine-divergent cases we assert the
// security-relevant invariant (no scripts, no js: URLs) rather than the
// exact byte-for-byte output.

import { afterEach, describe, expect, test } from "vitest";
import { SafeListSanitizer } from "./safe-list-sanitizer.js";
import { DEFAULT_ALLOWED_ATTRIBUTES, DEFAULT_ALLOWED_TAGS } from "./config.js";

const sanitize = (
  input: string | null | undefined,
  options?: { tags?: Iterable<string>; attributes?: Iterable<string> },
) => new SafeListSanitizer().sanitize(input, options);

const assertSanitized = (raw: string, expected?: string) => {
  expect(sanitize(raw)).toBe(expected ?? raw);
};

describe("SafeListSanitizer", () => {
  afterEach(() => {
    // Reset class-level state mutated by scope_* helpers.
    SafeListSanitizer.allowedTags = new Set(DEFAULT_ALLOWED_TAGS);
    SafeListSanitizer.allowedAttributes = new Set(DEFAULT_ALLOWED_ATTRIBUTES);
  });

  test("sanitize_form", () => {
    assertSanitized('<form action="/foo/bar" method="post"><input></form>', "");
  });

  test("sanitize_script", () => {
    assertSanitized(
      'a b c<script language="Javascript">blah blah blah</script>d e f',
      "a b cd e f",
    );
  });

  test("sanitize_js_handlers", () => {
    expect(
      sanitize(
        `onthis="do that" <a href="#" onclick="hello" name="foo" onbogus="remove me">hello</a>`,
      ),
    ).toBe(`onthis="do that" <a href="#" name="foo">hello</a>`);
  });

  test("sanitize_javascript_href", () => {
    // javascript:-scheme URLs are dropped from the actual <a>/<span>
    // attributes. The bare prefix text outside any tag survives as
    // plain text — that matches Rails (the leading `href="javascript:bang" `
    // is text, not an attribute).
    const out = sanitize(
      `href="javascript:bang" <a href="javascript:bang" name="hello">foo</a>, <span href="javascript:bang">bar</span>`,
    )!;
    expect(out).toContain(`<a name="hello">foo</a>`);
    expect(out).toContain(`<span>bar</span>`);
    // No javascript: scheme on any actual element attribute.
    expect(out).not.toMatch(/<[^>]+\bhref="javascript:/i);
  });

  test("should_allow_anchors", () => {
    // Divergence from Rails: sanitize-html unconditionally discards
    // <script>/<style> tag *contents* as a security measure (cannot be
    // disabled). Loofah strips the tag and keeps "baz" — Rails output
    // would be `<a href="foo">baz</a>`. We get the empty <a> instead,
    // which is strictly safer. Revisit when PR 3 swaps engine internals.
    expect(sanitize(`<a href="foo" onclick="bar"><script>baz</script></a>`)).toBe(
      `<a href="foo"></a>`,
    );
  });

  test("allow_colons_in_path_component", () => {
    assertSanitized(`<a href="./this:that">foo</a>`);
  });

  for (const attr of ["src", "width", "height", "alt"]) {
    test(`should_allow_image_${attr}_attribute`, () => {
      assertSanitized(
        `<img ${attr}="foo" onclick="bar" />`,
        // sanitize-html self-closes void elements; the value is preserved.
        `<img ${attr}="foo" />`,
      );
    });
  }

  test("lang_and_xml_lang", () => {
    assertSanitized(`<div lang="en" xml:lang="en">foo</div>`);
  });

  test("should_handle_non_html", () => {
    assertSanitized("abc");
  });

  test("should_handle_blank_text", () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
    expect(sanitize("")).toBe("");
    expect(sanitize("   ")).toBe("   ");
  });

  test("setting_allowed_tags_affects_sanitization", () => {
    SafeListSanitizer.allowedTags = new Set(["u"]);
    expect(sanitize("<a><u></u></a>")).toBe("<u></u>");
  });

  test("setting_allowed_attributes_affects_sanitization", () => {
    SafeListSanitizer.allowedAttributes = new Set(["foo"]);
    SafeListSanitizer.allowedTags = new Set(["a"]);
    expect(sanitize(`<a foo="hello" bar="world"></a>`)).toBe(`<a foo="hello"></a>`);
  });

  test("custom_tags_overrides_allowed_tags", () => {
    SafeListSanitizer.allowedTags = new Set(["u"]);
    expect(sanitize("<a><u></u></a>", { tags: ["a"] })).toBe("<a></a>");
  });

  test("custom_attributes_overrides_allowed_attributes", () => {
    SafeListSanitizer.allowedAttributes = new Set(["foo"]);
    SafeListSanitizer.allowedTags = new Set(["a"]);
    expect(sanitize(`<a foo="hello" bar="world"></a>`, { attributes: ["bar"] })).toBe(
      `<a bar="world"></a>`,
    );
  });

  test("should_allow_prune", () => {
    const pruning = new SafeListSanitizer({ prune: true });
    expect(pruning.sanitize("<u>leave me <b>now</b></u>", { tags: ["u"] })).toBe(
      "<u>leave me </u>",
    );
  });

  test("should_allow_custom_tags", () => {
    expect(sanitize("<u>foo</u>", { tags: ["u"] })).toBe("<u>foo</u>");
  });

  test("should_allow_only_custom_tags", () => {
    expect(sanitize("<u>foo</u> with <i>bar</i>", { tags: ["u"] })).toBe("<u>foo</u> with bar");
  });

  test("should_allow_custom_tags_with_attributes", () => {
    assertSanitized(`<blockquote cite="http://example.com/">foo</blockquote>`);
  });

  test("should_allow_custom_tags_with_custom_attributes", () => {
    const text = `<blockquote foo="bar">Lorem ipsum</blockquote>`;
    expect(sanitize(text, { attributes: ["foo"] })).toBe(text);
  });

  test("should_raise_argument_error_if_tags_is_not_enumerable", () => {
    expect(() => sanitize("<a>some html</a>", { tags: "foo" })).toThrow(TypeError);
  });

  test("should_raise_argument_error_if_attributes_is_not_enumerable", () => {
    expect(() => sanitize("<a>some html</a>", { attributes: "foo" })).toThrow(TypeError);
  });

  // XSS protection: javascript: / vbscript: / data: schemes must never
  // survive on src/href, regardless of source obfuscation.
  test("should_strip_src_attribute_in_img_with_bad_protocols", () => {
    expect(sanitize(`<img src="javascript:bang" title="1">`)).not.toContain("javascript:");
  });

  test("should_strip_href_attribute_in_a_with_bad_protocols", () => {
    expect(sanitize(`<a href="javascript:bang" title="1">boo</a>`)).not.toContain("javascript:");
  });

  test("should_block_script_tag", () => {
    expect(sanitize(`<SCRIPT\nSRC=http://ha.ckers.org/xss.js></SCRIPT>`)).toBe("");
  });

  test("should_sanitize_img_vbscript", () => {
    expect(sanitize(`<img src='vbscript:msgbox("XSS")' />`)).not.toContain("vbscript:");
  });

  test("should_sanitize_img_dynsrc_lowsrc", () => {
    expect(sanitize(`<img lowsrc="javascript:alert('XSS')" />`)).not.toContain("javascript:");
  });

  // Various javascript: obfuscation hacks — assert no js:-scheme leaks
  // through, regardless of casing, whitespace, or entity-encoding.
  for (const hack of [
    `<IMG SRC="javascript:alert('XSS');">`,
    `<IMG SRC=javascript:alert('XSS')>`,
    `<IMG SRC=JaVaScRiPt:alert('XSS')>`,
    `<IMG SRC="jav\tascript:alert('XSS');">`,
    `<IMG SRC="jav&#x09;ascript:alert('XSS');">`,
    `<IMG SRC=" &#14;  javascript:alert('XSS');">`,
  ]) {
    test(`should_not_fall_for_xss_image_hack: ${hack.slice(0, 40)}`, () => {
      const out = sanitize(hack)!.toLowerCase();
      expect(out).not.toContain("javascript:");
      expect(out).not.toContain("alert(");
    });
  }

  test("should_sanitize_invalid_tag_names", () => {
    expect(sanitize(`a b c<script/XSS src="http://ha.ckers.org/xss.js"></script>d e f`)).toBe(
      "a b cd e f",
    );
  });
});
