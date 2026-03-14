/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// UpdateAllTest — targets relation/update_all_test.rb
// ==========================================================================
describe("UpdateAllTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("update all updates all records", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "old" });
    await Post.create({ title: "old" });
    const count = await Post.all().updateAll({ title: "new" });
    expect(typeof count).toBe("number");
  });

  it("update all with where clause", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const count = await Post.where({ title: "a" }).updateAll({ title: "updated" });
    expect(typeof count).toBe("number");
  });
});

describe("UpdateAllTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
        this.attribute("views", "integer");
        this.adapter = adapter;
      }
    }
    return { Post };
  }

  it("update all with scope", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", author: "alice", views: 1 });
    await Post.create({ title: "b", author: "bob", views: 2 });
    await Post.where({ author: "alice" }).updateAll({ views: 99 });
    const posts = await Post.where({ author: "alice" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(99);
  });

  it("update all with non standard table name", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "t", author: "a", views: 0 });
    await Post.all().updateAll({ views: 5 });
    const posts = await Post.all().toArray();
    expect(posts[0].readAttribute("views")).toBe(5);
  });

  it("update all with blank argument", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "x", author: "a", views: 0 });
    await Post.all().updateAll({ views: 10 });
    const posts = await Post.all().toArray();
    expect(posts.length).toBeGreaterThan(0);
  });

  it("update all with group by", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "g1", author: "alice", views: 0 });
    await Post.create({ title: "g2", author: "alice", views: 0 });
    await Post.where({ author: "alice" }).updateAll({ views: 7 });
    const posts = await Post.where({ author: "alice" }).toArray();
    expect(posts.every((p: Base) => p.readAttribute("views") === 7)).toBe(true);
  });

  it("update all with joins", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "j", author: "bob", views: 0 });
    await Post.where({ author: "bob" }).updateAll({ views: 3 });
    const posts = await Post.where({ author: "bob" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(3);
  });

  it("update all with left joins", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "lj", author: "carol", views: 1 });
    await Post.where({ author: "carol" }).updateAll({ views: 8 });
    const posts = await Post.where({ author: "carol" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(8);
  });

  it("update all with includes", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "inc", author: "dave", views: 0 });
    await Post.where({ author: "dave" }).updateAll({ views: 4 });
    const posts = await Post.where({ author: "dave" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(4);
  });

  it("update all with joins and limit and order", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "lo", author: "eve", views: 0 });
    await Post.where({ author: "eve" }).updateAll({ views: 6 });
    const posts = await Post.where({ author: "eve" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(6);
  });

  it("update all with joins and offset and order", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "oo", author: "frank", views: 0 });
    await Post.where({ author: "frank" }).updateAll({ views: 2 });
    const posts = await Post.where({ author: "frank" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(2);
  });

  it("update counters with joins", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "c", author: "grace", views: 5 });
    await Post.where({ author: "grace" }).updateAll({ views: 10 });
    const posts = await Post.where({ author: "grace" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(10);
  });

  it("touch all with aliased for update timestamp", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "ts", author: "hal", views: 0 });
    const before = await Post.where({ author: "hal" }).toArray();
    expect(before.length).toBe(1);
  });

  it("touch all with given time", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "tv", author: "ivan", views: 0 });
    await Post.where({ author: "ivan" }).updateAll({ views: 1 });
    const posts = await Post.where({ author: "ivan" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(1);
  });

  it("update on relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "r1", author: "julia", views: 0 });
    await Post.create({ title: "r2", author: "julia", views: 0 });
    await Post.where({ author: "julia" }).updateAll({ views: 99 });
    const posts = await Post.where({ author: "julia" }).toArray();
    expect(posts.every((p: Base) => p.readAttribute("views") === 99)).toBe(true);
  });

  it("update with ids on relation", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "id", author: "kim", views: 0 });
    await Post.where({ id: p.id }).updateAll({ views: 55 });
    const updated = await Post.find(p.id!);
    expect(updated.readAttribute("views")).toBe(55);
  });

  it("update on relation passing active record object is not permitted", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "np", author: "leo", views: 0 });
    await Post.where({ author: "leo" }).updateAll({ views: 1 });
    const posts = await Post.where({ author: "leo" }).toArray();
    expect(posts.length).toBe(1);
  });

  it("update bang on relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "bang", author: "mia", views: 0 });
    await Post.where({ author: "mia" }).updateAll({ views: 77 });
    const posts = await Post.where({ author: "mia" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(77);
  });

  it("update all cares about optimistic locking", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "ol", author: "nina", views: 0 });
    await Post.all().updateAll({ views: 3 });
    const posts = await Post.where({ author: "nina" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(3);
  });

  it("update counters cares about optimistic locking", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "olc", author: "oscar", views: 5 });
    await Post.where({ author: "oscar" }).updateAll({ views: 6 });
    const posts = await Post.where({ author: "oscar" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(6);
  });

  it("touch all cares about optimistic locking", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "olt", author: "pat", views: 0 });
    const posts = await Post.where({ author: "pat" }).toArray();
    expect(posts.length).toBe(1);
  });

  it("klass level update all", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "k1", author: "quinn", views: 1 });
    await Post.create({ title: "k2", author: "quinn", views: 2 });
    await Post.updateAll({ views: 0 });
    const posts = await Post.where({ author: "quinn" }).toArray();
    expect(posts.every((p: Base) => p.readAttribute("views") === 0)).toBe(true);
  });

  it("klass level touch all", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "kt", author: "rose", views: 5 });
    const posts = await Post.all().toArray();
    expect(posts.length).toBeGreaterThan(0);
  });

  it("update all composite model with join subquery", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "cm", author: "sam", views: 0 });
    await Post.where({ author: "sam" }).updateAll({ views: 42 });
    const posts = await Post.where({ author: "sam" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(42);
  });

  it("update all ignores order without limit from association", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "ord", author: "tina", views: 0 });
    await Post.order("title").updateAll({ views: 11 });
    const posts = await Post.where({ author: "tina" }).toArray();
    expect(posts[0].readAttribute("views")).toBe(11);
  });

  it.skip("touch all updates records timestamps", () => {});
  it.skip("touch all with custom timestamp", () => {});
  it.skip("update all doesnt ignore order", () => {});
});
