import { describe, expect, it } from "vitest";
import { TypeError } from "@blazetrails/ruby-compat";
import { LibXML } from "../lib/libxml-ruby.js";

const XML =
  '<feed xmlns="http://www.w3.org/2005/Atom"><title type="html"><![CDATA[<<strong>>]]></title></feed>';

const DocTypeCallback = {
  ...LibXML.XML.SaxParser.Callbacks,
  onStartElement(_element: string, _attributes: Record<string, string>): void {},
};

class TestCaseCallbacks {
  result: string[] = [];
  onCdataBlock(cdata: string): void {
    this.result.push(`cdata: ${cdata}`);
  }
  onCharacters(chars: string): void {
    this.result.push(`characters: ${chars}`);
  }
  onComment(text: string): void {
    this.result.push(`comment: ${text}`);
  }
  onEndDocument(): void {
    this.result.push("end_document");
  }
  onEndElement(name: string): void {
    this.result.push(`end_element: ${name}`);
  }
  onEndElementNs(name: string, prefix: string | null, uri: string | null): void {
    this.result.push(`end_element_ns ${name}, prefix: ${prefix ?? ""}, uri: ${uri ?? ""}`);
  }
  onError(error: Error): void {
    this.result.push(`error: ${error}`);
  }
  onProcessingInstruction(target: string, data: string): void {
    this.result.push(`pi: ${target} ${data}`);
  }
  onStartDocument(): void {
    this.result.push("startdoc");
  }
  onStartElement(name: string, attributes: Record<string, string>): void {
    this.result.push(`start_element: ${name}, attr: ${JSON.stringify(attributes)}`);
  }
  onStartElementNs(
    name: string,
    attributes: Record<string, string>,
    prefix: string | null,
    uri: string | null,
  ): void {
    this.result.push(
      `start_element_ns: ${name}, attr: ${JSON.stringify(attributes)}, prefix: ${prefix ?? ""}, uri: ${uri ?? ""}`,
    );
  }
  onExternalSubset(): void {}
  onHasExternalSubset(): void {}
  onHasInternalSubset(): void {}
  onInternalSubset(): void {}
  onIsStandalone(): void {}
  onReference(): void {}
}

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<?xml-stylesheet type="text/xsl" href="my_stylesheet.xsl"?>
<feed xmlns="http://www.w3.org/2005/Atom"><entry/></feed>
`;

describe("TestSaxParser", () => {
  // PERMANENT-SKIP: libxml2-wasm 0.7.1 exposes no SAX handler (libxml2-wasm/lib/index.d.mts exports no xmlSAXHandler or processing-instruction node), so SaxParser replays a parsed tree: no on_processing_instruction, and no element events before a fatal error (test_sax_parser.rb:140-145, :191-197, :231-300).
  it.skip("string", () => {
    const parser = LibXML.XML.SaxParser.string(ATOM);
    parser.callbacks = new TestCaseCallbacks();
    parser.parse();
    expect((parser.callbacks as TestCaseCallbacks).result[1]).toBe(
      'pi: xml-stylesheet type="text/xsl" href="my_stylesheet.xsl"',
    );
  });

  // PERMANENT-SKIP: libxml2-wasm 0.7.1 exposes no SAX handler (libxml2-wasm/lib/index.d.mts exports no xmlSAXHandler or processing-instruction node), so SaxParser replays a parsed tree: no on_processing_instruction, and no element events before a fatal error (test_sax_parser.rb:140-145, :191-197, :231-300).
  it.skip("parse warning", () => {
    const parser = LibXML.XML.SaxParser.string(
      '<?xml version="1.0" encoding="utf-8"?>\n<?xml-invalid?>\n<Test/>\n',
    );
    parser.callbacks = new TestCaseCallbacks();
    parser.parse();
    expect((parser.callbacks as TestCaseCallbacks).result[2]).toBe("pi: xml-invalid ");
  });

  // PERMANENT-SKIP: libxml2-wasm 0.7.1 exposes no SAX handler (libxml2-wasm/lib/index.d.mts exports no xmlSAXHandler or processing-instruction node), so SaxParser replays a parsed tree: no on_processing_instruction, and no element events before a fatal error (test_sax_parser.rb:140-145, :191-197, :231-300).
  it.skip("parse error", () => {
    const parser = LibXML.XML.SaxParser.string("      <Results>\n");
    parser.callbacks = new TestCaseCallbacks();
    expect(() => parser.parse()).toThrow(LibXML.XML.Error);
    const result = (parser.callbacks as TestCaseCallbacks).result;
    expect(result[0]).toBe("startdoc");
    expect(result[1]).toBe("start_element: Results, attr: {}");
  });

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
