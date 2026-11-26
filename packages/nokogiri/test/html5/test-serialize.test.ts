import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";

import { HTML5 } from "../../lib/index.js";

describe("TestHtml5Serialize", () => {
  describe("noscript text serialization", () => {
    const input = "<noscript>&lt;/noscript&gt;&lt;img src=x&gt;</noscript>";
    const escaped = "<noscript>&lt;/noscript&gt;&lt;img src=x&gt;</noscript>";
    const literal = "<noscript><p>&lt;/noscript&gt;</p></noscript>";

    it("is escaped in a fragment parsed with scripting disabled", () => {
      expect(HTML5.fragment(input).toHtml()).toEqual(escaped);
    });

    it("is escaped in a document parsed with scripting disabled", () => {
      expect(HTML5.parse(`<body>${input}`).atCss("noscript")!.toHtml()).toEqual(escaped);
    });

    it("is literal in a fragment parsed with noscript content as text", () => {
      const fragment = HTML5.fragment(literal, null, { parseNoscriptContentAsText: true });

      expect(fragment.toHtml()).toEqual(literal);
    });

    it("is literal in a document parsed with noscript content as text", () => {
      const doc = HTML5.parse(`<body>${literal}`, null, null, { parseNoscriptContentAsText: true });

      expect(doc.atCss("noscript")!.toHtml()).toEqual(literal);
    });

    it("is literal in a fragment created with noscript content as text", () => {
      const fragment = new HTML5.DocumentFragment(new HTML5.Document(), literal, null, {
        parseNoscriptContentAsText: true,
      });

      expect(fragment.toHtml()).toEqual(literal);
    });

    it("is safe in a fragment of a document parsed with noscript content as text", () => {
      const doc = HTML5.parse("<body>", null, null, { parseNoscriptContentAsText: true });

      expect(doc.fragment(input).toHtml()).toEqual(escaped);
    });

    it("requires a fragment to parse noscript content the way its document did", () => {
      const doc = HTML5.parse("<body>", null, null, { parseNoscriptContentAsText: true });

      expect(
        () => new HTML5.DocumentFragment(doc, input, null, { parseNoscriptContentAsText: false }),
      ).toThrow(ArgumentError);
    });

    it("does not record a fragment's noscript parsing mode when the fragment fails to parse", () => {
      const doc = new HTML5.Document();
      expect(
        () =>
          new HTML5.DocumentFragment(doc, input, null, {
            parseNoscriptContentAsText: true,
            maxTreeDepth: 0,
          }),
      ).toThrow(ArgumentError);

      const fragment = new HTML5.DocumentFragment(doc, input, null, {
        parseNoscriptContentAsText: false,
      });

      expect(fragment.toHtml()).toEqual(escaped);
    });
  });
});
