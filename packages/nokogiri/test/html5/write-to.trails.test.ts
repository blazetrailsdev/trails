import { describe, expect, it } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat";

import { Document } from "../../lib/html5/document.js";
import { Node } from "../../lib/html5/node.js";
import { SaveOptions } from "../../lib/xml/node/save-options.js";

describe("Nokogiri::HTML5::Node#write_to", () => {
  it("writes the AS_XML arm with the encoding, the indent and the save flags", () => {
    const doc = Document.parse("<div><p>a</p><br></div>");
    const div = doc.css("div").first() as Node;

    const io = new StringIO();
    div.writeTo(io, { saveWith: SaveOptions.DEFAULT_XML, indent: 1, indentText: "\t" });
    expect(io.string()).toBe("<div>\n\t<p>a</p>\n\t<br/>\n</div>");

    const noEmpty = new StringIO();
    div.writeTo(noEmpty, { saveWith: SaveOptions.AS_XML | SaveOptions.NO_EMPTY_TAGS });
    expect(noEmpty.string()).toBe("<div><p>a</p><br></br></div>");

    const xhtml = new StringIO();
    div.writeTo(xhtml, { saveWith: SaveOptions.AS_XHTML });
    expect(xhtml.string()).toBe("<div><p>a</p><br /></div>");
  });

  it("escapes attribute values on the AS_XML arm", () => {
    const doc = Document.parse(`<p title='a "b" & <c>'>x</p>`);
    const io = new StringIO();
    (doc.css("p").first() as Node).writeTo(io, { saveWith: SaveOptions.AS_XML });
    expect(io.string()).toBe('<p title="a &quot;b&quot; &amp; &lt;c>">x</p>');
  });

  it("writes the XML declaration for a document unless NO_DECLARATION is set", () => {
    const doc = new Node(Document.parse("<p>x</p>")._node as never);
    const io = new StringIO();
    doc.writeTo(io, { saveWith: SaveOptions.AS_XML, encoding: "UTF-8" });
    expect(io.string()).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n/);

    const bare = new StringIO();
    doc.writeTo(bare, { saveWith: SaveOptions.AS_XML | SaveOptions.NO_DECLARATION });
    expect(bare.string()).not.toMatch(/<\?xml/);
  });
});
