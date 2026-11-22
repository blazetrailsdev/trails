import { describe, expect, it } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat";
import { LibXML, type SaxCallbacks } from "../lib/libxml-ruby.js";

describe("LibXML::XML (trails)", () => {
  it("walks children and attributes of a parsed node", () => {
    const doc = LibXML.XML.Parser.io(new StringIO('<a x="1">hi<b/><![CDATA[c]]></a>')).parse();
    const root = doc.root!;
    expect(root.name).toBe("a");
    expect(root.isElement()).toBe(true);
    const kinds: string[] = [];
    root.eachChild((c) => {
      kinds.push(
        c.isElement()
          ? `element:${c.name}`
          : c.isCdata()
            ? `cdata:${c.content}`
            : c.isText()
              ? `text:${c.content}`
              : "?",
      );
    });
    expect(kinds).toEqual(["text:hi", "element:b", "cdata:c"]);
    const attrs: [string, string][] = [];
    root.eachAttr((a) => attrs.push([a.name, a.value]));
    expect(attrs).toEqual([["x", "1"]]);
  });

  it("raises LibXML::XML::Error on malformed input", () => {
    expect(() => LibXML.XML.Parser.string("<a>").parse()).toThrow(LibXML.XML.Error);
  });

  it("dispatches SAX events, including the old-style element callbacks", () => {
    const result: string[] = [];
    const handler: SaxCallbacks = {
      ...LibXML.XML.SaxParser.Callbacks,
      onStartDocument: () => result.push("startdoc"),
      onEndDocument: () => result.push("end_document"),
      onStartElement: (name, attributes) =>
        result.push(`start_element: ${name} ${JSON.stringify(attributes)}`),
      onEndElement: (name) => result.push(`end_element: ${name}`),
      onCharacters: (chars) => result.push(`characters: ${chars}`),
      onCdataBlock: (cdata) => result.push(`cdata: ${cdata}`),
    };
    const parser = LibXML.XML.SaxParser.io(
      new StringIO('<x:a xmlns:x="u" k="v">t<![CDATA[d]]></x:a>'),
    );
    parser.callbacks = handler;
    expect(parser.parse()).toBe(true);
    expect(result).toEqual([
      "startdoc",
      'start_element: x:a {"k":"v"}',
      "characters: t",
      "cdata: d",
      "end_element: x:a",
      "end_document",
    ]);
  });

  it("sets and resets the error handler", () => {
    LibXML.XML.Error.setHandler(LibXML.XML.Error.QUIET_HANDLER);
    expect(LibXML.XML.Error.getHandler()).toBe(LibXML.XML.Error.QUIET_HANDLER);
    LibXML.XML.Error.resetHandler();
    expect(LibXML.XML.Error.getHandler()).toBeNull();
    LibXML.XML.Error.setHandler(LibXML.XML.Error.VERBOSE_HANDLER);
  });
});
