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
