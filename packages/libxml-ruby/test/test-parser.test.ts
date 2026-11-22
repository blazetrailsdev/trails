import { describe, expect, it } from "vitest";
import { StringIO, TypeError } from "@blazetrails/ruby-compat";
import { LibXML } from "../lib/libxml-ruby.js";

const RUBYNET =
  '<ruby_array uga="booga" foo="bar"><fixnum>one</fixnum><fixnum>two</fixnum></ruby_array>';

describe("TestParser", () => {
  it("nil io", () => {
    let error: unknown;
    expect(() => {
      try {
        LibXML.XML.Parser.io(null as never);
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(TypeError);

    expect((error as TypeError).message).toBe("Must pass in an IO object");
  });

  it("string io", () => {
    const stringIo = new StringIO(RUBYNET);
    const parser = LibXML.XML.Parser.io(stringIo);

    const doc = parser.parse();
    expect(doc).toBeInstanceOf(LibXML.XML.Document);
    expect(parser.context).toBeInstanceOf(LibXML.XML.Parser.Context);
  });

  it("string", () => {
    const str = RUBYNET;

    const parser = LibXML.XML.Parser.string(str);
    expect(parser).toBeInstanceOf(LibXML.XML.Parser);

    const doc = parser.parse();
    expect(doc).toBeInstanceOf(LibXML.XML.Document);
    expect(parser.context).toBeInstanceOf(LibXML.XML.Parser.Context);
  });

  it("nil string", () => {
    let error: unknown;
    expect(() => {
      try {
        LibXML.XML.Parser.string(null);
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(TypeError);

    expect((error as TypeError).message).toBe("wrong argument type nil (expected String)");
  });
});
