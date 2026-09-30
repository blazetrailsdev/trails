import { describe, expect, it } from "vitest";

import { assertDomEqual, assertDomNotEqual } from "./dom-assertions.js";

describe("DomAssertions", () => {
  it("ignores attribute order and entity spelling", () => {
    assertDomEqual(
      '<link href="/a?x=1&amp;y=2" rel="alternate" />',
      "<link rel='alternate' href=\"/a?x=1&#38;y=2\">",
    );
  });

  it("compares element names, attribute values and text", () => {
    assertDomNotEqual('<a href="/a">x</a>', '<a href="/b">x</a>');
    assertDomNotEqual('<a href="/a">x</a>', '<a href="/a" class="c">x</a>');
    assertDomNotEqual("<a>x</a>", "<b>x</b>");
    assertDomNotEqual("<a>x</a>", "<a>y</a>");
    assertDomNotEqual("<p><a>x</a></p>", "<p><a>x</a><a>y</a></p>");
    expect(() => assertDomEqual("<a>x</a>", "<a>y</a>")).toThrow(
      "Expected: <a>x</a>\nActual: <a>y</a>",
    );
  });

  it("ignores blank text and whitespace runs unless strict", () => {
    assertDomEqual("<div>\nfoo\n</div>", "<div>foo</div>");
    assertDomEqual("<ul> <li>a  b</li> </ul>", "<ul><li>a b</li></ul>");
    assertDomNotEqual("<div>\nfoo\n</div>", "<div>foo</div>", null, { strict: true });
  });
});
