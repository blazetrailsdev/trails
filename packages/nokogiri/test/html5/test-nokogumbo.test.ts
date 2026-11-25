import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";

import { DocumentFragment } from "../../lib/html5/document-fragment.js";
import { HTML5 } from "../../lib/index.js";

function buffer(): string {
  return `<html>
  <head>
    <meta charset="utf-8"/>
    <title>hello world</title>
    <script> if (a < b) alert(1) </script>
  </head>
  <body>
    <h1>hello world</h1>
    <main>
      <span>content</span>
    </main>
    <!-- test comment -->
    <form>
      <textarea>foo<x>bar</textarea>
    </form>
  </body>
</html>
`;
}

function attributes(element: { attributeNodes: { nodeName: string; value: string }[] }) {
  return Object.fromEntries(element.attributeNodes.map((a) => [a.nodeName, a.value]));
}

describe("TestHtml5Nokogumbo", () => {
  it("fragment max attributes", () => {
    const html = '<div id="i" class="c" title="t"><img src="s" alt="a"></div>';

    expect(() => HTML5.fragment(html, null, { maxAttributes: 2 })).toThrow(ArgumentError);
    expect(() => HTML5.fragment(html, null, { maxAttributes: 1 })).toThrow(ArgumentError);
    expect(() => HTML5.fragment(html, null, { maxAttributes: 0 })).toThrow(ArgumentError);

    const doc = HTML5.fragment(html, null, { maxAttributes: -1 });
    expect(attributes(doc.atCss("div")!)).toEqual({ id: "i", class: "c", title: "t" });
    expect(attributes(doc.atCss("img")!)).toEqual({ src: "s", alt: "a" });
  });

  it("max depth fragment", () => {
    const depth = 10;
    const html = "<div>".repeat(depth);
    expect(() => HTML5.fragment(html, null, { maxTreeDepth: depth - 1 })).toThrow(ArgumentError);

    expect(HTML5.fragment(html, null, { maxTreeDepth: depth })).toBeTruthy();
    expect(HTML5.fragment(html, null, { maxTreeDepth: -1 })).toBeTruthy();
  });

  it("fragment no errors", () => {
    const doc = HTML5.fragment("no missing DOCTYPE errors", null, { maxErrors: 10 });
    expect(doc.errors.length).toBe(0);
  });

  it("fragment max parse errors", () => {
    const doc = HTML5.fragment("testing deprecated :max_parse_errors", null, {
      maxParseErrors: 10,
    });
    expect(doc.errors.length).toBe(0);
  });

  it("fragment body", () => {
    const doc = HTML5.fragment(/<body>([\s\S]*?)<\/body>/.exec(buffer())![1]);
    expect(doc.xpath("main/span").toXml()).toBe("<span>content</span>");
    expect(doc.xpath("comment()").text).toBe(" test comment ");
  });

  it("template", () => {
    const source = `<template id="productrow">
  <tr>
    <td class="record"></td>
    <td></td>
  </tr>
</template>
`;
    const doc = DocumentFragment.parse(source);
    const template = doc.at("template")!;
    expect(template.get("id")).toBe("productrow");
    expect(template.at("td")!.get("class")).toBe("record");
  });
});
