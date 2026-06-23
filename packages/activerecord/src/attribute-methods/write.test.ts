import { describe, it, expect } from "vitest";
import { Base, ReadonlyAttributeError } from "../index.js";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { createSidecarTestAdapter } from "../test-adapter.js";

describe("WriteTest", () => {
  it("_write_attribute writes value to attribute", () => {
    createSidecarTestAdapter();
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
    createSidecarTestAdapter();
    class Post extends Base {
      static {
        this.attribute("body", "string");
        this.aliasAttribute("content", "body");
      }
    }
    const p = new Post({ body: "original" });
    // `_write_attribute` does NOT resolve aliases (only the public
    // `write_attribute` does). So `content` reaches `write_from_user` unresolved;
    // it is not a real column, so the strict path raises MissingAttributeError
    // (Rails attribute_set.rb Null fallthrough) rather than redirecting to `body`.
    expect(() => p._writeAttribute("content", "via alias")).toThrow(MissingAttributeError);
    expect(p._readAttribute("body")).toBe("original");
  });

  it("_write_attribute bypasses readonly check", () => {
    createSidecarTestAdapter();
    class Item extends Base {
      static {
        this.attribute("code", "string");
        this.attrReadonly("code");
      }
    }
    const item = new Item({ code: "A" });
    (item as any)._newRecord = false;
    // Rails HasReadonlyAttributes overrides _write_attribute to also enforce readonly —
    // in our implementation _writeAttribute also raises, matching Rails behavior.
    expect(() => item._writeAttribute("code", "B")).toThrow(ReadonlyAttributeError);
  });
});
