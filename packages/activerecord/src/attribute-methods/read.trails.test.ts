import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { fixtures } from "../test-fixtures.js";

fixtures({});

describe("ReadTest", () => {
  it("the empty-suffix pattern proxies to attribute", () => {
    class Post extends Base {
      static {
        this.attribute("published", "boolean");
      }
    }
    const p = new Post({ published: true }) as Post & {
      matchedAttributeMethod(name: string): { proxyTarget: string; attrName: string } | null;
      attributeMissing(match: { proxyTarget: string; attrName: string }): unknown;
    };
    // read.rb:41 aliases `attribute` to `_read_attribute`, which is what the
    // bare (empty prefix/suffix) pattern names as its proxy target.
    const match = p.matchedAttributeMethod("published");
    expect(match?.proxyTarget).toBe("attribute");
    expect(p.attributeMissing(match!)).toBe(true);
  });
});
