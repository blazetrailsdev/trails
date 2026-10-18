/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { assertEqual, assertNot } from "@blazetrails/activesupport";
import { ArgumentError, Range } from "@blazetrails/ruby-compat";
import { CSS, XML, type Html5Document, type NodeSet } from "@blazetrails/nokogiri";
import { Testing } from "../testing.js";
import {
  assertSelect as _assertSelect,
  assertSelectEncoded as _assertSelectEncoded,
  cssSelect as _cssSelect,
} from "./selector-assertions.js";

describe("AssertSelectTest", () => {
  let htmlDocument: Html5Document;
  const host = { documentRootElement: () => htmlDocument.root };
  const assertSelect = _assertSelect.bind(host);
  const cssSelect = _cssSelect.bind(host);
  const assertSelectEncoded = _assertSelectEncoded.bind(host);
  const renderXml = (xml: string) => (htmlDocument = XML.Document.parse(xml) as never);
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

  it("equality false message", () => {
    renderHtml('<div id="1"></div><div id="2"></div>');
    assertFailure(/Expected exactly 0 elements matching "div", found 2/, () =>
      assertSelect("div", false),
    );
  });

  it("equality string and regexp", () => {
    renderHtml('<div id="1">foo</div><div id="2">foo</div>');
    expect(() => assertSelect("div", "foo")).not.toThrow();
    expect(() => assertSelect("div", "bar")).toThrow();
    expect(() => assertSelect("div", { text: "foo" })).not.toThrow();
    expect(() => assertSelect("div", { text: "bar" })).toThrow();
    expect(() => assertSelect("div", /(foo|bar)/)).not.toThrow();
    expect(() => assertSelect("div", /foobar/)).toThrow();
    expect(() => assertSelect("div", { text: /(foo|bar)/ })).not.toThrow();
    expect(() => assertSelect("div", { text: /foobar/ })).toThrow();
    expect(() => assertSelect("p", { text: /foobar/ })).toThrow();
  });

  // PERMANENT-SKIP: CLAUDE.md, "DOM testing is HTML5 only": Rails' suite parses as `:html4`, where libxml2 keeps a pre's leading newline that the HTML5 tree builder drops.
  it.skip("equality of html", () => {
    renderHtml('<p>\n<em>"This is <strong>not</strong> a big problem,"</em> he said.\n</p>');
    let text = '"This is not a big problem," he said.';
    let html = '<em>"This is <strong>not</strong> a big problem,"</em> he said.';
    expect(() => assertSelect("p", text)).not.toThrow();
    expect(() => assertSelect("p", html)).toThrow();
    expect(() => assertSelect("p", { html })).not.toThrow();
    expect(() => assertSelect("p", { html: text })).toThrow();
    renderHtml('<pre>\n<em>"This is <strong>not</strong> a big problem,"</em> he said.\n</pre>');
    text = '\n"This is not a big problem," he said.\n';
    html = '\n<em>"This is <strong>not</strong> a big problem,"</em> he said.\n';
    expect(() => assertSelect("pre", text)).not.toThrow();
    expect(() => assertSelect("pre", html)).toThrow();
    expect(() => assertSelect("pre", { html })).not.toThrow();
    expect(() => assertSelect("pre", { html: text })).toThrow();
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
    expect(() => assertSelect("div", 2)).not.toThrow();
    assertFailure(/Expected exactly 3 elements matching "div", found 2/, () =>
      assertSelect("div", 3),
    );
    expect(() => assertSelect("div", new Range(1, 2))).not.toThrow();
    assertFailure(/Expected between 3 and 4 elements matching "div", found 2/, () =>
      assertSelect("div", new Range(3, 4)),
    );
    expect(() => assertSelect("div", { count: 2 })).not.toThrow();
    assertFailure(/Expected exactly 3 elements matching "div", found 2/, () =>
      assertSelect("div", { count: 3 }),
    );
    expect(() => assertSelect("div", { minimum: 1 })).not.toThrow();
    expect(() => assertSelect("div", { minimum: 2 })).not.toThrow();
    assertFailure(/Expected at least 3 elements matching "div", found 2/, () =>
      assertSelect("div", { minimum: 3 }),
    );
    expect(() => assertSelect("div", { maximum: 2 })).not.toThrow();
    expect(() => assertSelect("div", { maximum: 3 })).not.toThrow();
    assertFailure(/Expected at most 1 element matching "div", found 2/, () =>
      assertSelect("div", { maximum: 1 }),
    );
    expect(() => assertSelect("div", { minimum: 1, maximum: 2 })).not.toThrow();
    assertFailure(/Expected between 3 and 4 elements matching "div", found 2/, () =>
      assertSelect("div", { minimum: 3, maximum: 4 }),
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

  it("substitution values with values other than string or regexp", () => {
    renderHtml('<div id="id_string">symbol</div><div id="1">numeric</div>');
    assertSelect("div:match('id', ?)", "id_string", (elements: NodeSet) => {
      assertEqual(1, elements.size);
    });
    assertSelect("div:match('id', ?)", 1, (elements: NodeSet) => {
      assertEqual(1, elements.size);
    });
  });

  it("assert select root html", () => {
    renderHtml("<a></a>");

    assertSelect("a");
  });

  it("nested assert select", () => {
    renderHtml('<div id="1">foo</div><div id="2">foo</div>');
    assertSelect("div", (elements: NodeSet) => {
      assertEqual(2, elements.size);
      assertSelect(elements, "#1");
      assertSelect(elements, "#2");
    });
    assertSelect("div", () => {
      assertSelect("div", (elements: NodeSet) => {
        assertEqual(2, elements.size);
        assertSelect("#1,#2");
        assertSelect("#1");
        assertSelect("#2");
        assertSelect("#3", false);
      });
    });

    assertFailure(/Expected at least 1 element matching "#4", found 0\./, () => {
      assertSelect("div", () => {
        assertSelect("#4");
      });
    });
  });

  it("assert select text match", () => {
    renderHtml('<div id="1"><span>foo</span></div><div id="2"><span>bar</span></div>');
    assertSelect("div", () => {
      expect(() => assertSelect("div", "foo")).not.toThrow();
      expect(() => assertSelect("div", "bar")).not.toThrow();
      expect(() => assertSelect("div", /\w*/)).not.toThrow();
      expect(() => assertSelect("div", { text: /\w*/, count: 2 })).not.toThrow();
      expect(() => assertSelect("div", { text: "foo", count: 2 })).toThrow();
      expect(() => assertSelect("div", { html: "<span>bar</span>" })).not.toThrow();
      expect(() => assertSelect("div", { html: "<span>bar</span>" })).not.toThrow();
      expect(() => assertSelect("div", { html: /\w*/ })).not.toThrow();
      expect(() => assertSelect("div", { html: /\w*/, count: 2 })).not.toThrow();
      expect(() => assertSelect("div", { html: "<span>foo</span>", count: 2 })).toThrow();
    });
  });

  it("css select", () => {
    renderHtml('<div id="1"></div><div id="2"></div>');
    assertEqual(2, cssSelect("div").size);
    assertEqual(0, cssSelect("p").size);
  });

  it("nested css select", () => {
    renderHtml('<div id="1">foo</div><div id="2">foo</div>');
    assertSelect("div:match('id', ?)", /\d+/, (elements: NodeSet) => {
      const [first, second] = elements;
      assertEqual(1, cssSelect(first, "div").size);
      assertEqual(1, cssSelect(second, "div").size);
    });
    assertSelect("div", () => {
      assertEqual(2, cssSelect("div").size);
      for (const _element of cssSelect("div")) {
        assertNot(cssSelect("#1,#2").isEmpty());
        assertNot(cssSelect("#1").isEmpty());
        assertNot(cssSelect("#2").isEmpty());
      }
    });
  });

  it("assert select with invalid selector", () => {
    renderHtml('<a href="http://example.com">hello</a>');
    expect(() => assertSelect("[href=http://example.com]")).toThrow(CSS.SyntaxError);
  });

  it("css select with invalid selector", () => {
    renderHtml('<a href="http://example.com">hello</a>');
    expect(() => cssSelect("[href=http://example.com]")).toThrow(CSS.SyntaxError);
  });

  // BLOCKED: nokogiri-xml-document-searchable
  it.skip("feed item encoded", () => {
    renderXml(`<rss version="2.0">
  <channel>
    <item>
      <description>
        <![CDATA[
          <p>Test 1</p>
        ]]>
      </description>
    </item>
    <item>
      <description>
        &lt;p&gt;Test 2&lt;/p&gt;
      </description>
    </item>
  </channel>
</rss>
`);

    assertSelect("channel item description", () => {
      assertSelectEncoded(null, {}, () => {
        assertSelect("p", { count: 2, text: /Test/ });
      });

      assertSelect("description", (elements: NodeSet) => {
        assertSelectEncoded([...elements][0], {}, () => {
          assertSelect("p", "Test 1");
        });
        assertSelectEncoded([...elements][1], {}, () => {
          assertSelect("p", "Test 2");
        });
      });
    });

    assertSelect("channel item", () => {
      assertSelectEncoded(null, {}, () => {
        assertSelect("p", 0);
      });
    });
  });

  // BLOCKED: nokogiri-xml-document-searchable
  it.skip("feed item encoded with html version", () => {
    const input = "&lt;p&gt;1&lt;b&gt;2&lt;i&gt;3&lt;/b&gt;4&lt;/i&gt;5&lt;/p&gt;";
    const html5Result = "<p>1<b>2<i>3</i></b><i>4</i>5</p>";

    renderXml(`<root>
  <contents>${input}</contents>
</root>
`);

    assertSelect("root contents", () => {
      assertSelectEncoded(null, {}, (contents: any) => {
        assertEqual(html5Result, contents.toString());
      });

      assertSelectEncoded(null, { htmlVersion: ":html5" }, (contents: any) => {
        assertEqual(html5Result, contents.toString());
      });
    });
  });

  it("nested assert select with match failure shows nice regex", () => {
    renderHtml('<div id="1">foo</div>');

    expect(() => assertSelect("div:match('id', ?)", /wups/)).toThrow("div:match('id', /wups/)");
  });

  it("body not present in empty document", () => {
    renderHtml("<div></div>");
    assertSelect("body", 0);
  });

  it("body class can be tested", () => {
    renderHtml('<body class="foo"></body>');
    assertSelect(".foo");
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

  it("assert select on blank response", () => {
    renderHtml("");
    assertSelect("div", 0);
    assertFailure(/Expected exactly 1 element matching "div", found 0./, () =>
      assertSelect("div", 1),
    );
  });
});
