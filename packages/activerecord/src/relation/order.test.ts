import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    posts: { title: "string", score: "integer", name: "string", price: "integer" },
  });
});

describe("OrderTest", () => {
  it("order with string", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("order with hash", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.order({ title: "desc" }).toSql();
    expect(sql).toContain("DESC");
  });

  it("reorder replaces existing order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.order("title").reorder({ title: "desc" }).toSql();
    expect(sql).toContain("DESC");
  });

  it("reverse order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.order("title").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it("order asc", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer");
      }
    }
    await Post.create({ title: "b", score: 2 });
    await Post.create({ title: "a", score: 1 });
    const results = await Post.order("title").toArray();
    expect(results[0].title).toBe("a");
    expect(results[1].title).toBe("b");
  });

  it("order desc", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer");
      }
    }
    await Post.create({ title: "a", score: 1 });
    await Post.create({ title: "b", score: 2 });
    const results = await Post.order("title DESC").toArray();
    expect(results[0].title).toBe("b");
  });

  it("order with association", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "c" });
    await Post.create({ title: "a" });
    const results = await Post.order("title").toArray();
    expect(results[0].title).toBe("a");
  });

  it("order with association alias", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer");
      }
    }
    await Post.create({ title: "z", score: 1 });
    await Post.create({ title: "a", score: 2 });
    const results = await Post.order("title").toArray();
    expect(results[0].title).toBe("a");
  });

  describe("hash syntax", () => {
    it("order asc", async () => {
      class Post extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("price", "integer");
        }
      }
      await Post.create({ name: "Charlie", price: 30 });
      await Post.create({ name: "Alice", price: 10 });
      await Post.create({ name: "Bob", price: 20 });
      const result = await Post.all().order({ name: "asc" }).toArray();
      expect(result[0].name).toBe("Alice");
      expect(result[2].name).toBe("Charlie");
    });

    it("order desc", async () => {
      class Post extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("price", "integer");
        }
      }
      await Post.create({ name: "Charlie", price: 30 });
      await Post.create({ name: "Alice", price: 10 });
      await Post.create({ name: "Bob", price: 20 });
      const result = await Post.all().order({ name: "desc" }).toArray();
      expect(result[0].name).toBe("Charlie");
      expect(result[2].name).toBe("Alice");
    });

    it("order by string column name", async () => {
      class Post extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("price", "integer");
        }
      }
      await Post.create({ name: "Charlie", price: 30 });
      await Post.create({ name: "Alice", price: 10 });
      const result = await Post.all().order("name").toArray();
      expect(result[0].name).toBe("Alice");
    });

    it("reorder replaces existing order", async () => {
      class Post extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("price", "integer");
        }
      }
      await Post.create({ name: "Charlie", price: 30 });
      await Post.create({ name: "Alice", price: 10 });
      await Post.create({ name: "Bob", price: 20 });
      const result = await Post.all().order({ name: "asc" }).reorder({ name: "desc" }).toArray();
      expect(result[0].name).toBe("Charlie");
    });

    it("reverseOrder flips direction", async () => {
      class Post extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("price", "integer");
        }
      }
      await Post.create({ name: "Charlie", price: 30 });
      await Post.create({ name: "Alice", price: 10 });
      await Post.create({ name: "Bob", price: 20 });
      const result = await Post.all().order({ price: "asc" }).reverseOrder().toArray();
      expect(result[0].price).toBe(30);
    });

    it("multiple order columns", () => {
      class Post extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("price", "integer");
        }
      }
      const sql = Post.all().order({ name: "asc" }, { price: "desc" }).toSql();
      expect(sql).toContain("name");
      expect(sql).toContain("price");
    });
  });
});
