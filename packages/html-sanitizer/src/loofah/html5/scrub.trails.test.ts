import { describe, expect, it } from "vitest";
import { HTML5 } from "@blazetrails/nokogiri";

import { Scrub } from "./scrub.js";

describe("Loofah::HTML5::Scrub", () => {
  it("scrub_attributes drops unsafe attributes, URIs and CSS", () => {
    const fragment = HTML5.DocumentFragment.parse(
      '<a href="javascript:alert(1)" onclick="x" title="t" data-x="" style="color: red; position: fixed">y</a>',
    );
    Scrub.scrubAttributes(fragment.children[0]);
    expect(fragment.toString()).toBe('<a title="t" data-x="" style="color:red;">y</a>');
  });

  it("scrub_uri_attribute keeps an allowed data mediatype", () => {
    const fragment = HTML5.DocumentFragment.parse('<img src="data:image/png;base64,AA">');
    Scrub.scrubAttributes(fragment.children[0]);
    expect(fragment.toString()).toBe('<img src="data:image/png;base64,AA">');
  });
});

describe("Loofah::HTML5::Scrub.cdata_escape", () => {
  it("builds a CDATA node holding the escaped text", () => {
    const fragment = HTML5.DocumentFragment.parse("<b>x</b>");
    const cdata = fragment.document.createCdata("<i>&</i>");
    const escaped = Scrub.cdataEscape(cdata);
    fragment.children[0].before(escaped);
    expect(escaped.text).toBe("&lt;i&gt;&amp;&lt;/i&gt;");
    expect(fragment.children[0].toString()).toBe("<![CDATA[&lt;i&gt;&amp;&lt;/i&gt;]]>");
  });
});

describe("Nokogiri::XML::Node#before", () => {
  it("keeps a CDATA child when its parent serializes", () => {
    const fragment = HTML5.DocumentFragment.parse("<div><b>x</b></div>");
    const div = fragment.children[0];
    div.children[0].before(fragment.document.createCdata("a<b"));
    expect(div.toString()).toBe("<div><![CDATA[a<b]]><b>x</b></div>");
  });

  it("accepts markup, a DocumentFragment and a NodeSet", () => {
    const fragment = HTML5.DocumentFragment.parse("<div><b>x</b></div>");
    const b = fragment.children[0].children[0];
    b.before("<i>1</i>");
    b.before(HTML5.DocumentFragment.parse("<u>2</u>"));
    b.before(HTML5.DocumentFragment.parse("<s>3</s>").css("s"));
    expect(fragment.toString()).toBe("<div><i>1</i><u>2</u><s>3</s><b>x</b></div>");
  });

  it("refuses a second root on a document", () => {
    const doc = HTML5.Document.parse("<p>x</p>");
    expect(() => doc.root!.before("<p>y</p>")).toThrow(
      "A document may not have multiple root nodes.",
    );
  });
});

describe("Nokogiri::XML::Node#coerce", () => {
  it("parses markup in the parent's context", () => {
    const fragment = HTML5.DocumentFragment.parse("<svg><rect></rect></svg>");
    fragment.children[0].children[0].before("<circle></circle>");
    const circle = fragment.children[0].children[0]._node as { namespaceURI?: string };
    expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });
});
