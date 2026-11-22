import { describe, expect, it } from "vitest";
import { TypeError } from "@blazetrails/ruby-compat";
import { LibXML } from "../lib/libxml-ruby.js";

const XML =
  '<feed xmlns="http://www.w3.org/2005/Atom"><title type="html"><![CDATA[<<strong>>]]></title></feed>';

const DocTypeCallback = {
  ...LibXML.XML.SaxParser.Callbacks,
  onStartElement(_element: string, _attributes: Record<string, string>): void {},
};

describe("TestSaxParser", () => {
  it("string no callbacks", () => {
    const parser = LibXML.XML.SaxParser.string(XML);
    expect(parser.parse()).toBe(true);
  });

  it("nil string", () => {
    let error: unknown;
    expect(() => {
      try {
        LibXML.XML.SaxParser.string(null);
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(TypeError);

    expect((error as TypeError).message).toBe("wrong argument type nil (expected String)");
  });

  it("doctype", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Results SYSTEM "results.dtd">
<Results>
<a>a1</a>
</Results>
`;
    const parser = LibXML.XML.SaxParser.string(xml);
    parser.callbacks = DocTypeCallback;
    const doc = parser.parse();
    expect(doc).not.toBeNull();
  });
});
