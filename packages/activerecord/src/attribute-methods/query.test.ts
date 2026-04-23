import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";

describe("QueryTest", () => {
  beforeEach(() => {
    createTestAdapter();
  });

  it("query attribute returns false for nil", () => {
    class Post extends Base {
      static {
        this.attribute("published", "boolean");
      }
    }
    const p = new Post({});
    expect(p.queryAttribute("published")).toBe(false);
  });

  it("query attribute returns true for true", () => {
    class Post extends Base {
      static {
        this.attribute("published", "boolean");
      }
    }
    const p = new Post({ published: true });
    expect(p.queryAttribute("published")).toBe(true);
  });

  it("query attribute returns false for false", () => {
    class Post extends Base {
      static {
        this.attribute("published", "boolean");
      }
    }
    const p = new Post({ published: false });
    expect(p.queryAttribute("published")).toBe(false);
  });

  it("query attribute returns false for zero integer", () => {
    class Post extends Base {
      static {
        this.attribute("views", "integer");
      }
    }
    const p = new Post({ views: 0 });
    expect(p.queryAttribute("views")).toBe(false);
  });

  it("query attribute returns true for non-zero integer", () => {
    class Post extends Base {
      static {
        this.attribute("views", "integer");
      }
    }
    const p = new Post({ views: 5 });
    expect(p.queryAttribute("views")).toBe(true);
  });

  it("query attribute respects overridden getter", () => {
    class Post extends Base {
      static {
        this.attribute("views", "integer");
      }
      get views() {
        return 42;
      }
    }
    const p = new Post({ views: 0 });
    expect(p.queryAttribute("views")).toBe(true);
  });

  it("_query_attribute uses _readAttribute bypassing getter", () => {
    class Post extends Base {
      static {
        this.attribute("views", "integer");
      }
      get views() {
        return 42;
      }
    }
    const p = new Post({ views: 0 });
    // queryAttribute calls the getter (42 → true); _queryAttribute reads raw (0 → false)
    expect(p.queryAttribute("views")).toBe(true);
    expect(p._queryAttribute("views")).toBe(false);
  });
});
