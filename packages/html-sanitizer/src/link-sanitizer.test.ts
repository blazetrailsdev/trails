// Mirrors rails-html-sanitizer test/sanitizer_test.rb -> LinkSanitizerTest.
// Test names track Rails' test_* methods for test:compare alignment.

import { describe, expect, test } from "vitest";
import { LinkSanitizer } from "./link-sanitizer.js";

const linkSanitize = (input: string | null | undefined) => new LinkSanitizer().sanitize(input);

describe("LinkSanitizer", () => {
  test("strip_links_with_plaintext", () => {
    expect(linkSanitize("Don't touch me")).toBe("Don't touch me");
  });

  test("strip_links_with_line_feed_and_uppercase_tag", () => {
    expect(linkSanitize("<a href='almost'>on my mind</a>\n<A href='almost'>all day long</A>")).toBe(
      "on my mind\nall day long",
    );
  });

  test("strip_links_leaves_nonlink_tags", () => {
    expect(
      linkSanitize("<a href='almost'>My mind</a>\n<A href='almost'>all <b>day</b> long</A>"),
    ).toBe("My mind\nall <b>day</b> long");
  });

  test("strip_links_with_links", () => {
    expect(
      linkSanitize(
        "<a href='http://www.rubyonrails.com/'><a href='http://www.rubyonrails.com/' onlclick='steal()'>0wn3d</a></a>",
      ),
    ).toBe("0wn3d");
  });

  test("strip_links_with_linkception", () => {
    expect(
      linkSanitize(
        "<a href='http://www.rubyonrails.com/'>Mag<a href='http://www.ruby-lang.org/'>ic",
      ),
    ).toBe("Magic");
  });

  test("strip_blank_string", () => {
    expect(linkSanitize(null)).toBeNull();
    expect(linkSanitize(undefined)).toBeUndefined();
    expect(linkSanitize("")).toBe("");
  });

  test("preserves_common_multimedia_tags", () => {
    expect(linkSanitize('<p>see <img src="x" alt="y"></p>')).toBe(
      '<p>see <img src="x" alt="y" /></p>',
    );
    expect(linkSanitize('<video src="v.mp4"></video>')).toBe('<video src="v.mp4"></video>');
    expect(linkSanitize("<details><summary>more</summary>info</details>")).toBe(
      "<details><summary>more</summary>info</details>",
    );
  });

  test("strip_href_from_non_anchor_elements", () => {
    // LinkSanitizer's TargetScrubber also strips bare 'href' attributes
    // from non-<a> elements (Loofah parity).
    expect(linkSanitize("<div href='oops'>hi</div>")).toBe("<div>hi</div>");
  });
});
