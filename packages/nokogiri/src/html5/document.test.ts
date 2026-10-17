import { describe, expect, it } from "vitest";

import { Document } from "./document.js";

describe("Nokogiri::HTML5::Document", () => {
  it("parse treats nil input as an empty document", () => {
    const doc = Document.parse();
    expect(doc.root?.name).toBe("html");
  });

  it("parse reads an IO and takes its path as the url", () => {
    const io = { path: "/tmp/page.html", read: () => "<p>hi</p>" };
    const doc = Document.parse(io);
    expect(doc.url).toBe("/tmp/page.html");
    expect(doc.root?.text).toBe("hi");
  });

  it("parse prefers the url keyword over the positional url", () => {
    expect(Document.parse("", "a").url).toBe("a");
    expect(Document.parse("", "a", null, { url: "b" }).url).toBe("b");
  });

  it("parse yields the options to the block", () => {
    let yielded: Record<string, unknown> | null = null;
    Document.parse("", null, null, { maxErrors: 10 }, (options) => (yielded = options));
    expect(yielded).toEqual({ maxErrors: 10 });
  });

  it("parse raises for input that is neither a string nor an IO", () => {
    expect(() => Document.parse(42 as never)).toThrow("not a string or IO object");
  });
});
