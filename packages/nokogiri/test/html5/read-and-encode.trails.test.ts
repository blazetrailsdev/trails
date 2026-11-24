import { describe, expect, it } from "vitest";

import { DocumentFragment } from "../../lib/html5/document-fragment.js";

describe("Nokogiri::HTML5.read_and_encode", () => {
  it("parses a fragment from an object's to_s", () => {
    class Markup {
      toS(): string {
        return "<b>bold</b>";
      }
    }
    const fragment = DocumentFragment.parse(new Markup());
    expect(fragment.toHtml()).toBe("<b>bold</b>");
  });

  it("parses a fragment from an IO's read", () => {
    const io = { read: () => "<i>read</i>" };
    const fragment = DocumentFragment.parse(io);
    expect(fragment.toHtml()).toBe("<i>read</i>");
  });
});
