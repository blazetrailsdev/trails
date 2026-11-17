import { describe, expect, test } from "vitest";

import { HTML5 } from "@blazetrails/nokogiri";

import { Loofah } from "../../lib/loofah.js";
import { ScrubBehavior } from "../../lib/loofah/concerns.js";

describe("Loofah::Scrubber#append_attribute", () => {
  test("writes the value alone when the attribute is absent", () => {
    const node = Loofah.html5Fragment("<a>x</a>").children[0];
    new Loofah.Scrubber().appendAttribute(node, "rel", "nofollow");
    expect(node.get("rel")).toBe("nofollow");
  });

  test("appends a new value and keeps an existing one once", () => {
    const node = Loofah.html5Fragment('<a rel="noopener">x</a>').children[0];
    const scrubber = new Loofah.Scrubber();
    scrubber.appendAttribute(node, "rel", "nofollow");
    scrubber.appendAttribute(node, "rel", "nofollow");
    expect(node.get("rel")).toBe("noopener nofollow");
  });
});

describe("Loofah::ScrubBehavior#scrub!", () => {
  test("traverses a document from its root", () => {
    const document = HTML5.Document.parse("<p>x</p>");
    const seen: string[] = [];
    ScrubBehavior.Node.scrubBang(
      document,
      new Loofah.Scrubber({}, (node) => {
        seen.push(node.name);
      }),
    );
    expect(seen[0]).toBe("html");
  });
});

describe("Loofah::Scrubber.new", () => {
  test("takes a block passed alone", () => {
    const block = () => Loofah.Scrubber.CONTINUE;
    const scrubber = new Loofah.Scrubber(block);
    expect(scrubber.block).toBe(block);
    expect(scrubber.direction).toBe("top_down");
  });
});
