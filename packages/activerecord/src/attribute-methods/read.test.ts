import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { createSidecarTestAdapter } from "../test-adapter.js";

describe("ReadTest", () => {
  // FOLLOW-UP (f9g2-read-lazy-attribute-methods): Rails asserts attribute
  // accessor methods are ABSENT before `define_attribute_methods` and present
  // afterward (read_test.rb:45-63), backed by
  // ActiveRecord::AttributeMethods#define_attribute_methods /
  // attribute_methods_generated? (attribute_methods.rb:98-143). Trails
  // currently generates accessors eagerly at `attribute()` declaration; matching
  // Rails' lazy generation is a portable parity gap (not a JS-runtime
  // impossibility), tracked separately to keep this PR scoped.
  it.skip("define attribute methods", () => {});
  it.skip("attribute methods generated?", () => {});

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
