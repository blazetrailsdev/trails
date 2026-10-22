import { ArgumentError } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
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
