import { describe, it, expect } from "vitest";
import { Base, ReadonlyAttributeError } from "../index.js";
import { fixtures } from "../test-fixtures.js";

fixtures({});

describe("WriteTest", () => {
  it("_write_attribute writes value to attribute", () => {
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
    class Post extends Base {
      static {
        this.attribute("body", "string");
        this.aliasAttribute("content", "body");
      }
    }
    const p = new Post({ body: "original" });
    expect(() => p._writeAttribute("content", "via alias")).toThrow(
      "can't write unknown attribute `content`",
    );
    expect(p._readAttribute("body")).toBe("original");
  });

  it("_write_attribute bypasses readonly check", () => {
    class Item extends Base {
      static {
        this.attribute("code", "string");
        this.attrReadonly("code");
      }
    }
    const item = new Item({ code: "A" });
    (item as any)._newRecord = false;
    expect(() => item._writeAttribute("code", "B")).toThrow(ReadonlyAttributeError);
  });
});
