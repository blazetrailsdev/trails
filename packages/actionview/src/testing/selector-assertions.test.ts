import { describe, expect, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { ArgumentError, Range } from "@blazetrails/ruby-compat";
import type { Html5Document, NodeSet } from "@blazetrails/nokogiri";
import { Testing } from "../testing.js";
import { assertSelect as _assertSelect, cssSelect as _cssSelect } from "./selector-assertions.js";

describe("AssertSelectTest", () => {
  let htmlDocument: Html5Document;
  const host = { documentRootElement: () => htmlDocument.root };
  const assertSelect = _assertSelect.bind(host);
  const cssSelect = _cssSelect.bind(host);
  const renderHtml = (html: string) => (htmlDocument = Testing.htmlDocument().parse(html));
  const assertFailure = (message: RegExp, block: () => void) => expect(block).toThrow(message);

  it("assert select", () => {
    renderHtml('<div id="1"></div><div id="2"></div>');
    assertSelect("div", 2);
    assertFailure(/Expected at least 1 element matching "p", found 0/, () => assertSelect("p"));
  });

  it("equality integer", () => {
    renderHtml('<div id="1"></div><div id="2"></div>');
    assertFailure(/Expected exactly 3 elements matching "div", found 2/, () =>
      assertSelect("div", 3),
    );
    assertFailure(/Expected exactly 0 elements matching "div", found 2/, () =>
      assertSelect("div", 0),
    );
  });

  it("equality true false", () => {
    renderHtml('<div id="1"></div><div id="2"></div>');
    expect(() => assertSelect("div")).not.toThrow();
    expect(() => assertSelect("p")).toThrow();
    expect(() => assertSelect("div", true)).not.toThrow();
    expect(() => assertSelect("p", true)).toThrow();
    expect(() => assertSelect("div", false)).toThrow();
    expect(() => assertSelect("p", false)).not.toThrow();
  });

  it("equality false with substitution", () => {
    renderHtml("<a></a>");
    expect(() => assertSelect('a[href="http://example.org?query=value"]', false)).not.toThrow();
  });

  it("equality string and regexp", () => {
    renderHtml('<div id="1">foo</div><div id="2">foo</div>');
    expect(() => assertSelect("div", "foo")).not.toThrow();
    expect(() => assertSelect("div", "bar")).toThrow();
    expect(() => assertSelect("div", { text: "foo" })).not.toThrow();
    expect(() => assertSelect("div", { text: "bar" })).toThrow();
    expect(() => assertSelect("div", /(foo|bar)/)).not.toThrow();
    expect(() => assertSelect("div", /foobar/)).toThrow();
    expect(() => assertSelect("p", { text: /foobar/ })).toThrow();
  });

  // PERMANENT-SKIP: CLAUDE.md, "DOM testing is HTML5 only": Rails' suite parses as `:html4`, where libxml2 keeps a textarea's leading newline that the HTML5 tree builder drops.
  it.skip("strip textarea", () => {
    renderHtml("<textarea>\n\nfoo\n</textarea>");
    assertSelect("textarea", "\nfoo\n");
    renderHtml("<textarea>\nfoo</textarea>");
    assertSelect("textarea", "foo");
  });

  it("counts", () => {
    renderHtml('<div id="1">foo</div><div id="2">foo</div>');
    expect(() => assertSelect("div", new Range(1, 2))).not.toThrow();
    assertFailure(/Expected between 3 and 4 elements matching "div", found 2/, () =>
      assertSelect("div", new Range(3, 4)),
    );
    assertFailure(/Expected at least 3 elements matching "div", found 2/, () =>
      assertSelect("div", { minimum: 3 }),
    );
    assertFailure(/Expected at most 1 element matching "div", found 2/, () =>
      assertSelect("div", { maximum: 1 }),
    );
  });

  it("substitution values", () => {
    renderHtml('<div id="1">foo</div><div id="2">foo</div>');
    assertSelect("div:match('id', ?)", /\d+/, (elements: NodeSet) => {
      assertEqual(2, elements.size);
    });
    assertSelect("div", () => {
      assertSelect(":match('id', ?)", /\d+/, (elements: NodeSet) => {
        assertEqual(2, elements.size);
        assertSelect("#1");
        assertSelect("#2");
      });
    });
  });

  it("substitution value with quotes", () => {
    renderHtml('<input placeholder="placeholder with &quot;quotes&quot;" />');
    assertSelect("input[placeholder=?]", 'placeholder with "quotes"');
  });

  it("multiple substitution values", () => {
    renderHtml('<input name="foo[12]" value="34">');
    assertSelect(":match('name', ?):match('value', ?)", /\w+\[\d+\]/, /\d+/);
  });

  it("nested assert select", () => {
    renderHtml('<div id="1">foo</div><div id="2">foo</div>');
    assertSelect("div", (elements: NodeSet) => {
      assertEqual(2, elements.size);
      assertSelect(elements, "#1");
      assertSelect(elements, "#2");
    });
    assertSelect("div", () => {
      assertSelect("div", () => {
        assertSelect("#1,#2");
        assertSelect("#3", false);
      });
    });
  });

  it("css select", () => {
    renderHtml('<div id="1"></div><div id="2"></div>');
    assertEqual(2, cssSelect("div").size);
    assertEqual(0, cssSelect("p").size);
  });

  it("body not present in empty document", () => {
    renderHtml("<div></div>");
    assertSelect("body", 0);
  });

  it("body class can be tested with html", () => {
    renderHtml('<html><body class="foo"><div></div></body></html>');
    assertSelect(".foo");
  });

  it("assert select with extra argument", () => {
    renderHtml("<html><head><title>Welcome</title></head><body><div></div></body></html>");
    expect(() => assertSelect("title", "Welcome", { count: 1 })).toThrow(ArgumentError);
    assertSelect("title", { text: "Welcome", count: 1 });
  });
});
