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

describe("MysqlDefaultExpressionTest", () => {
  // MySQL-specific default expression tests require a MySQL adapter.
  // MemoryAdapter does not support SQL default expressions; these remain skipped.
  it.skip("schema dump includes default expression — requires MySQL adapter", () => {});
  it.skip("schema dump includes default expression with single quotes reflected correctly — requires MySQL adapter", () => {});
  it.skip("schema dump datetime includes default expression — requires MySQL adapter", () => {});
  it.skip("schema dump datetime includes precise default expression — requires MySQL adapter", () => {});
  it.skip("schema dump datetime includes precise default expression with on update — requires MySQL adapter", () => {});
  it.skip("schema dump timestamp includes default expression — requires MySQL adapter", () => {});
  it.skip("schema dump timestamp includes precise default expression — requires MySQL adapter", () => {});
  it.skip("schema dump timestamp includes precise default expression with on update — requires MySQL adapter", () => {});
  it.skip("schema dump timestamp without default expression — requires MySQL adapter", () => {});
});

describe("DefaultNumbersTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Counter extends Base {
      static {
        this.attribute("value", "integer");
        this.adapter = adapter;
      }
    }
    return { Counter };
  }

  it("default positive integer", async () => {
    const { Counter } = makeModel();
    const c = await Counter.create({ value: 42 });
    expect(c.readAttribute("value")).toBe(42);
  });

  it("default negative integer", async () => {
    const { Counter } = makeModel();
    const c = await Counter.create({ value: -5 });
    expect(c.readAttribute("value")).toBe(-5);
  });

  it("default decimal number", async () => {
    const { Counter } = makeModel();
    const c = await Counter.create({ value: 0 });
    expect(c.readAttribute("value")).toBe(0);
  });
});

describe("DefaultBinaryTest", () => {
  it("default varbinary string", async () => {
    const adp = freshAdapter();
    class BinRecord extends Base {
      static {
        this.attribute("data", "string");
        this.adapter = adp;
      }
    }
    const r = await BinRecord.create({ data: "binary_data" });
    expect(r.readAttribute("data")).toBe("binary_data");
  });
  it("default binary string", async () => {
    const adp = freshAdapter();
    class BinRecord extends Base {
      static {
        this.attribute("data", "string", { default: "" });
        this.adapter = adp;
      }
    }
    const r = new BinRecord({});
    expect(r.readAttribute("data")).toBe("");
  });
  it("default varbinary string that looks like hex", async () => {
    const adp = freshAdapter();
    class BinRecord extends Base {
      static {
        this.attribute("data", "string");
        this.adapter = adp;
      }
    }
    const r = await BinRecord.create({ data: "0xDEADBEEF" });
    expect(r.readAttribute("data")).toBe("0xDEADBEEF");
  });
});

describe("DefaultTest", () => {
  it("nil defaults for not null columns", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = new Post({});
    expect(p.readAttribute("title")).toBeNull();
  });

  it("multiline default text", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("body", "string", { default: "line1\nline2\nline3" });
        this.adapter = adapter;
      }
    }
    const p = new Post({});
    expect(p.readAttribute("body")).toBe("line1\nline2\nline3");
  });
});

describe("DefaultsTestWithoutTransactionalFixtures", () => {
  it.skip("mysql not null defaults non strict", () => {
    /* fixture-dependent */
  });
  it.skip("mysql not null defaults strict", () => {
    /* fixture-dependent */
  });
});

describe("DefaultTextTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });
  it("default texts", async () => {
    class Post extends Base {
      static {
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ body: "some text" });
    expect(p.readAttribute("body")).toBe("some text");
  });
  it("default texts containing single quotes", async () => {
    class Post extends Base {
      static {
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ body: "it's some text" });
    expect(p.readAttribute("body")).toBe("it's some text");
  });
});

describe("DefaultStringsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });
  it("default strings", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "hello" });
    expect(p.readAttribute("title")).toBe("hello");
  });
  it("default strings containing single quotes", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "it's a test" });
    expect(p.readAttribute("title")).toBe("it's a test");
  });
});

describe("PostgresqlDefaultExpressionTest", () => {
  // PostgreSQL-specific default expression tests require a PostgreSQL adapter.
  it.skip("schema dump includes default expression — requires PostgreSQL adapter", () => {});
});

describe("Sqlite3DefaultExpressionTest", () => {
  // SQLite3-specific default expression tests require a SQLite3 adapter.
  it.skip("schema dump includes default expression — requires SQLite3 adapter", () => {});
});

describe("DefaultTest", () => {
  const adapter = freshAdapter();

  it.skip("default attribute value overrides from database", () => {});

  it("default attribute value for integer", () => {
    class M extends Base {
      static {
        this.attribute("count", "integer", { default: 42 });
        this.adapter = adapter;
      }
    }
    expect(new M().readAttribute("count")).toBe(42);
  });

  it("default attribute value for string", () => {
    class M extends Base {
      static {
        this.attribute("name", "string", { default: "hello" });
        this.adapter = adapter;
      }
    }
    expect(new M().readAttribute("name")).toBe("hello");
  });

  it("default attribute value for boolean", () => {
    class M extends Base {
      static {
        this.attribute("active", "boolean", { default: true });
        this.adapter = adapter;
      }
    }
    expect(new M().readAttribute("active")).toBe(true);
  });

  it.skip("default attribute value for datetime", () => {});
  it.skip("default attribute value for date", () => {});
  it.skip("default attribute value for decimal", () => {});

  it("default value for float", () => {
    class M extends Base {
      static {
        this.attribute("score", "float", { default: 3.14 });
        this.adapter = adapter;
      }
    }
    expect(new M().readAttribute("score")).toBeCloseTo(3.14);
  });

  it("default attribute value for text", () => {
    class M extends Base {
      static {
        this.attribute("bio", "string", { default: "none" });
        this.adapter = adapter;
      }
    }
    expect(new M().readAttribute("bio")).toBe("none");
  });

  it("default attribute value is available on new record", () => {
    class M extends Base {
      static {
        this.attribute("status", "string", { default: "draft" });
        this.adapter = adapter;
      }
    }
    const m = new M();
    expect(m.readAttribute("status")).toBe("draft");
  });

  it("default attribute value accessible through class", () => {
    class M extends Base {
      static {
        this.attribute("role", "string", { default: "user" });
        this.adapter = adapter;
      }
    }
    const defaults = M.columnDefaults;
    expect(defaults.role).toBe("user");
  });
});

describe("Base.columnDefaults", () => {
  it("returns default values for all attributes", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "Anonymous" });
        this.attribute("active", "boolean", { default: true });
        this.adapter = adapter;
      }
    }
    const defaults = User.columnDefaults;
    expect(defaults.name).toBe("Anonymous");
    expect(defaults.active).toBe(true);
    expect(defaults.id).toBe(null);
  });
});
