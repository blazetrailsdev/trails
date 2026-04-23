import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";

describe("WriteTest", () => {
  it("_write_attribute writes value to attribute", () => {
    createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post({ title: "old" });
    p._writeAttribute("title", "new");
    expect(p.readAttribute("title")).toBe("new");
  });

  it("_write_attribute writes directly without alias resolution", () => {
    createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("body", "string");
        this.aliasAttribute("content", "body");
      }
    }
    const p = new Post({ body: "original" });
    // _writeAttribute("content", ...) writes to the "content" slot directly.
    // Neither writeAttribute nor _writeAttribute resolve aliases today;
    // that redirect will live in a future AR-level writeAttribute override.
    p._writeAttribute("content", "via alias");
    expect(p._readAttribute("body")).toBe("original");
    expect(p._readAttribute("content")).toBe("via alias");
  });

  it("_write_attribute bypasses readonly check", () => {
    createTestAdapter();
    class Item extends Base {
      static {
        this.attribute("code", "string");
        this.attrReadonly("code");
      }
    }
    const item = new Item({ code: "A" });
    (item as any)._newRecord = false;
    expect(() => item._writeAttribute("code", "B")).not.toThrow();
    expect(item.readAttribute("code")).toBe("B");
  });
});
