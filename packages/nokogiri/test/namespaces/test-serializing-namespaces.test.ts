import { describe, it, expect } from "vitest";
import { Builder } from "../../lib/xml/builder.js";
import { XmlNode } from "../../lib/xml/node.js";

const AS_XML = XmlNode.SaveOptions.AS_XML;

describe("serializing namespaces", () => {
  // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
  it.skip("does not repeat xmlns definitions in child elements", () => {
    const doc = new Builder((xml: Builder) => {
      xml.get("ds").Signature({ "xmlns:ds": "http://www.w3.org/2000/09/xmldsig#" }, () => {
        xml.get("ds").SignatureValue("foobar", () => {});
      });
    }).doc.toXml({ saveWith: AS_XML });

    expect(doc).toContain('<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">');
    expect(doc).toContain("<ds:SignatureValue>foobar</ds:SignatureValue>");
  });

  // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
  it.skip("does not repeat xmlns definitions even when explicitly defined", () => {
    const doc = new Builder((xml: Builder) => {
      xml.get("ds").Signature({ "xmlns:ds": "http://www.w3.org/2000/09/xmldsig#" }, () => {
        xml
          .get("ds")
          .SignatureValue("foobar", { "xmlns:ds": "http://www.w3.org/2000/09/xmldsig#" }, () => {});
      });
    }).doc.toXml({ saveWith: AS_XML });

    expect(doc).toContain('<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">');
    expect(doc).toContain("<ds:SignatureValue>foobar</ds:SignatureValue>");
  });

  // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
  it.skip("redeclares xmlns definitions when shadowed", () => {
    const doc = new Builder((xml: Builder) => {
      xml.get("dnd").adventure({ "xmlns:dnd": "http://www.w3.org/dungeons#" }, () => {
        xml.get("dnd").party({ "xmlns:dnd": "http://www.w3.org/dragons#" }, () => {
          xml.get("dnd").members({ "xmlns:dnd": "http://www.w3.org/dragons#" }, () => {
            xml.get("dnd").character({ "xmlns:dnd": "http://www.w3.org/dungeons#" }, () => {
              xml.get("dnd").name("Nigel", { "xmlns:dnd": "http://www.w3.org/dungeons#" });
            });
          });
        });
      });
    }).doc.toXml({ saveWith: AS_XML });

    expect(doc).toContain('<dnd:adventure xmlns:dnd="http://www.w3.org/dungeons#">');
    expect(doc).toContain('<dnd:party xmlns:dnd="http://www.w3.org/dragons#">');
    expect(doc).toContain("<dnd:members>");
    expect(doc).toContain('<dnd:character xmlns:dnd="http://www.w3.org/dungeons#">');
    expect(doc).toContain("<dnd:name>Nigel</dnd:name>");
  });

  describe("default namespaces", () => {
    it("properly handles default namespaces", () => {
      const doc = new Builder((xml: Builder) => {
        xml.root({ xmlns: "http://default-namespace.org/" }, () => {
          xml.child("with default namespace");
          xml.get("specific").child("with specific namespace", {
            "xmlns:specific": "http://specific-namespace.org/",
          });
        });
      }).doc.toXml({ saveWith: AS_XML });

      expect(doc).toContain('<root xmlns="http://default-namespace.org/">');
      expect(doc).toContain("<child>with default namespace</child>");
      expect(doc).toContain(
        '<specific:child xmlns:specific="http://specific-namespace.org/">with specific namespace</specific:child>',
      );
    });

    it("handles nested default namespaces", () => {
      const doc = new Builder((xml: Builder) => {
        xml.root({ xmlns: "http://outer-namespace.org/" }, () => {
          xml.outer("in outer namespace");
          xml.inner({ xmlns: "http://inner-namespace.org/" }, () => {
            xml.element("in inner namespace");
          });
          xml.another("back in outer namespace");
        });
      }).doc.toXml({ saveWith: AS_XML });

      expect(doc).toContain('<root xmlns="http://outer-namespace.org/">');
      expect(doc).toContain("<outer>in outer namespace</outer>");
      expect(doc).toContain('<inner xmlns="http://inner-namespace.org/">');
      expect(doc).toContain("<element>in inner namespace</element>");
      expect(doc).toContain("<another>back in outer namespace</another>");
    });
  });

  describe("multiple namespaces on elements", () => {
    // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
    it.skip("handles multiple namespaces declared on a single element", () => {
      const doc = new Builder((xml: Builder) => {
        xml.root(() => {
          xml.element(
            {
              "xmlns:ns1": "http://namespace1.org/",
              "xmlns:ns2": "http://namespace2.org/",
              "xmlns:ns3": "http://namespace3.org/",
            },
            () => {
              xml.get("ns1").first("using first namespace");
              xml.get("ns2").second("using second namespace");
              xml.get("ns3").third("using third namespace");
            },
          );
        });
      }).doc.toXml({ saveWith: AS_XML });

      expect(doc).toContain(
        '<element xmlns:ns1="http://namespace1.org/" xmlns:ns2="http://namespace2.org/" xmlns:ns3="http://namespace3.org/">',
      );
      expect(doc).toContain("<ns1:first>using first namespace</ns1:first>");
      expect(doc).toContain("<ns2:second>using second namespace</ns2:second>");
      expect(doc).toContain("<ns3:third>using third namespace</ns3:third>");
    });

    // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
    it.skip("handles multiple namespaces declared on middle elements", () => {
      const doc = new Builder((xml: Builder) => {
        xml.root({ "xmlns:top": "http://top-namespace.org/" }, () => {
          xml.get("top").level1(() => {
            xml.middle(
              {
                "xmlns:mid1": "http://middle1-namespace.org/",
                "xmlns:mid2": "http://middle2-namespace.org/",
              },
              () => {
                xml.get("mid1").item("using middle1 namespace");
                xml.get("mid2").item("using middle2 namespace");
                xml.get("top").item("still using top namespace");

                xml.bottom({ "xmlns:bot": "http://bottom-namespace.org/" }, () => {
                  xml.get("bot").item("using bottom namespace");
                  xml.get("mid1").item("still using middle1 namespace");
                });
              },
            );
          });
        });
      }).doc.toXml({ saveWith: AS_XML });

      expect(doc).toContain('<root xmlns:top="http://top-namespace.org/">');
      expect(doc).toContain("<top:level1>");
      expect(doc).toContain(
        '<top:middle xmlns:mid1="http://middle1-namespace.org/" xmlns:mid2="http://middle2-namespace.org/">',
      );
      expect(doc).toContain("<mid1:item>using middle1 namespace</mid1:item>");
      expect(doc).toContain("<mid2:item>using middle2 namespace</mid2:item>");
      expect(doc).toContain("<top:item>still using top namespace</top:item>");
      expect(doc).toContain('<top:bottom xmlns:bot="http://bottom-namespace.org/">');
      expect(doc).toContain("<bot:item>using bottom namespace</bot:item>");
      expect(doc).toContain("<mid1:item>still using middle1 namespace</mid1:item>");
    });
  });

  describe("namespace scope and visibility", () => {
    // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
    it.skip("handles namespace prefixes reused with different URIs", () => {
      const doc = new Builder((xml: Builder) => {
        xml.root(() => {
          xml.outer({ "xmlns:ns": "http://outer-uri.org/" }, () => {
            xml.get("ns").element("outer namespace");

            xml.inner({ "xmlns:ns": "http://inner-uri.org/" }, () => {
              xml.get("ns").element("inner namespace");
            });

            xml.get("ns").another("back to outer namespace");
          });
        });
      }).doc.toXml({ saveWith: AS_XML });

      expect(doc).toContain('<outer xmlns:ns="http://outer-uri.org/">');
      expect(doc).toContain("<ns:element>outer namespace</ns:element>");
      expect(doc).toContain('<inner xmlns:ns="http://inner-uri.org/">');
      expect(doc).toContain("<ns:element>inner namespace</ns:element>");
      expect(doc).toContain("<ns:another>back to outer namespace</ns:another>");
    });

    // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
    it.skip("handles mixing default and prefixed namespaces", () => {
      const doc = new Builder((xml: Builder) => {
        xml.root({ xmlns: "http://default.org/", "xmlns:ns": "http://prefixed.org/" }, () => {
          xml.default_element("in default namespace");
          xml.get("ns").prefixed_element("in prefixed namespace");

          xml.mixed({ xmlns: "http://new-default.org/" }, () => {
            xml.new_default("in new default namespace");
            xml.get("ns").still_prefixed("still using original prefixed namespace");
          });
        });
      }).doc.toXml({ saveWith: AS_XML });

      expect(doc).toContain('<root xmlns="http://default.org/" xmlns:ns="http://prefixed.org/">');
      expect(doc).toContain("<default_element>in default namespace</default_element>");
      expect(doc).toContain("<ns:prefixed_element>in prefixed namespace</ns:prefixed_element>");
      expect(doc).toContain('<mixed xmlns="http://new-default.org/">');
      expect(doc).toContain("<new_default>in new default namespace</new_default>");
      expect(doc).toContain(
        "<ns:still_prefixed>still using original prefixed namespace</ns:still_prefixed>",
      );
    });
  });

  describe("namespace inheritance", () => {
    // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
    it.skip("inherits namespaces from ancestors without redeclaring them", () => {
      const doc = new Builder((xml: Builder) => {
        xml.root({ "xmlns:a": "http://a.org/", "xmlns:b": "http://b.org/" }, () => {
          xml.get("a").first(() => {
            xml.get("a").second(() => {
              xml.get("b").inner("using b namespace inside a");
            });
          });
          xml.get("b").third(() => {
            xml.get("a").inner("using a namespace inside b");
          });
        });
      }).doc.toXml({ saveWith: AS_XML });

      expect(doc).toContain('<root xmlns:a="http://a.org/" xmlns:b="http://b.org/">');
      expect(doc).toContain("<a:first>");
      expect(doc).toContain("<a:second>");
      expect(doc).toContain("<b:inner>using b namespace inside a</b:inner>");
      expect(doc).toContain("<b:third>");
      expect(doc).toContain("<a:inner>using a namespace inside b</a:inner>");

      expect(doc.split('xmlns:a="http://a.org/"').length - 1).toBe(1);
      expect(doc.split('xmlns:b="http://b.org/"').length - 1).toBe(1);
    });

    // BLOCKED: nokogiri-relink-namespace-qname-and-nsdef-arms
    it.skip("works with namespace declarations at different levels of the hierarchy", () => {
      const doc = new Builder((xml: Builder) => {
        xml.root({ "xmlns:top": "http://top.org/" }, () => {
          xml.get("top").level1(() => {
            xml.get("top").level2({ "xmlns:mid": "http://mid.org/" }, () => {
              xml.get("mid").item1();
              xml.get("top").item2();

              xml.get("mid").container({ "xmlns:deep": "http://deep.org/" }, () => {
                xml.get("deep").deepest();
                xml.get("mid").stillMid();
                xml.get("top").stillTop();
              });
            });
          });
        });
      }).doc.toXml({ saveWith: AS_XML });

      expect(doc).toContain('<root xmlns:top="http://top.org/">');
      expect(doc).toContain('<top:level2 xmlns:mid="http://mid.org/">');
      expect(doc).toContain("<mid:item1/>");
      expect(doc).toContain("<top:item2/>");
      expect(doc).toContain('<mid:container xmlns:deep="http://deep.org/">');
      expect(doc).toContain("<deep:deepest/>");
      expect(doc).toContain("<mid:stillMid/>");
      expect(doc).toContain("<top:stillTop/>");
    });
  });
});
