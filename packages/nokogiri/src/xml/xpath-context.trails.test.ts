import { describe, expect, it } from "vitest";

import { Document } from "../html5/document.js";
import { XmlDocument } from "./document.js";
import type { NodeSet } from "./node-set.js";
import type { Attr } from "./attr.js";
import type { Namespace } from "./namespace.js";
import { XPathContext } from "./xpath-context.js";
import { SyntaxError } from "./xpath/syntax-error.js";

const html = `<html><body>
  <ul><li class="a b">one</li><li class="b">two</li><li id="x">three</li></ul>
  <p data-n="4">para</p>
</body></html>`;

function names(set: NodeSet): string[] {
  return set.map((n) => n.text);
}

describe("XPathContext", () => {
  it("evaluates location paths over an HTML5 tree in document order", () => {
    const doc = Document.parse(html, null, null, {});
    const context = new XPathContext(doc);
    expect(names(context.evaluate("//li[position()>1]") as NodeSet)).toEqual(["two", "three"]);
    expect(names(context.evaluate("//li[last()]") as NodeSet)).toEqual(["three"]);
    expect(names(context.evaluate("//li[@id='x']/preceding-sibling::*[1]") as NodeSet)).toEqual([
      "two",
    ]);
  });

  it("answers numbers, strings and booleans", () => {
    const doc = Document.parse(html, null, null, {});
    const context = new XPathContext(doc);
    expect(context.evaluate("count(//li)")).toBe(3);
    expect(context.evaluate("string(//p/@data-n) + 1")).toBe(5);
    expect(context.evaluate("concat('a', normalize-space('  b  c '))")).toBe("ab c");
    expect(context.evaluate("//li = 'two'")).toBe(true);
    expect(context.evaluate("substring('12345', 2, 3)")).toBe("234");
  });

  it("registers the nokogiri-builtin functions", () => {
    const doc = Document.parse(html, null, null, {});
    const context = new XPathContext(doc);
    expect(
      names(context.evaluate("//*[nokogiri-builtin:css-class(@class,'b')]") as NodeSet),
    ).toEqual(["one", "two"]);
    expect(names(context.evaluate("//*[nokogiri-builtin:local-name-is('p')]") as NodeSet)).toEqual([
      "para",
    ]);
  });

  it("dispatches nokogiri: functions to the handler and marshals node sets", () => {
    const doc = Document.parse(html, null, null, {});
    const context = new XPathContext(doc);
    const handler = {
      second(set: NodeSet) {
        return [...set].slice(1, 2);
      },
    };
    expect(names(context.evaluate("nokogiri:second(//li)", handler) as NodeSet)).toEqual(["two"]);
  });

  it("raises XPath::SyntaxError for an unregistered function", () => {
    const doc = Document.parse(html, null, null, {});
    expect(() => new XPathContext(doc).evaluate("//li[nokogiri:nope(.)]")).toThrow(SyntaxError);
  });

  it("evaluates over a libxml2 document", () => {
    const doc = XmlDocument.parse(`<r><a k="1"/><a k="2"><b/></a></r>`);
    const context = new XPathContext(doc);
    expect((context.evaluate("/r/a[b]") as NodeSet).size).toBe(1);
    expect(context.evaluate("sum(//a/@k)")).toBe(3);
    doc.dispose();
  });

  it("answers attribute nodes as Attr", () => {
    const doc = Document.parse(html, null, null, {});
    const attrs = new XPathContext(doc).evaluate("//li/@class") as NodeSet;
    expect(attrs.map((a) => (a as unknown as Attr).value)).toEqual(["a b", "b"]);
    expect(attrs.map((a) => (a as unknown as Attr).name)).toEqual(["class", "class"]);
  });

  it("matches a multi-word css-class needle at a word start", () => {
    const doc = Document.parse(html, null, null, {});
    const context = new XPathContext(doc);
    expect(
      names(context.evaluate("//*[nokogiri-builtin:css-class(@class,'a b')]") as NodeSet),
    ).toEqual(["one"]);
    expect(
      names(context.evaluate("//*[nokogiri-builtin:css-class(@class,'b c')]") as NodeSet),
    ).toEqual([]);
  });

  it("raises when a handler answers nil, as libxml2's stack check does", () => {
    const doc = Document.parse(html, null, null, {});
    expect(() =>
      new XPathContext(doc).evaluate("nokogiri:nothing()", { nothing: () => null }),
    ).toThrow(SyntaxError);
  });

  it("raises TypeError for a non-String variable", () => {
    const doc = Document.parse(html, null, null, {});
    expect(() => new XPathContext(doc).registerVariable("n", 1)).toThrow(
      "no implicit conversion of Integer into String",
    );
  });
  it("answers the namespace axis as XML::Namespace over the libxml2 tree", () => {
    const doc = XmlDocument.parse('<root xmlns="urn:d" xmlns:a="urn:a"><a:c b="1"/></root>');
    const c = doc.root.children[0];
    const context = new XPathContext(c as never);
    const set = context.evaluate("namespace::*") as NodeSet;
    const pairs = set.map((n) => {
      const ns = n as unknown as Namespace;
      return [ns.prefix, ns.href];
    });
    expect(pairs).toContainEqual(["xml", "http://www.w3.org/XML/1998/namespace"]);
    expect(pairs).toContainEqual([null, "urn:d"]);
    expect(pairs).toContainEqual(["a", "urn:a"]);
    expect(pairs).toHaveLength(3);
    expect(context.evaluate("string(namespace::a)")).toBe("urn:a");
    expect(context.evaluate("count(namespace::* | @*)")).toBe(4);
    expect(set.plus(context.evaluate("namespace::*") as NodeSet).length).toBe(3);
    (
      c._node as unknown as { addNsDeclaration(uri: string, prefix: string): void }
    ).addNsDeclaration("urn:e", "e");
    expect(context.evaluate("string(namespace::e)")).toBe("urn:e");
    doc.dispose();
  });

  it("answers the namespace axis over the HTML5 tree", () => {
    const doc = Document.parse(html, null, null, {});
    const context = new XPathContext(doc);
    const set = context.evaluate("//p/namespace::*") as NodeSet;
    expect(set.map((n) => (n as unknown as Namespace).prefix)).toEqual(["xml"]);
    expect(context.evaluate("name(//p/namespace::xml)")).toBe("xml");
  });
});
