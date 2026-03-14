/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "./index.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("Base static query delegations", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("Base.first() returns the first record", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const first = await User.first();
    expect(first).not.toBeNull();
    expect((first as any).readAttribute("name")).toBe("Alice");
  });

  it("Base.last() returns the last record", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const last = await User.last();
    expect(last).not.toBeNull();
    expect((last as any).readAttribute("name")).toBe("Bob");
  });

  it("Base.take() returns any record", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });

    const taken = await User.take();
    expect(taken).not.toBeNull();
  });

  it("Base.select() returns a relation with selected columns", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });

    const rel = User.select("name");
    const results = await rel.toArray();
    expect(results.length).toBe(1);
  });

  it("Base.order() returns an ordered relation", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Bob" });
    await User.create({ name: "Alice" });

    const results = await User.order("name").toArray();
    expect(results[0].readAttribute("name")).toBe("Alice");
  });

  it("Base.limit() limits results", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });

    const results = await User.limit(2).toArray();
    expect(results.length).toBe(2);
  });

  it("Base.distinct() returns distinct results", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const rel = User.distinct();
    expect(rel.distinctValue).toBe(true);
  });

  it("Base.none() returns empty relation", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });

    const results = await User.none().toArray();
    expect(results.length).toBe(0);
  });

  it("Base.sole() returns the sole record", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });

    const record = await User.sole();
    expect(record.readAttribute("name")).toBe("Alice");
  });
});
