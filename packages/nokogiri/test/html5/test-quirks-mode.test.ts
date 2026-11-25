import { describe, expect, it } from "vitest";

import { Document } from "../../lib/html5/document.js";
import { DocumentFragment } from "../../lib/html5/document-fragment.js";
import { QuirksMode } from "../../lib/html5/document.js";

describe("DocumentFragment#quirks_mode", () => {
  const input = "<p><table>";
  const noQuirksOutput = "<p></p><table></table>";

  describe("without parsing anything", () => {
    it("returns nil", () => {
      const fragment = new DocumentFragment(new Document());
      expect(fragment.quirksMode).toBeNull();
    });
  });

  describe("in context", () => {
    describe("document did not invoke the parser", () => {
      it("parses the fragment in no-quirks mode", () => {
        const document = new Document();
        const contextNode = document.createElement("div");
        const fragment = contextNode.fragment(input) as DocumentFragment;

        expect(fragment.quirksMode).toBe(QuirksMode.NO_QUIRKS);
        expect(fragment.toHtml()).toBe(noQuirksOutput);
      });
    });
  });
});
