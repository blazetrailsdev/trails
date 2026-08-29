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
    const match = p.matchedAttributeMethod("published");
    expect(match?.proxyTarget).toBe("attribute");
    expect(p.attributeMissing(match!)).toBe(true);
  });
});
