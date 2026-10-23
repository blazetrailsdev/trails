import { describe, expect, it } from "vitest";
import type { Html5Document } from "@blazetrails/nokogiri";
import { Testing } from "../testing.js";
import {
  assertSelect as _assertSelect,
  assertSelectEncoded as _assertSelectEncoded,
} from "./selector-assertions.js";

describe("AssertSelectTest", () => {
  let htmlDocument: Html5Document;
  const host = { documentRootElement: () => htmlDocument.root };
  const assertSelect = _assertSelect.bind(host);
  const assertSelectEncoded = _assertSelectEncoded.bind(host);
  const renderHtml = (html: string) => (htmlDocument = Testing.htmlDocument().parse(html));

  it("assert select encoded parses the escaped text of the selection", () => {
    renderHtml(
      "<div><span>&lt;p&gt;Test 1&lt;/p&gt;</span><span>&lt;p&gt;Test 2&lt;/p&gt;</span></div>",
    );

    assertSelect("span", () => {
      assertSelectEncoded(null, {}, () => {
        assertSelect("p", { count: 2, text: /Test/ });
      });
    });
    assertSelect("div", () => {
      assertSelectEncoded(null, {}, () => {
        assertSelect("p", 0);
      });
    });
    expect(() => assertSelectEncoded()).toThrow(
      "Element is required when called from a nonnested assert_dom",
    );
  });
});
