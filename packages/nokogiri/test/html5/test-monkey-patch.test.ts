import { describe, expect, it } from "vitest";

import { Document } from "../../lib/html5/document.js";

describe("TestHtml5SerializationMonkeyPatch", () => {
  it("to xml", () => {
    const xml = Document.parse("<!DOCTYPE html><source>").toXml();
    expect(xml).toMatch(/^<\?xml version/);
    expect(xml).toMatch(/<source\s*\/>/);
  });
});
