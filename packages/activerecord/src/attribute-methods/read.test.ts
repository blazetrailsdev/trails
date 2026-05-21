import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { createSidecarTestAdapter } from "../test-adapter.js";

describe("ReadTest", () => {
  it.skip("define attribute methods", () => {
    // BLOCKED: type — read type/attribute gap
    // ROOT-CAUSE: read.ts or attribute-methods/read.ts missing Rails parity
    // SCOPE: ~20 LOC fix; affects ~1 test in read.test.ts
  });
  it.skip("attribute methods generated?", () => {
    // BLOCKED: type — read type/attribute gap
    // ROOT-CAUSE: read.ts or attribute-methods/read.ts missing Rails parity
    // SCOPE: ~20 LOC fix; affects ~1 test in read.test.ts
  });

  it("_read_attribute returns value for existing attribute", () => {
    createSidecarTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post({ title: "hello" });
    expect(p._readAttribute("title")).toBe("hello");
  });

  it("_read_attribute returns null for unset attribute", () => {
    createSidecarTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post({});
    expect(p._readAttribute("title")).toBeNull();
  });

  it("_read_attribute does not apply alias resolution", () => {
    createSidecarTestAdapter();
    class Post extends Base {
      static {
        this.attribute("body", "string");
        this.aliasAttribute("content", "body");
      }
    }
    const p = new Post({ body: "text" });
    expect(p._readAttribute("body")).toBe("text");
    expect(p._readAttribute("content")).toBeNull();
  });
});
