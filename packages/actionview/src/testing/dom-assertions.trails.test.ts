import { describe, expect, it } from "vitest";

import { assertDomEqual, assertDomNotEqual } from "./dom-assertions.js";
import { NotImplementedError } from "@blazetrails/ruby-compat";

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
    assertDomEqual("<p>  a</p>", "<p>a</p>");
    assertDomEqual("<ul> <li>a  b</li> </ul>", "<ul><li>a b</li></ul>");
    assertDomNotEqual("<div>\nfoo\n</div>", "<div>foo</div>", null, { strict: true });
  });

  it("closes unclosed elements at the end of input and honors void and `/>` elements", () => {
    assertDomEqual("<div><p>a", "<div><p>a</p></div>");
    assertDomEqual('<input name="a"><br>', '<input name="a" /><br />');
    assertDomNotEqual("<p><b>x</b></p>", "<p><b></b>x</p>");
    assertDomNotEqual("<div><p>a</div>b", "<div><p>a</p></div>");
  });

  // PERMANENT-SKIP: libxml2 HTML4 closes a non-void `<x/>`; the HTML5 tree builder behind HTML5.DocumentFragment, like Nokogiri::HTML5, opens it.
  it.skip("closes a non-void `/>` element", () => {
    assertDomEqual("<x-icon/><b>a</b>", "<x-icon></x-icon><b>a</b>");
  });

  it("does not pass malformed markup against well-formed markup", () => {
    assertDomNotEqual('<a href="x>y</a>', '<a href="x">y</a>');
    assertDomNotEqual("<a href=x>y</a>", '<a href="x y">y</a>');
    assertDomNotEqual("a < b", "a b");
    assertDomNotEqual("<!-- a -->", "<!-- b -->");
    assertDomNotEqual('<a disabled href="x">y</a>', '<a href="x">y</a>');
    assertDomEqual("<a href=x DISABLED>y</A>", '<a disabled="" href="x">y</a>');
    assertDomEqual("a < b", "a &lt; b");
  });
});

describe("Rails::Dom::Testing.html_document_fragment", () => {
  it("raises ArgumentError for an unknown html_version", () => {
    expect(() => assertDomEqual("<a></a>", "<a></a>", null, { htmlVersion: ":html6" })).toThrow(
      "html_version must be :html4 or :html5, received :html6",
    );
  });

  it("has no HTML4 fragment parser yet", () => {
    expect(() => assertDomEqual("<a></a>", "<a></a>", null, { htmlVersion: ":html4" })).toThrow(
      NotImplementedError,
    );
  });

  it("selects the HTML5 fragment parser", () => {
    assertDomEqual("<a></a>", "<a></a>", null, { htmlVersion: ":html5" });
  });
});
