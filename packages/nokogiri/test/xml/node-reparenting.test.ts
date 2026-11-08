import { describe, it, expect, beforeEach } from "vitest";

import { XmlDocument } from "../../lib/xml/document.js";
import type { XmlNode } from "../../lib/xml/node.js";

describe("Nokogiri::XML::TestNodeReparenting", () => {
  describe("standard node reparenting behavior", () => {
    const source = "<root><a1>First node</a1><a2>Second node</a2><a3>Third <bx />node</a3></root>";
    let doc: XmlDocument;
    let doc2: XmlDocument;
    const fragmentString = "<b1>foo</b1><b2>bar</b2>";

    beforeEach(() => {
      doc = XmlDocument.parse(source);
      doc2 = XmlDocument.parse(source);
    });

    describe("#children=", () => {
      describe("passed a Node", () => {
        for (const which of ["current", "another"] as const) {
          describe(`passed a Node in the ${which} document`, () => {
            let otherDoc: XmlDocument;
            let otherNode: XmlNode;

            beforeEach(() => {
              otherDoc = which === "current" ? doc : doc2;
              otherNode = otherDoc.atXpath("/root/a2")!;
            });

            it("unlinks the Node from its previous position", () => {
              doc.atXpath("/root/a1")!.children = otherNode;
              const result = otherDoc.atXpath("/root/a2");
              expect(result).toBeUndefined();
            });

            it("inserts the Node in the proper position", () => {
              doc.atXpath("/root/a1")!.children = otherNode;
              const result = doc.atXpath("/root/a1/a2");
              expect(result).not.toBeUndefined();
            });
          });
        }
      });

      describe("passed a markup string", () => {
        it("inserts the fragment roots in the proper position", () => {
          doc.atXpath("/root/a1")!.children = fragmentString;
          const result = doc.xpath("/root/a1/node()").map((n) => n.name);
          expect(result).toEqual(["b1", "b2"]);
        });
      });
    });
  });
});
