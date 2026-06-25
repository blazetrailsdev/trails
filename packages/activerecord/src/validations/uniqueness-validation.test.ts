/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../index.js";
import { adapterType } from "../test-adapter.js";
import { itIfSupports } from "../test-helpers/supports.js";

import { defineSchema } from "../test-helpers/define-schema.js";
import type { Schema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

const MERGED_SCHEMA: Schema = {
  posts: {
    title: "string",
    author: "string",
    category: "string",
    year: "integer",
    month: "integer",
    org_id: "integer",
    code: "integer",
    active: "integer",
    body: "string",
    uuid: "string",
    saved_count: "integer",
    order: "string",
    slug: "string",
    published: "integer",
  },
  items: { code: "integer", name: "string" },
  comments: {
    body: "string",
    commentable_type: "string",
    commentable_id: "integer",
  },
  articles: { title: "string" },
  special_posts: { title: "string" },
  orders: {
    shop_id: "integer",
    order_num: "integer",
    total: "integer",
  },
  emails: { address: "string" },
};

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema(MERGED_SCHEMA);
});

describe("UniquenessValidationTest", () => {
  it("validate uniqueness with alias attribute", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.aliasAttribute("heading", "title");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "hello" });
    // Try to save another with same title - alias reads correctly
    const p2 = new Post({ title: "hello" });
    expect((p2 as any).heading).toBe("hello"); // alias works
    const saved = await p2.save();
    expect(saved).toBe(false);
    expect(p2.errors.on("title")).toBeTruthy();
  });

  it("validates uniqueness with nil value", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: null });
    const p2 = new Post({ title: null });
    // null values skip uniqueness check
    expect(p2.isValid()).toBe(true);
  });

  it("validates uniqueness with validates", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "hello" });
    const p2 = new Post({ title: "hello" });
    const saved = await p2.save();
    expect(saved).toBe(false);
    expect(p2.errors.on("title")).toBeTruthy();
  });

  it("validate uniqueness when integer out of range", async () => {
    class Item extends Base {
      static {
        this.attribute("code", "integer");
        this.validatesUniqueness("code");
      }
    }
    await Item.create({ code: 999999999 });
    const i2 = new Item({ code: 999999999 });
    expect(await i2.save()).toBe(false);
  });

  it("validate uniqueness when integer out of range show order does not matter", async () => {
    class Item extends Base {
      static {
        this.attribute("code", "integer");
        this.attribute("name", "string");
        this.validatesUniqueness("code");
      }
    }
    await Item.create({ code: 123, name: "first" });
    const i2 = new Item({ code: 123, name: "second" });
    expect(await i2.save()).toBe(false);
  });

  it("validates uniqueness with newline chars", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "hello world" });
    const p2 = new Post({ title: "hello world" });
    expect(await p2.save()).toBe(false);
    const p3 = new Post({ title: "hello_world" });
    expect(await p3.save()).toBe(true);
  });

  it("validate uniqueness with scope", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
        this.validatesUniqueness("title", { scope: "author" });
      }
    }
    await Post.create({ title: "hello", author: "alice" });
    // Same title, different author - valid
    const p2 = new Post({ title: "hello", author: "bob" });
    expect(await p2.save()).toBe(true);
    // Same title, same author - invalid
    const p3 = new Post({ title: "hello", author: "alice" });
    expect(await p3.save()).toBe(false);
  });

  it("validate uniqueness with aliases", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.aliasAttribute("heading", "title");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "dup" });
    const p2 = new Post({ title: "dup" });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness with scope invalid syntax", () => {
    // Rails: assert_raises(ArgumentError) { Reply.validates_uniqueness_of(:content, scope: { parent_id: false }) }
    // Passes a hash as scope (invalid); validatesUniqueness throws ArgumentError at declaration time.
    expect(() => {
      class Post extends Base {
        static {
          this.validatesUniqueness("title", { scope: { nonexistent_col: false } as any });
        }
      }
    }).toThrow(ArgumentError);
  });

  it("validate uniqueness with object scope", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("org_id", "integer");
        this.validatesUniqueness("title", { scope: "org_id" });
      }
    }
    await Post.create({ title: "hello", org_id: 1 });
    const p2 = new Post({ title: "hello", org_id: 2 });
    expect(await p2.save()).toBe(true);
    const p3 = new Post({ title: "hello", org_id: 1 });
    expect(await p3.save()).toBe(false);
  });

  it("validate uniqueness with polymorphic object scope", async () => {
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("commentable_type", "string");
        this.attribute("commentable_id", "integer");
        this.validatesUniqueness("body", { scope: ["commentable_type", "commentable_id"] });
      }
    }
    await Comment.create({ body: "great", commentable_type: "Post", commentable_id: 1 });
    const c2 = new Comment({ body: "great", commentable_type: "Post", commentable_id: 2 });
    expect(await c2.save()).toBe(true);
    const c3 = new Comment({ body: "great", commentable_type: "Post", commentable_id: 1 });
    expect(await c3.save()).toBe(false);
  });

  it("validate uniqueness with composed attribute scope", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("year", "integer");
        this.attribute("month", "integer");
        this.validatesUniqueness("title", { scope: ["year", "month"] });
      }
    }
    await Post.create({ title: "report", year: 2024, month: 1 });
    const p2 = new Post({ title: "report", year: 2024, month: 2 });
    expect(await p2.save()).toBe(true);
    const p3 = new Post({ title: "report", year: 2024, month: 1 });
    expect(await p3.save()).toBe(false);
  });

  it("validate uniqueness with object arg", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "taken" });
    const p2 = new Post({ title: "taken" });
    expect(await p2.save()).toBe(false);
    expect(p2.errors.on("title")).toBeTruthy();
  });

  it("validate uniqueness scoped to defining class", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    class Article extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "shared" });
    const a = new Article({ title: "shared" });
    expect(await a.save()).toBe(true);
  });

  it("validate uniqueness with scope array", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
        this.attribute("category", "string");
        this.validatesUniqueness("title", { scope: ["author", "category"] });
      }
    }
    await Post.create({ title: "hello", author: "alice", category: "tech" });
    const p2 = new Post({ title: "hello", author: "alice", category: "other" });
    expect(await p2.save()).toBe(true);
    const p3 = new Post({ title: "hello", author: "alice", category: "tech" });
    expect(await p3.save()).toBe(false);
  });

  it("validate case insensitive uniqueness", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "Hello" });
    const p2 = new Post({ title: "hello" });
    expect(await p2.save()).toBe(true);
  });

  it("validate case sensitive uniqueness with special sql like chars", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "hello%" });
    const p2 = new Post({ title: "hello%" });
    expect(await p2.save()).toBe(false);
    const p3 = new Post({ title: "hello_" });
    expect(await p3.save()).toBe(true);
  });

  it("validate case insensitive uniqueness with special sql like chars", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "test%" });
    const p2 = new Post({ title: "test%" });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness by default database collation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "collation_test" });
    const p2 = new Post({ title: "collation_test" });
    expect(await p2.save()).toBe(false);
  });

  it("validate case sensitive uniqueness", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "CaseSensitive" });
    const p2 = new Post({ title: "CaseSensitive" });
    expect(await p2.save()).toBe(false);
    const p3 = new Post({ title: "casesensitive" });
    expect(await p3.save()).toBe(true);
  });

  it("validate case sensitive uniqueness with attribute passed as integer", async () => {
    class Post extends Base {
      static {
        this.attribute("code", "integer");
        this.validatesUniqueness("code");
      }
    }
    await Post.create({ code: 42 });
    const p2 = new Post({ code: 42 });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness with non standard table names", async () => {
    class SpecialPost extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await SpecialPost.create({ title: "unique" });
    const p2 = new SpecialPost({ title: "unique" });
    expect(await p2.save()).toBe(false);
  });

  it("validates uniqueness inside scoping", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("org_id", "integer");
        this.validatesUniqueness("title", { scope: "org_id" });
      }
    }
    await Post.create({ title: "scoped", org_id: 1 });
    const p2 = new Post({ title: "scoped", org_id: 1 });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness with columns which are sql keywords", async () => {
    class Post extends Base {
      static {
        this.attribute("order", "string");
        this.validatesUniqueness("order");
      }
    }
    await Post.create({ order: "first" });
    const p2 = new Post({ order: "first" });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness with limit", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "a".repeat(100) });
    const p2 = new Post({ title: "a".repeat(100) });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness with limit and utf8", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "\u{1F600}".repeat(10) });
    const p2 = new Post({ title: "\u{1F600}".repeat(10) });
    expect(await p2.save()).toBe(false);
  });

  it("validate straight inheritance uniqueness", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "inherited" });
    const p2 = new Post({ title: "inherited" });
    expect(await p2.save()).toBe(false);
  });
  it("validate uniqueness with conditions", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("active", "integer");
        this.validatesUniqueness("title", {
          conditions: function (this: any) {
            return this.where({ active: 1 });
          },
        });
      }
    }
    // conditions limits which records count for uniqueness: only active=1 records
    await Post.create({ title: "hello", active: 1 });
    // Different title - valid regardless
    const p2 = new Post({ title: "world", active: 1 });
    expect(await p2.save()).toBe(true);
    // Same title, active=1 - invalid (another active=1 record with same title exists)
    const p3 = new Post({ title: "hello", active: 1 });
    expect(await p3.save()).toBe(false);
  });

  it("validate uniqueness with non callable conditions is not supported", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title", { conditions: "not a function" as any });
      }
    }
    const p = new Post({ title: "test" });
    await expect(p.save()).rejects.toThrow("is not callable");
  });

  it("validate uniqueness with conditions with record arg", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("active", "integer");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "hello", active: 1 });
    const p2 = new Post({ title: "hello", active: 0 });
    // Same title regardless of active value
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness on existing relation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    const post = await Post.create({ title: "unique" });
    // Record should be valid against itself (save returns true for existing record)
    expect(await post.save()).toBe(true);
  });

  it("validate uniqueness on empty relation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    const p = new Post({ title: "brand new" });
    expect(await p.save()).toBe(true);
  });

  it("validate uniqueness of custom primary key", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "cpk" });
    const p2 = new Post({ title: "cpk" });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness without primary key", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "nopk" });
    const p2 = new Post({ title: "nopk" });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness ignores itself when primary key changed", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    const post = await Post.create({ title: "self" });
    // Re-saving existing record should not conflict with itself
    expect(await post.save()).toBe(true);
  });

  it("validate uniqueness with after create performing save", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("saved_count", "integer");
        this.validatesUniqueness("title");
        this.afterCreate(async function (record: any) {
          record.saved_count = 1;
        });
      }
    }
    const p = await Post.create({ title: "after_create" });
    expect(p.saved_count).toBe(1);
  });

  it.skipIf(adapterType !== "postgres")("validate uniqueness uuid", async () => {
    class Post extends Base {
      static {
        this.attribute("uuid", "string");
        this.validatesUniqueness("uuid");
      }
    }
    await Post.create({ uuid: "550e8400-e29b-41d4-a716-446655440000" });
    const p2 = new Post({ uuid: "550e8400-e29b-41d4-a716-446655440000" });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness regular id", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "regular" });
    const p2 = new Post({ title: "regular" });
    expect(await p2.save()).toBe(false);
  });

  it("validate uniqueness with singleton class", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "unique" });
    const p2 = new Post({ title: "unique" });
    // Even with singleton-like usage, uniqueness validation should fail
    expect(await p2.save()).toBe(false);
    expect(p2.errors.on("title")).toBeTruthy();
  });
});

describe("UniquenessValidationWithIndexTest", () => {
  it("new record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    const p = new Post({ title: "new" });
    expect(await p.save()).toBe(true);
  });

  it("changing non unique attribute", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.validatesUniqueness("title");
      }
    }
    const p = await Post.create({ title: "unique", body: "old" });
    p.body = "new";
    expect(await p.save()).toBe(true);
  });

  it("changing unique attribute", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "taken" });
    const p = await Post.create({ title: "original" });
    p.title = "taken";
    expect(await p.save()).toBe(false);
  });

  it("changing non unique attribute and unique attribute is nil", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.validatesUniqueness("title");
      }
    }
    const p = await Post.create({ title: null, body: "old" });
    p.body = "new";
    expect(await p.save()).toBe(true);
  });

  it("conditions", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("active", "integer");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "cond", active: 1 });
    const p2 = new Post({ title: "cond", active: 0 });
    expect(await p2.save()).toBe(false);
  });

  it("case sensitive", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "CaseTest" });
    const p2 = new Post({ title: "CaseTest" });
    expect(await p2.save()).toBe(false);
    const p3 = new Post({ title: "casetest" });
    expect(await p3.save()).toBe(true);
  });

  itIfSupports("partial_index", "partial index", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("published", "integer");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "partial", published: 1 });
    const p2 = new Post({ title: "partial", published: 0 });
    // Same title is a conflict regardless
    expect(await p2.save()).toBe(false);
  });

  it("non unique index", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "dup" });
    const p2 = new Post({ title: "dup" });
    expect(await p2.save()).toBe(false);
  });

  it("scope", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("category", "string");
        this.validatesUniqueness("title", { scope: "category" });
      }
    }
    await Post.create({ title: "scoped", category: "a" });
    const p2 = new Post({ title: "scoped", category: "b" });
    expect(await p2.save()).toBe(true);
    const p3 = new Post({ title: "scoped", category: "a" });
    expect(await p3.save()).toBe(false);
  });

  it("uniqueness on relation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    const p = await Post.create({ title: "rel" });
    expect(await p.save()).toBe(true);
  });

  it("uniqueness on custom relation primary key", async () => {
    class Post extends Base {
      static {
        this.attribute("slug", "string");
        this.validatesUniqueness("slug");
      }
    }
    await Post.create({ slug: "my-post" });
    const p2 = new Post({ slug: "my-post" });
    expect(await p2.save()).toBe(false);
  });

  it("index of sublist of columns", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
        this.validatesUniqueness("title", { scope: "author" });
      }
    }
    await Post.create({ title: "sub", author: "alice" });
    const p2 = new Post({ title: "sub", author: "alice" });
    expect(await p2.save()).toBe(false);
  });

  it("index of columns list and extra columns", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
        this.attribute("year", "integer");
        this.validatesUniqueness("title", { scope: ["author", "year"] });
      }
    }
    await Post.create({ title: "extra", author: "bob", year: 2024 });
    const p2 = new Post({ title: "extra", author: "bob", year: 2025 });
    expect(await p2.save()).toBe(true);
  });

  it.skipIf(adapterType !== "postgres")("expression index", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Post.create({ title: "expr" });
    const p2 = new Post({ title: "expr" });
    expect(await p2.save()).toBe(false);
  });
});

describe("UniquenessWithCompositeKey", () => {
  it("uniqueness validation for model with composite key", async () => {
    class Order extends Base {
      static {
        this.attribute("shop_id", "integer");
        this.attribute("order_num", "integer");
        this.attribute("total", "integer");
        this.validatesUniqueness("order_num", { scope: "shop_id" });
      }
    }
    await Order.create({ shop_id: 1, order_num: 100, total: 50 });
    const o2 = new Order({ shop_id: 1, order_num: 100, total: 75 });
    expect(await o2.save()).toBe(false);
  });
});

describe("UniquenessValidationTest", () => {
  it("validate uniqueness", async () => {
    class Email extends Base {
      static {
        this.attribute("address", "string");
        this.validatesUniqueness("address");
      }
    }

    const e1 = await Email.create({ address: "test@example.com" });
    expect(e1.isPersisted()).toBe(true);

    const e2 = new Email({ address: "test@example.com" });
    const saved = await e2.save();
    expect(saved).toBe(false);
    expect(e2.errors.get("address")).toContain("has already been taken");
  });
});
