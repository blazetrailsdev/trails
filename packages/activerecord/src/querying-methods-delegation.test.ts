/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { Base } from "./index.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("Base static query delegations", () => {
  let adapter: DatabaseAdapter;
  beforeEach(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, { users: { name: "string" } });
  });

  afterAll(async () => {
    await dropAllTables(adapter);
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
    expect((first as any).name).toBe("Alice");
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
    expect((last as any).name).toBe("Bob");
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
    expect(results[0].name).toBe("Alice");
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
    expect(record.name).toBe("Alice");
  });
});
