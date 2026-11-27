import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Builder } from "../../lib/xml/builder.js";
import { XmlDocument } from "../../lib/xml/document.js";

describe("Nokogiri::XML::TestBuilder", () => {
  it("attribute sensitivity", () => {
    const xml = new Builder((x: Builder) => {
      x.tag("hello", { abcDef: "world" });
    }).toXml();
    const doc = XmlDocument.parse(xml);
    expect(doc.root!.get("abcDef")).toBe("world");
  });

  it("builder resilient to exceptions", () => {
    const builder = new Builder((xml: Builder) => {
      xml.root(() => {
        try {
          xml.a(() => {
            throw new Error("badjoras");
          });
          // eslint-disable-next-line no-empty
        } catch {}

        xml.b();
      });
    });

    const expectedOutput = '<?xml version="1.0"?>\n<root>\n  <a/>\n  <b/>\n</root>\n';
    expect(builder.toXml()).toBe(expectedOutput);
  });

  it("builder with utf8 text", () => {
    const text = "test ﺵ ";
    const doc = new Builder({ encoding: "UTF-8" }, (xml: Builder) => {
      xml.test(text);
    }).doc;
    expect(doc.content).toBe(text);
  });

  it("builder escape", () => {
    const xml = new Builder((x: Builder) => {
      x.condition("value < 1", { attr: "value < 1" });
    }).toXml();
    const doc = XmlDocument.parse(xml);
    expect(doc.root!.get("attr")).toBe("value < 1");
    expect(doc.root!.content).toBe("value < 1");
  });

  it("builder namespaces part three", () => {
    const doc = new Builder((xml: Builder) => {
      xml.get("dnd").adventure({ "xmlns:dnd": "http://www.w3.org/dungeons#" }, () => {
        xml.get("dnd").party({ "xmlns:dnd": "http://www.w3.org/dragons#" }, () => {
          xml.get("dnd").character({ "xmlns:dnd": "http://www.w3.org/dungeons#" }, () => {
            xml.get("dnd").name("Nigel", { "xmlns:dnd": "http://www.w3.org/dungeons#" });
          });
        });
      });
    }).doc;

    const adventureNode = doc.atXpath("//*[local-name()='adventure']")!;
    expect(adventureNode.namespace!.href).toBe("http://www.w3.org/dungeons#");

    const partyNode = doc.atXpath("//*[local-name()='party']")!;
    expect(partyNode.namespace!.href).toBe("http://www.w3.org/dragons#");

    const characterNode = doc.atXpath("//*[local-name()='character']")!;
    expect(characterNode.namespace!.href).toBe("http://www.w3.org/dungeons#");

    const nameNode = doc.atXpath("//*[local-name()='name']")!;
    expect(nameNode.namespace!.href).toBe("http://www.w3.org/dungeons#");
  });

  it("builder with unlink", () => {
    const b = new Builder((xml: Builder) => {
      xml.foo(() => {
        xml.bar(() => xml.parent.unlink());
        xml.bar2();
      });
    });
    expect(b).toBeTruthy();
  });

  it("root namespace default decl", () => {
    const b = new Builder((xml: Builder) => {
      xml.root({ xmlns: "one:two" });
    });
    const doc = b.doc;
    expect(doc.root!.namespace!.href).toBe("one:two");
    expect(doc.root!.namespaces).toEqual({ xmlns: "one:two" });
  });

  it("builder namespace inheritance true", () => {
    const result = new Builder({ encoding: "utf-8" }, (xml: Builder) => {
      xml
        .get("soapenv")
        .Envelope({ "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/" }, () => {
          xml.Header();
        });
    });
    expect(result.doc.namespaceInheritance).toBeTruthy();
    expect(
      result.doc.atXpath("//soapenv:Header", {
        soapenv: "http://schemas.xmlsoap.org/soap/envelope/",
      }),
    ).toBeTruthy();
  });

  it("builder namespace inheritance false", () => {
    const result = new Builder(
      { encoding: "utf-8", namespaceInheritance: false },
      (xml: Builder) => {
        xml
          .get("soapenv")
          .Envelope({ "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/" }, () => {
            xml.Header();
          });
      },
    );
    expect(result.doc.namespaceInheritance).toBeFalsy();
    expect(result.doc.atXpath("//Header")).toBeTruthy();
  });

  it("specified namespace undeclared", () => {
    expect(
      () =>
        new Builder((xml: Builder) => {
          xml.root(() => {
            xml.get("foo").bar();
          });
        }),
    ).toThrow(ArgumentError);
  });

  it("set namespace inheritance", () => {
    expect(new Builder().doc.namespaceInheritance).toBeTruthy();
    expect(new Builder({ namespaceInheritance: false }).doc.namespaceInheritance).toBeFalsy();
  });

  it("bang and underscore is escaped", () => {
    const builder = new Builder((xml: Builder) => {
      xml.root(() => {
        xml.p_("adsfadsf");
        xml.methodMissing("p!", "adsfadsf");
      });
    });
    expect(builder.doc.xpath("//p").length).toBe(2);
  });

  it("square brackets set attributes", () => {
    const builder = new Builder((xml: Builder) => {
      xml.root(() => {
        const foo = xml.foo();
        foo.set("id", "hello");
        expect(foo.get("id")).toBe("hello");
      });
    });
    expect(builder.doc.xpath('//foo[@id = "hello"]').length).toBe(1);
  });
});
