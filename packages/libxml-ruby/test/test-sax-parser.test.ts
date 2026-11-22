import { describe, expect, it } from "vitest";
import { TypeError } from "@blazetrails/ruby-compat";
import { LibXML } from "../lib/libxml-ruby.js";

const XML =
  '<feed xmlns="http://www.w3.org/2005/Atom"><title type="html"><![CDATA[<<strong>>]]></title></feed>';

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
});
