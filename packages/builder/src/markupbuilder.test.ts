import { ArgumentError, Exception } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { IllegalBlockError } from "./xmlbase.js";
import { XmlEvents } from "./xmlevents.js";
import { XmlMarkup } from "./xmlmarkup.js";

describe("TestMarkup", () => {
  let xml: XmlMarkup;
  beforeEach(() => {
    xml = new XmlMarkup();
  });
  const _name = () => "bob";

  it("create", () => {
    expect(xml).not.toBeNull();
  });

  it("simple", () => {
    xml.simple();
    expect(xml.targetBang()).toBe("<simple/>");
  });

  it("value", () => {
    xml.value("hi");
    expect(xml.targetBang()).toBe("<value>hi</value>");
  });

  it("empty value", () => {
    xml.value("");
    expect(xml.targetBang()).toBe("<value></value>");
  });

  it("nil value", () => {
    xml.value(null);
    expect(xml.targetBang()).toBe("<value/>");
  });

  it("no value", () => {
    xml.value();
    expect(xml.targetBang()).toBe("<value/>");
  });

  it("nested", () => {
    xml.outer((x: XmlMarkup) => x.inner("x"));
    expect(xml.targetBang()).toBe("<outer><inner>x</inner></outer>");
  });

  it("attributes", () => {
    xml.ref({ id: 12 });
    expect(xml.targetBang()).toBe(`<ref id="12"/>`);
  });

  it("single quotes for attrs", () => {
    xml = new XmlMarkup({ quote: ":single" });
    xml.ref({ id: 12 });
    expect(xml.targetBang()).toBe(`<ref id='12'/>`);
  });

  it("mixed quotes for attrs", () => {
    xml = new XmlMarkup({ quote: ":single" });
    const x = new XmlMarkup({ target: xml, quote: ":double" });
    xml.ref({ id: 12 }, () => x.link({ id: 13 }));
    expect(xml.targetBang()).toBe(`<ref id='12'><link id="13"/></ref>`);
  });

  it("string attributes are escaped by default", () => {
    xml.ref({ id: "H&R" });
    expect(xml.targetBang()).toBe(`<ref id="H&amp;R"/>`);
  });

  it("symbol attributes are unescaped by default", () => {
    xml.ref({ id: ":H&amp;R" });
    expect(xml.targetBang()).toBe(`<ref id="H&amp;R"/>`);
  });

  it("attributes escaping can be turned on", () => {
    xml = new XmlMarkup();
    xml.ref({ id: '<H&R "block">' });
    expect(xml.targetBang()).toBe(`<ref id="&lt;H&amp;R &quot;block&quot;&gt;"/>`);
  });

  it("mixed attribute escaping with nested builders", () => {
    const x = new XmlMarkup({ target: xml });
    xml.ref({ id: ":H&amp;R" }, () => x.element({ tag: "Long&Short" }));
    expect(xml.targetBang()).toBe('<ref id="H&amp;R"><element tag="Long&amp;Short"/></ref>');
  });

  it("multiple attributes", () => {
    xml.ref({ id: 12, name: "bill" });
    expect(xml.targetBang()).toMatch(/^<ref( id="12"| name="bill"){2}\/>$/);
  });

  it("attributes with text", () => {
    xml.a("link", { href: "http://onestepback.org" });
    expect(xml.targetBang()).toBe(`<a href="http://onestepback.org">link</a>`);
  });

  it("attributes with newlines", () => {
    xml.abbr("W3C", { title: "World\nWide\rWeb\r\nConsortium" });
    expect(xml.targetBang()).toBe(
      `<abbr title="World&#10;Wide&#13;Web&#13;&#10;Consortium">W3C</abbr>`,
    );
  });

  it("complex", () => {
    xml.body({ bg: "#ffffff" }, (x: XmlMarkup) => x.title("T", { style: "red" }));
    expect(xml.targetBang()).toBe(`<body bg="#ffffff"><title style="red">T</title></body>`);
  });

  it("funky symbol", () => {
    xml.tagBang("non-ruby-token", { id: 1 }, (x: XmlMarkup) => x.ok());
    expect(xml.targetBang()).toBe(`<non-ruby-token id="1"><ok/></non-ruby-token>`);
  });

  it("tag can handle private method", () => {
    xml.tagBang("loop", { id: 1 }, (x: XmlMarkup) => x.ok());
    expect(xml.targetBang()).toBe(`<loop id="1"><ok/></loop>`);
  });

  it("no explicit marker", () => {
    xml.p((x: XmlMarkup) => x.b("HI"));
    expect(xml.targetBang()).toBe("<p><b>HI</b></p>");
  });

  it("reference local vars", () => {
    const n = 3;
    xml.ol((x: XmlMarkup) => {
      for (let i = 0; i < n; i++) x.li(n);
    });
    expect(xml.targetBang()).toBe("<ol><li>3</li><li>3</li><li>3</li></ol>");
  });

  it("reference methods", () => {
    xml.title((x: XmlMarkup) => x.a(() => x.b(_name())));
    expect(xml.targetBang()).toBe("<title><a><b>bob</b></a></title>");
  });

  it("append text", () => {
    xml.p((x: XmlMarkup) => {
      x.br();
      x.textBang("HI");
    });
    expect(xml.targetBang()).toBe("<p><br/>HI</p>");
  });

  it("ambiguous markup", () => {
    let ex: Error | undefined;
    expect(() => {
      try {
        xml.h1("data1", () => xml.b());
      } catch (e) {
        ex = e as Error;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect(ex!.message).toMatch(/\btext\b/);
    expect(ex!.message).toMatch(/\bblock\b/);
  });

  it("capitalized method", () => {
    xml.P((x: XmlMarkup) => {
      x.B("hi");
      x.BR();
      x.EM(() => x.textBang("world"));
    });
    expect(xml.targetBang()).toBe("<P><B>hi</B><BR/><EM>world</EM></P>");
  });

  it("escaping", () => {
    xml.div((x: XmlMarkup) => {
      x.textBang("<hi>");
      x.em("H&R Block");
    });
    expect(xml.targetBang()).toBe(`<div>&lt;hi&gt;<em>H&amp;R Block</em></div>`);
  });

  it("nil", () => {
    const b = new XmlMarkup();
    b.tagBang("foo", null);
    expect(b.targetBang()).toBe(`<foo/>`);
  });

  it("nil without explicit nil handling", () => {
    const b = new XmlMarkup({ explicitNilHandling: false });
    b.tagBang("foo", null);
    expect(b.targetBang()).toBe(`<foo/>`);
  });

  it("nil with explicit nil handling", () => {
    const b = new XmlMarkup({ explicitNilHandling: true });
    b.tagBang("foo", null);
    expect(b.targetBang()).toBe(`<foo nil="true"/>`);
  });

  it("non escaping", () => {
    xml.div({ "ns:xml": ":&xml;" }, (x: XmlMarkup) => {
      x.append("<h&i>");
      x.em("H&R Block");
    });
    expect(xml.targetBang()).toBe(`<div ns:xml="&xml;"><h&i><em>H&amp;R Block</em></div>`);
  });

  it("return value", () => {
    const str = xml.x("men");
    expect(str).toBe(xml.targetBang());
  });

  it("stacked builders", () => {
    const b = new XmlMarkup({ target: xml });
    b.div(() => xml.span(() => xml.a("text", { href: "ref" })));
    expect(xml.targetBang()).toBe('<div><span><a href="ref">text</a></span></div>');
  });
});

describe("TestAttributeEscaping", () => {
  let xml: XmlMarkup;
  beforeEach(() => {
    xml = new XmlMarkup();
  });

  it("element gt", () => {
    xml.title("1<2");
    expect(xml.targetBang()).toBe("<title>1&lt;2</title>");
  });

  it("element amp", () => {
    xml.title("AT&T");
    expect(xml.targetBang()).toBe("<title>AT&amp;T</title>");
  });

  it("element amp2", () => {
    xml.title("&amp;");
    expect(xml.targetBang()).toBe("<title>&amp;amp;</title>");
  });

  it("attr less", () => {
    xml.a({ title: "2>1" });
    expect(xml.targetBang()).toBe('<a title="2&gt;1"/>');
  });

  it("attr amp", () => {
    xml.a({ title: "AT&T" });
    expect(xml.targetBang()).toBe('<a title="AT&amp;T"/>');
  });

  it("attr quot", () => {
    xml.a({ title: '"x"' });
    expect(xml.targetBang()).toBe('<a title="&quot;x&quot;"/>');
  });
});

describe("TestNameSpaces", () => {
  let xml: XmlMarkup;
  beforeEach(() => {
    xml = new XmlMarkup({ indent: 2 });
  });

  it("simple name spaces", () => {
    xml.rdf(":RDF");
    expect(xml.targetBang()).toBe("<rdf:RDF/>\n");
  });

  it("long", () => {
    const xml = new XmlMarkup({ indent: 2 });
    xml.instructBang();
    xml.rdf(
      ":RDF",
      {
        "xmlns:rdf": ":&rdf;",
        "xmlns:rdfs": ":&rdfs;",
        "xmlns:xsd": ":&xsd;",
        "xmlns:owl": ":&owl;",
      },
      () => {
        xml.owl(":Class", { "rdf:ID": "Bird" }, () => {
          xml.rdfs(":label", "bird");
          xml.rdfs(":subClassOf", () => {
            xml.owl(":Restriction", () => {
              xml.owl(":onProperty", { "rdf:resource": "#wingspan" });
              xml.owl(":maxCardinality", 1, { "rdf:datatype": "&xsd;nonNegativeInteger" });
            });
          });
        });
      },
    );
    expect(xml.targetBang()).toMatch(/^<\?xml/);
    expect(xml.targetBang()).toMatch(/\n<rdf:RDF/m);
    expect(xml.targetBang()).toMatch(/xmlns:rdf="&rdf;"/m);
    expect(xml.targetBang()).toMatch(/<owl:Restriction>/m);
  });

  it("ensure", () => {
    const xml = new XmlMarkup();
    xml.html(() => {
      xml.body(() => {
        try {
          xml.p(() => {
            throw new Exception("boom");
          });
        } catch (e) {
          if (!(e instanceof Exception)) throw e;
          xml.pre(e);
        }
      });
    });
    expect(xml.targetBang()).toMatch(/<p>/);
    expect(xml.targetBang()).toMatch(/<\/p>/);
  });
});

describe("TestDeclarations", () => {
  let xml: XmlMarkup;
  beforeEach(() => {
    xml = new XmlMarkup({ indent: 2 });
  });

  it("declare", () => {
    xml.declareBang(":element");
    expect(xml.targetBang()).toBe("<!element>\n");
  });

  it("bare arg", () => {
    xml.declareBang(":element", ":arg");
    expect(xml.targetBang()).toBe("<!element arg>\n");
  });

  it("string arg", () => {
    xml.declareBang(":element", "string");
    expect(xml.targetBang()).toBe('<!element "string">\n');
  });

  it("mixed args", () => {
    xml.declareBang(":element", ":x", "y", ":z", "-//OASIS//DTD DocBook XML//EN");
    expect(xml.targetBang()).toBe('<!element x "y" z "-//OASIS//DTD DocBook XML//EN">\n');
  });

  it("nested declarations", () => {
    xml = new XmlMarkup();
    xml.declareBang(":DOCTYPE", ":chapter", (x: XmlMarkup) => {
      x.declareBang(":ELEMENT", ":chapter", ":(title,para+)");
    });
    expect(xml.targetBang()).toBe("<!DOCTYPE chapter [<!ELEMENT chapter (title,para+)>]>");
  });

  it("nested indented declarations", () => {
    xml.declareBang(":DOCTYPE", ":chapter", (x: XmlMarkup) => {
      x.declareBang(":ELEMENT", ":chapter", ":(title,para+)");
    });
    expect(xml.targetBang()).toBe("<!DOCTYPE chapter [\n  <!ELEMENT chapter (title,para+)>\n]>\n");
  });

  it("complex declaration", () => {
    xml.declareBang(":DOCTYPE", ":chapter", (x: XmlMarkup) => {
      x.declareBang(":ELEMENT", ":chapter", ":(title,para+)");
      x.declareBang(":ELEMENT", ":title", ":(#PCDATA)");
      x.declareBang(":ELEMENT", ":para", ":(#PCDATA)");
    });
    const expected = `<!DOCTYPE chapter [
  <!ELEMENT chapter (title,para+)>
  <!ELEMENT title (#PCDATA)>
  <!ELEMENT para (#PCDATA)>
]>
`;
    expect(xml.targetBang()).toBe(expected);
  });
});

describe("TestSpecialMarkup", () => {
  let xml: XmlMarkup;
  beforeEach(() => {
    xml = new XmlMarkup({ indent: 2 });
  });

  it("comment", () => {
    xml.commentBang("COMMENT");
    expect(xml.targetBang()).toBe("<!-- COMMENT -->\n");
  });

  it("indented comment", () => {
    xml.p(() => xml.commentBang("OK"));
    expect(xml.targetBang()).toBe("<p>\n  <!-- OK -->\n</p>\n");
  });

  it("instruct", () => {
    xml.instructBang(":abc", { version: "0.9" });
    expect(xml.targetBang()).toBe('<?abc version="0.9"?>\n');
  });

  it("indented instruct", () => {
    xml.p(() => xml.instructBang(":xml"));
    expect(xml.targetBang()).toMatch(/<p>\n {2}<\?xml version="1.0" encoding="UTF-8"\?>\n<\/p>\n/);
  });

  it("instruct without attributes", () => {
    xml.instructBang(":zz");
    expect(xml.targetBang()).toBe("<?zz?>\n");
  });

  it("xml instruct", () => {
    xml.instructBang();
    expect(xml.targetBang()).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>$/m);
  });

  it("xml instruct with overrides", () => {
    xml.instructBang(":xml", { encoding: "UCS-2" });
    expect(xml.targetBang()).toMatch(/^<\?xml version="1.0" encoding="UCS-2"\?>$/m);
  });

  it("xml instruct with standalong", () => {
    xml.instructBang(":xml", { encoding: "UCS-2", standalone: "yes" });
    expect(xml.targetBang()).toMatch(
      /^<\?xml version="1.0" encoding="UCS-2" standalone="yes"\?>$/m,
    );
  });

  it("no blocks", () => {
    expect(() => xml.instructBang(undefined, undefined, (x: XmlMarkup) => x.hi())).toThrow(
      IllegalBlockError,
    );
    expect(() => xml.commentBang(":element", (x: XmlMarkup) => x.hi())).toThrow(IllegalBlockError);
  });

  it("cdata", () => {
    xml.cdataBang("TEST");
    expect(xml.targetBang()).toBe("<![CDATA[TEST]]>\n");
  });

  it("cdata value", () => {
    xml.cdataValueBang("content:encoded", "<p>TEST</p>");
    expect(xml.targetBang()).toBe("<content:encoded><![CDATA[<p>TEST</p>]]></content:encoded>\n");
  });

  it("cdata with ampersand", () => {
    xml.cdataBang("TEST&CHECK");
    expect(xml.targetBang()).toBe("<![CDATA[TEST&CHECK]]>\n");
  });

  it("cdata with included close", () => {
    xml.cdataBang("TEST]]>CHECK");
    expect(xml.targetBang()).toBe("<![CDATA[TEST]]]]><![CDATA[>CHECK]]>\n");
  });
});

describe("TestIndentedXmlMarkup", () => {
  let xml: XmlMarkup;
  beforeEach(() => {
    xml = new XmlMarkup({ indent: 2 });
  });

  it("one level", () => {
    xml.ol((x: XmlMarkup) => x.li("text"));
    expect(xml.targetBang()).toBe("<ol>\n  <li>text</li>\n</ol>\n");
  });

  it("two levels", () => {
    xml.p((x: XmlMarkup) => {
      x.ol(() => x.li("text"));
      x.br();
    });
    expect(xml.targetBang()).toBe("<p>\n  <ol>\n    <li>text</li>\n  </ol>\n  <br/>\n</p>\n");
  });

  it("initial level", () => {
    xml = new XmlMarkup({ indent: 2, margin: 4 });
    xml.name((x: XmlMarkup) => x.first("Jim"));
    expect(xml.targetBang()).toBe(
      "        <name>\n          <first>Jim</first>\n        </name>\n",
    );
  });

  describe("TestUtfMarkup", () => {
    it("use entities if no encoding is given and kcode is none", () => {
      const xml = new XmlMarkup();
      xml.p("\u2019");
      expect(xml.targetBang()).toContain("<p>\u2019</p>");
    });

    it("use entities if encoding is utf but kcode is not", () => {
      const xml = new XmlMarkup();
      xml.instructBang(":xml", { encoding: "UTF-8" });
      xml.p("\u2019");
      expect(xml.targetBang()).toContain("<p>\u2019</p>");
    });

    it("use entities if kcode is utf but encoding is dummy encoding", () => {
      const xml = new XmlMarkup();
      xml.instructBang(":xml", { encoding: "UTF-16" });
      xml.p("\u2019");
      expect(xml.targetBang()).toMatch(/<p>&#8217;<\/p>/);
    });

    it("use entities if kcode is utf but encoding is unsupported encoding", () => {
      const xml = new XmlMarkup();
      xml.instructBang(":xml", { encoding: "UCS-2" });
      xml.p("\u2019");
      expect(xml.targetBang()).toMatch(/<p>&#8217;<\/p>/);
    });

    it("use utf8 if encoding defaults and kcode is utf8", () => {
      const xml = new XmlMarkup();
      xml.p("\u2019");
      expect(xml.targetBang()).toBe("<p>\u2019</p>");
    });

    it("use utf8 if both encoding and kcode are utf8", () => {
      const xml = new XmlMarkup();
      xml.instructBang(":xml", { encoding: "UTF-8" });
      xml.p("\u2019");
      expect(xml.targetBang()).toContain("<p>\u2019</p>");
    });

    it("use utf8 if both encoding and kcode are utf8 with lowercase", () => {
      const xml = new XmlMarkup();
      xml.instructBang(":xml", { encoding: "utf-8" });
      xml.p("\u2019");
      expect(xml.targetBang()).toContain("<p>\u2019</p>");
    });
  });

  describe("TestXmlEvents", () => {
    class EventHandler {
      events: unknown[][] = [];

      startTag(sym: string, attrs: Record<string, unknown> | null): void {
        this.events.push([":start", sym, attrs]);
      }

      endTag(sym: string): void {
        this.events.push([":end", sym]);
      }

      text(txt: string): void {
        this.events.push([":text", txt]);
      }
    }

    let handler: EventHandler;
    let xe: XmlEvents;
    beforeEach(() => {
      handler = new EventHandler();
      xe = new XmlEvents({ target: handler as never });
    });

    const popText = (): string => {
      let result = "";
      while (handler.events.length > 0 && handler.events[0][0] === ":text") {
        result += handler.events[0][1] as string;
        handler.events.shift();
      }
      return result;
    };

    it("simple", () => {
      xe.p();
      expect(handler.events.shift()).toEqual([":start", ":p", null]);
      expect(handler.events.shift()).toEqual([":end", ":p"]);
    });

    it("text", () => {
      xe.p("HI");
      expect(handler.events.shift()).toEqual([":start", ":p", null]);
      expect(handler.events.shift()).toEqual([":text", "HI"]);
      expect(handler.events.shift()).toEqual([":end", ":p"]);
    });

    it("attributes", () => {
      xe.p({ id: "2" });
      const ev = handler.events.shift()!;
      expect(ev.slice(0, 2)).toEqual([":start", ":p"]);
      expect((ev[2] as Record<string, unknown>).id).toBe("2");
      expect(handler.events.shift()).toEqual([":end", ":p"]);
    });

    it("indented", () => {
      const xml = new XmlEvents({ indent: 2, target: handler as never });
      xml.p((x: XmlEvents) => x.b("HI"));
      expect(handler.events.shift()).toEqual([":start", ":p", null]);
      expect(popText()).toBe("\n  ");
      expect(handler.events.shift()).toEqual([":start", ":b", null]);
      expect(popText()).toBe("HI");
      expect(handler.events.shift()).toEqual([":end", ":b"]);
      expect(popText()).toBe("\n");
      expect(handler.events.shift()).toEqual([":end", ":p"]);
    });
  });
});
