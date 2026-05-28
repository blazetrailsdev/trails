import { describe, it, expect, beforeAll } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import { Base, defineEnum, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    fov_posts: { title: "string" },
    fov_books: { author_id: "integer" },
    fov_authors: { name: "string" },
  });
});

// ==========================================================================
// FieldOrderedValuesTest — targets relation/field_ordered_values_test.rb
// ==========================================================================
describe("FieldOrderedValuesTest", () => {
  it("in order of generates CASE expression", () => {
    class Post extends Base {
      static {
        this.attribute("status", "string");
      }
    }
    const sql = Post.all().inOrderOf("status", ["draft", "published", "archived"]).toSql();
    expect(sql).toContain("CASE");
  });

  it("in order of empty", () => {
    class Post extends Base {
      static {
        this.attribute("status", "string");
      }
    }
    // Rails: return spawn.none! if values.empty? — produces WHERE (1=0), no CASE.
    const sql = Post.all().inOrderOf("status", []).toSql();
    expect(sql).toContain("1=0");
    expect(sql).not.toContain("CASE");
  });

  it("in order of with enums values", () => {
    class Post extends Base {
      static {
        this.attribute("status", "integer");
      }
    }
    defineEnum(Post, "status", { draft: 0, published: 1, archived: 2 });
    const sql = Post.all().inOrderOf("status", [0, 1, 2]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("0");
    expect(sql).toContain("1");
    expect(sql).toContain("2");
  });

  it("in order of with enums keys", () => {
    class Post extends Base {
      static {
        this.attribute("status", "integer");
      }
    }
    defineEnum(Post, "status", { draft: 0, published: 1, archived: 2 });
    const sql = Post.all().inOrderOf("status", ["draft", "published", "archived"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("draft");
  });

  it("in order of with string column", () => {
    class Post extends Base {
      static {
        this.attribute("status", "string");
      }
    }
    const sql = Post.all().inOrderOf("status", ["draft", "published", "archived"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("draft");
    expect(sql).toContain("published");
    expect(sql).toContain("archived");
  });

  it("in order of after regular order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("status", "string");
      }
    }
    const sql = Post.order("title").inOrderOf("status", ["draft", "published"]).toSql();
    expect(sql).toContain("CASE");
  });

  it("in order of with nil", () => {
    class Post extends Base {
      static {
        this.attribute("status", "string");
      }
    }
    const sql = Post.all().inOrderOf("status", [null, "draft", "published"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("NULL");
  });

  it("in order of", async () => {
    class FovPost extends Base {
      static {
        this.tableName = "fov_posts";
        this.attribute("title", "string");
      }
    }
    const p1 = await FovPost.create({ title: "a" });
    const p2 = await FovPost.create({ title: "b" });
    const p3 = await FovPost.create({ title: "c" });
    const order = [p3.id, p1.id, p2.id];
    const posts = await FovPost.inOrderOf("id", order).toArray();
    expect(posts.map((p: any) => p.id)).toEqual(order);
  });

  it("in order of expression", async () => {
    class FovPost extends Base {
      static {
        this.tableName = "fov_posts";
        this.attribute("title", "string");
      }
    }
    const p1 = await FovPost.create({ title: "a" });
    const p2 = await FovPost.create({ title: "b" });
    const p3 = await FovPost.create({ title: "c" });
    const order = [p3.id, p1.id, p2.id] as number[];
    const posts = await FovPost.inOrderOf(
      arelSql("id * 2"),
      order.map((id) => id * 2),
    ).toArray();
    expect(posts.map((p: any) => p.id)).toEqual(order);
  });

  it("in order of with associations", async () => {
    class FovAuthor extends Base {
      static {
        this.tableName = "fov_authors";
        this.attribute("name", "string");
      }
    }
    class FovBook extends Base {
      static {
        this.tableName = "fov_books";
        this.attribute("author_id", "integer");
      }
    }
    Associations.belongsTo.call(FovBook, "author", {
      className: "FovAuthor",
      foreignKey: "author_id",
    });
    registerModel("FovAuthor", FovAuthor);
    registerModel("FovBook", FovBook);

    const john = await FovAuthor.create({ name: "John" });
    const bob = await FovAuthor.create({ name: "Bob" });
    const anna = await FovAuthor.create({ name: "Anna" });
    await FovBook.create({ author_id: john.id });
    await FovBook.create({ author_id: bob.id });
    await FovBook.create({ author_id: anna.id });

    const nameById = new Map<unknown, string>([
      [john.id, "John"],
      [bob.id, "Bob"],
      [anna.id, "Anna"],
    ]);
    const order = ["Bob", "Anna", "John"];
    const books = await FovBook.joins("author").inOrderOf("fov_authors.name", order).toArray();
    const names = books.map((b: any) => nameById.get(b.readAttribute("author_id")));
    expect(names).toEqual(order);
  });

  it("in order of with filter false", async () => {
    class FovPost extends Base {
      static {
        this.tableName = "fov_posts";
        this.attribute("title", "string");
      }
    }
    const p1 = await FovPost.create({ title: "a" });
    const p2 = await FovPost.create({ title: "b" });
    const p3 = await FovPost.create({ title: "c" });
    await FovPost.create({ title: "d" });
    const order = [p3.id, p1.id, p2.id];
    const posts = FovPost.inOrderOf("id", order, false);

    const ordered = await posts.limit(3).toArray();
    expect(ordered.map((p: any) => p.id)).toEqual(order);
    expect(await posts.count()).toBe(4);
  });
});
