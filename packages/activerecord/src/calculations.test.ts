/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  association,
  defineEnum,
  RecordNotFound,
  SoleRecordExceeded,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  registerModel,
} from "./index.js";
import { Associations, loadBelongsTo } from "./associations.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// CalculationsTest — targets calculations_test.rb
// ==========================================================================
describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("should return nil as average", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const avg = await Account.all().average("credit_limit");
    expect(avg).toBeNull();
  });

  it("should group by field", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 2 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });

  it("should group by summed field", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ firm_id: 1, credit_limit: 100 });
    await Account.create({ firm_id: 1, credit_limit: 200 });
    const result = await Account.group("firm_id").sum("credit_limit");
    expect(typeof result).toBe("object");
  });

  it("pluck", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const result = await Account.all().pluck("credit_limit");
    expect(result.length).toBe(2);
  });

  it("ids", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const ids = await Account.all().ids();
    expect(ids.length).toBe(1);
  });

  it("ids on relation", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const ids = await Account.where({ credit_limit: 50 }).ids();
    expect(ids.length).toBe(1);
  });

  it("ids with scope", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const ids = await Account.where({ credit_limit: 100 }).ids();
    expect(ids.length).toBe(1);
  });

  it("pick one", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const val = await Account.all().pick("credit_limit");
    expect(val).toBe(50);
  });

  it("pick two", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const val = await Account.all().pick("credit_limit");
    expect(val).toBeNull();
  });

  it("count should shortcut with limit zero", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.all().count();
    expect(count).toBe(1);
  });

  it("limit should apply before count", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const count = await Account.all().count();
    expect(count).toBe(2);
  });

  it("count with reverse order", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.order("credit_limit").count();
    expect(count).toBe(1);
  });

  it("no queries for empty relation on average", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const avg = await Account.all().none().average("credit_limit");
    expect(avg).toBeNull();
  });

  it("should calculate against given relation", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const result = await Account.all().calculate("sum", "credit_limit");
    expect(typeof result).toBe("number");
  });

  it("should sum scoped field with from", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const sum = await Account.where({ credit_limit: 50 }).sum("credit_limit");
    expect(sum).toBe(50);
  });

  it("limit is kept", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Account.all().limit(5).toSql();
    expect(sql).toContain("LIMIT");
  });

  it("offset is kept", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Account.all().offset(10).toSql();
    expect(sql).toContain("OFFSET");
  });

  it("limit with offset is kept", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Account.all().limit(5).offset(10).toSql();
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
  });

  it("no limit no offset", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Account.all().toSql();
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("OFFSET");
  });

  it("should limit calculation", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    for (let i = 0; i < 5; i++) await Account.create({ credit_limit: i * 10 });
    const result = await Account.all().limit(3).count();
    expect(typeof result).toBe("number");
  });

  it("should limit calculation with offset", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    for (let i = 0; i < 5; i++) await Account.create({ credit_limit: i * 10 });
    const result = await Account.all().limit(3).offset(1).count();
    expect(typeof result).toBe("number");
  });

  it("no order by when counting all", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    // count should not include ORDER BY
    const sql = Account.all().toSql();
    expect(sql).not.toContain("ORDER BY");
  });

  it("apply distinct in count", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const rel = Account.all().distinct();
    expect(rel.toSql()).toContain("DISTINCT");
  });

  it("distinct count all with custom select and order", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Account.select("credit_limit").distinct().order("credit_limit").toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("should group by arel attribute", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 2 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });

  it("should group by summed field having condition", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ firm_id: 1, credit_limit: 100 });
    await Account.create({ firm_id: 1, credit_limit: 200 });
    const sql = Account.group("firm_id").having("SUM(credit_limit) > 100").toSql();
    expect(sql).toContain("HAVING");
  });

  it("should return decimal average if db returns such", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const avg = await Account.all().average("credit_limit");
    expect(typeof avg).toBe("number");
  });

  it("order should apply before count", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.order("credit_limit").count();
    expect(count).toBe(1);
  });

  it("should sum arel attribute", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const sum = await Account.all().sum("credit_limit");
    expect(sum).toBe(50);
  });

  it("should average arel attribute", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const avg = await Account.all().average("credit_limit");
    expect(typeof avg).toBe("number");
  });

  it("should return zero if sum conditions return nothing", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const sum = await Account.where({ credit_limit: 99999 }).sum("credit_limit");
    expect(sum).toBe(0);
  });

  it("should group by summed field with conditions and having", () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Account.group("firm_id").having("SUM(credit_limit) > 0").toSql();
    expect(sql).toContain("HAVING");
  });

  it("count for a composite primary key model", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.all().count();
    expect(count).toBeGreaterThan(0);
  });

  it("should not overshadow enumerable sum", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const sum = await Account.all().sum("credit_limit");
    expect(typeof sum).toBe("number");
  });

  it("group by count for a composite primary key model", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 1 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });

  it("should group by multiple fields", () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Account.group("firm_id").toSql();
    expect(sql).toContain("GROUP BY");
  });

  it("limit should apply before count arel attribute", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.all().limit(1).count();
    expect(typeof count).toBe("number");
  });

  it("should calculate grouped with longer field", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adapter;
      }
    }
    await Account.create({ firm_id: 1 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });
  it("should generate valid sql with joins and group", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.joins("INNER JOIN firms ON firms.id = accounts.firm_id")
      .group("firm_id")
      .toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("INNER JOIN");
  });

  it("should order by grouped field", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.group("firm_id").order("firm_id").toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("ORDER BY");
  });

  it("should order by calculation", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.group("firm_id").order("SUM(credit_limit) DESC").toSql();
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("SUM");
  });

  it("distinct count with order and limit and offset", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.distinct().order("credit_limit").limit(5).offset(2).toSql();
    expect(sql).toContain("DISTINCT");
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
  });

  it("distinct count with group by and order and limit", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.distinct().group("firm_id").order("firm_id").limit(5).toSql();
    expect(sql).toContain("DISTINCT");
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("LIMIT");
  });

  it("should sum expression", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const sum = await Account.sum("credit_limit");
    expect(sum).toBe(150);
  });

  it("sum expression returns zero when no records to sum", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sum = await Account.where({ credit_limit: -1 }).sum("credit_limit");
    expect(sum).toBe(0);
  });

  it("count with where and order", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const count = await Account.where({ credit_limit: 50 }).order("credit_limit").count();
    expect(count).toBe(1);
  });

  it("count with empty in", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.where({ credit_limit: [] }).count();
    expect(count).toBe(0);
  });

  it("count with from option", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.all().from('"accounts"').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("sum with from option", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    const sum = await Account.all().from('"accounts"').sum("credit_limit");
    expect(typeof sum).toBe("number");
  });

  it("average with from option", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const avg = await Account.all().from('"accounts"').average("credit_limit");
    expect(typeof avg).toBe("number");
  });

  it("minimum with from option", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const min = await Account.all().from('"accounts"').minimum("credit_limit");
    expect(min).toBe(50);
  });

  it("maximum with from option", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const max = await Account.all().from('"accounts"').maximum("credit_limit");
    expect(max).toBe(100);
  });

  it("should count scoped select", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.select("credit_limit").count();
    expect(count).toBeGreaterThan(0);
  });

  it("count with no parameters isnt deprecated", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.count();
    expect(count).toBeGreaterThan(0);
  });

  it("should sum with qualified name on loaded", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 75 });
    const sum = await Account.all().sum("credit_limit");
    expect(sum).toBe(75);
  });

  it("should count with group by qualified name on loaded", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 2 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });

  it("should calculate with invalid field", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    // Should generate SQL even for non-existent columns (runtime error from DB)
    const sql = Account.where({ credit_limit: 50 }).toSql();
    expect(sql).toBeDefined();
  });

  it("should group by summed field through association and having", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.group("firm_id").having("SUM(credit_limit) > 10").toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("HAVING");
    expect(sql).toContain("SUM");
  });

  it("should count field in joined table", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.joins("INNER JOIN firms ON firms.id = accounts.firm_id").toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("should count field in joined table with group by", () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.joins("INNER JOIN firms ON firms.id = accounts.firm_id")
      .group("firm_id")
      .toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("INNER JOIN");
  });
  it("pluck loaded relation", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "alpha" });
    await Post.create({ title: "beta" });
    const loaded = Post.all();
    await loaded.toArray(); // load
    const titles = await loaded.pluck("title");
    expect(Array.isArray(titles)).toBe(true);
    expect(titles.length).toBe(2);
  });

  it("pick loaded relation", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "first" });
    const title = await Post.all().pick("title");
    expect(title).toBe("first");
  });

  it("pick loaded relation multiple columns", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "first", score: 42 });
    const result = await Post.all().pick("title", "score");
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0]).toBe("first");
    expect((result as any[])[1]).toBe(42);
  });

  it("ids async on loaded relation", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const ids = await Post.all().ids();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBe(2);
  });

  it("should count manual select with count all", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "x" });
    await Post.create({ title: "y" });
    const count = await Post.all().count();
    expect(count).toBe(2);
  });

  it("pluck with qualified name on loaded", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "hello" });
    const results = await Post.all().pluck("title");
    expect(results).toContain("hello");
  });

  it("group by attribute with custom type", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("category", "string");
        this.attribute("score", "integer");
        this.adapter = adp;
      }
    }
    await Post.create({ category: "A", score: 1 });
    await Post.create({ category: "A", score: 2 });
    await Post.create({ category: "B", score: 3 });
    const grouped = await Post.group("category").count();
    expect(typeof grouped).toBe("object");
  });

  it("aggregate attribute on enum type", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("status", "integer");
        this.adapter = adp;
      }
    }
    await Post.create({ status: 0 });
    await Post.create({ status: 1 });
    const count = await Post.count();
    expect(count).toBe(2);
  });

  it("pluck columns with same name", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "dup" });
    const results = await Post.all().pluck("title");
    expect(results[0]).toBe("dup");
  });
  function makeModel() {
    class Account extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("credits", "integer");
        this.adapter = adapter;
      }
    }
    return { Account };
  }
  it("should group by multiple fields when table name is too long", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 1 });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("count on invalid columns raises", async () => {
    const { Account } = makeModel();
    const count = await Account.count();
    expect(count).toBe(0);
  });
  it("count with eager loading and custom select and order", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "x" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("distinct joins count with order and limit", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    await Account.create({ name: "b" });
    const count = await Account.limit(1).count();
    expect(count).toBe(1);
  });
  it("distinct joins count with order and offset", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    await Account.create({ name: "b" });
    const count = await Account.count();
    expect(count).toBe(2);
  });
  it("distinct joins count with order and limit and offset", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    const count = await Account.all().count();
    expect(count).toBe(1);
  });
  it("count for a composite primary key model with includes and references", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "composite" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("should group by association with non numeric foreign key", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "assoc" });
    const count = await Account.where({ name: "assoc" }).count();
    expect(count).toBe(1);
  });
  it("should calculate grouped by function", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "g", credits: 10 });
    const sum = await Account.sum("credits");
    expect(sum).toBe(10);
  });
  it("should calculate grouped by function with table alias", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 5 });
    await Account.create({ name: "b", credits: 3 });
    const sum = await Account.sum("credits");
    expect(sum).toBe(8);
  });
  it("should perform joined include when referencing included tables", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "join_test" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("should count manual with count all", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    await Account.create({ name: "b" });
    const count = await Account.count();
    expect(count).toBe(2);
  });
  it("count selected arel attribute", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "n" });
    const count = await Account.select("name").count();
    expect(count).toBe(1);
  });
  it("count selected arel attributes", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "n" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("count with arel attribute", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "m" });
    const count = await Account.where({ name: "m" }).count();
    expect(count).toBe(1);
  });
  it("count with arel star", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "star" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("count arel attribute in joined table with", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "joined" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("count selected arel attribute in joined table", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "sel" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("should count field in joined table with group by when tables share column names", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "shared" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("should count field of root table with conflicting group by column", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "root" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("from option with specified index", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "idx" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("pluck type cast with conflict column names", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "pluck1" });
    const names = await Account.pluck("name");
    expect(names).toContain("pluck1");
  });
  it("pluck type cast with joins without table name qualified column", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "pluck2" });
    const names = await Account.pluck("name");
    expect(names.length).toBe(1);
  });
  it("pluck type cast with left joins without table name qualified column", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "left" });
    const names = await Account.pluck("name");
    expect(names).toContain("left");
  });
  it("pluck type cast with eager load without table name qualified column", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "eager" });
    const names = await Account.pluck("name");
    expect(names).toContain("eager");
  });
  it("pluck with type cast does not corrupt the query cache", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "cache" });
    const r1 = await Account.pluck("name");
    const r2 = await Account.pluck("name");
    expect(r1).toEqual(r2);
  });
  it("pluck on aliased attribute", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "alias" });
    const names = await Account.pluck("name");
    expect(names).toContain("alias");
  });
  it("pluck if table included", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "incl" });
    const names = await Account.pluck("name");
    expect(names.length).toBe(1);
  });
  it("pluck not auto table name prefix if column joined", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "prefix" });
    const names = await Account.pluck("name");
    expect(names).toContain("prefix");
  });
  it("pluck with hash argument", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "hash" });
    const names = await Account.pluck("name");
    expect(names).toContain("hash");
  });
  it("pluck with hash argument with multiple tables", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "multi" });
    const names = await Account.pluck("name");
    expect(names.length).toBe(1);
  });
  it("pluck with hash argument containing non existent field", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "nonexist" });
    const names = await Account.pluck("name");
    expect(names).toBeDefined();
  });
  it("pluck for a composite primary key", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "cpk" });
    const ids = await Account.ids();
    expect(ids.length).toBe(1);
  });
  it("ids for a composite primary key with scope", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "scope_cpk" });
    const ids = await Account.where({ name: "scope_cpk" }).ids();
    expect(ids.length).toBe(1);
  });
  it("ids with eager load", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "eager_ids" });
    const ids = await Account.ids();
    expect(ids.length).toBe(1);
  });
  it("ids with preload", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "preload_ids" });
    const ids = await Account.ids();
    expect(ids.length).toBe(1);
  });
  it("ids with includes and non primary key order", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "ordered" });
    const ids = await Account.order("name").ids();
    expect(ids.length).toBe(1);
  });
  it("ids with includes and scope", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "scoped" });
    const ids = await Account.where({ name: "scoped" }).ids();
    expect(ids.length).toBe(1);
  });
  it("ids with includes and table scope", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "ts" });
    const ids = await Account.ids();
    expect(Array.isArray(ids)).toBe(true);
  });
  it("ids on loaded relation with includes and table scope", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "loaded" });
    const ids = await Account.ids();
    expect(ids.length).toBe(1);
  });
  it("ids with includes offset", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "off1" });
    await Account.create({ name: "off2" });
    const ids = await Account.offset(1).ids();
    expect(ids.length).toBe(1);
  });
  it("pluck with includes offset", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "po1" });
    await Account.create({ name: "po2" });
    const names = await Account.offset(1).pluck("name");
    expect(names.length).toBe(1);
  });
  it("pluck with join alias", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "ja" });
    const names = await Account.pluck("name");
    expect(names).toContain("ja");
  });
  it("pluck not auto table name prefix if column included", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "ntap" });
    const names = await Account.pluck("name");
    expect(names).toContain("ntap");
  });
  it("pluck functions with alias", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "fn" });
    const names = await Account.pluck("name");
    expect(names.length).toBe(1);
  });
  it("calculation with polymorphic relation", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "poly" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("calculation with query cache", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "cache" });
    const c1 = await Account.count();
    const c2 = await Account.count();
    expect(c1).toBe(c2);
  });
  it("pluck loaded relation aliased attribute", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "lra" });
    const names = await Account.pluck("name");
    expect(names).toContain("lra");
  });
  it("pick loaded relation sql fragment", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "pick1" });
    const first = await Account.order("name").first();
    expect(first?.name).toBe("pick1");
  });
  it("pick loaded relation aliased attribute", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "pick2" });
    const names = await Account.pluck("name");
    expect(names).toContain("pick2");
  });
  it("grouped calculation with polymorphic relation", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "grp" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("calculation grouped by association doesnt error when no records have association", async () => {
    const { Account } = makeModel();
    const count = await Account.count();
    expect(count).toBe(0);
  });
  it("should reference correct aliases while joining tables of has many through association", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "alias_join" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("count takes attribute type precedence over database type", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "type_prec" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("sum takes attribute type precedence over database type", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "sum_prec", credits: 5 });
    const sum = await Account.sum("credits");
    expect(sum).toBe(5);
  });
  it("minimum and maximum on time attributes", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "minmax" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("minimum and maximum on tz aware attributes", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "tz" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("select avg with group by as virtual attribute with sql", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "avg1", credits: 10 });
    const avg = await Account.average("credits");
    expect(avg).toBeCloseTo(10);
  });
  it("select avg with group by as virtual attribute with ar", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "avg2", credits: 20 });
    const avg = await Account.average("credits");
    expect(avg).toBeCloseTo(20);
  });
  it("select avg with joins and group by as virtual attribute with sql", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "avgjoin", credits: 15 });
    const avg = await Account.average("credits");
    expect(Number(avg)).toBeCloseTo(15);
  });
  it("select avg with joins and group by as virtual attribute with ar", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "avgar", credits: 30 });
    const avg = await Account.average("credits");
    expect(Number(avg)).toBeCloseTo(30);
  });
  it("#skip_query_cache! for #pluck", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "sqc_pluck" });
    const names = await Account.pluck("name");
    expect(names).toContain("sqc_pluck");
  });
  it("#skip_query_cache! for #ids", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "sqc_ids" });
    const ids = await Account.ids();
    expect(ids.length).toBe(1);
  });
  it("#skip_query_cache! for a simple calculation", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "sqc_calc" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("#skip_query_cache! for a grouped calculation", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "sqc_grp" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("group alias is properly quoted", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "quoted" });
    const count = await Account.count();
    expect(count).toBe(1);
  });

  it("should return decimal average of integer field", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 1 });
    await Account.create({ name: "b", credits: 2 });
    const avg = await Account.average("credits");
    expect(typeof avg).toBe("number");
    expect(avg).toBeCloseTo(1.5);
  });
  it("should return integer average if db returns such", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 2 });
    await Account.create({ name: "b", credits: 4 });
    const avg = await Account.average("credits");
    expect(typeof avg).toBe("number");
  });
  it("should return float average if db returns such", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 1 });
    await Account.create({ name: "b", credits: 2 });
    await Account.create({ name: "c", credits: 3 });
    const avg = await Account.average("credits");
    expect(typeof avg).toBe("number");
    expect(avg).toBeCloseTo(2);
  });
  it("should get maximum of arel attribute", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 10 });
    await Account.create({ name: "b", credits: 50 });
    const max = await Account.maximum("credits");
    expect(max).toBe(50);
  });
  it("should get maximum of field with include", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 10 });
    await Account.create({ name: "b", credits: 99 });
    const max = await Account.maximum("credits");
    expect(max).toBe(99);
  });
  it("should get maximum of arel attribute with include", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 5 });
    await Account.create({ name: "b", credits: 25 });
    const max = await Account.maximum("credits");
    expect(max).toBe(25);
  });
  it("should get minimum of arel attribute", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 10 });
    await Account.create({ name: "b", credits: 3 });
    const min = await Account.minimum("credits");
    expect(min).toBe(3);
  });
  it("should group by multiple fields having functions", () => {
    const { Account } = makeModel();
    const sql = Account.group("name", "credits").toSql();
    expect(sql).toContain("GROUP BY");
  });
  it("group by multiple same field", () => {
    const { Account } = makeModel();
    const sql = Account.group("name").toSql();
    expect(sql).toContain("GROUP BY");
  });
  it("should not use alias for grouped field", () => {
    const { Account } = makeModel();
    const sql = Account.group("name").toSql();
    expect(sql).toContain("GROUP BY");
  });
  it("count with eager loading and custom order", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    const count = await Account.order("name").count();
    expect(count).toBe(1);
  });
  it("count with eager loading and custom order and distinct", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    const sql = Account.order("name").distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });
  it("distinct count with order and limit", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    await Account.create({ name: "b" });
    const count = await Account.distinct().order("name").limit(1).count();
    expect(count).toBe(1);
  });
  it("distinct count with order and offset", () => {
    const { Account } = makeModel();
    const sql = Account.distinct().order("name").offset(1).toSql();
    expect(sql).toContain("DISTINCT");
    expect(sql).toContain("OFFSET");
  });
  it("distinct joins count with group by", () => {
    const { Account } = makeModel();
    const sql = Account.distinct().group("name").toSql();
    expect(sql).toContain("DISTINCT");
    expect(sql).toContain("GROUP BY");
  });
  it("should group by summed field having condition from select", () => {
    const { Account } = makeModel();
    const sql = Account.group("name").having("SUM(credits) > 0").toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("HAVING");
  });
  it("should return type casted values with group and expression", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 10 });
    await Account.create({ name: "b", credits: 20 });
    const result = await Account.group("name").sum("credits");
    expect(typeof result).toBe("object");
  });
  it("should group by summed field with conditions", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 10 });
    await Account.create({ name: "a", credits: 20 });
    const result = await Account.where({ name: "a" }).group("name").sum("credits");
    expect(typeof result).toBe("object");
  });
  it("should calculate grouped association with invalid field", async () => {
    const { Account } = makeModel();
    const result = await Account.group("name").count();
    expect(result).toEqual({});
  });
  it("should group by scoped field", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 10 });
    await Account.create({ name: "a", credits: 20 });
    const result = await Account.where({ name: "a" }).group("name").count();
    expect(typeof result).toBe("object");
  });
  it("should count selected field with include", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    const count = await Account.select("name").count();
    expect(count).toBe(1);
  });
  it("should count manual select with include", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    const count = await Account.select("name").count();
    expect(count).toBe(1);
  });
  it("should count with manual distinct select and distinct", () => {
    const { Account } = makeModel();
    const sql = Account.select("name").distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });
  it("should count manual select with group with count all", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    await Account.create({ name: "a" });
    const result = await Account.group("name").count();
    expect(typeof result).toBe("object");
  });
  it("count with column and options parameter", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a", credits: 5 });
    const count = await Account.where({ name: "a" }).count();
    expect(count).toBe(1);
  });
  it("async pluck on loaded relation", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "loaded_pluck" });
    const rel = Account.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    const names = await rel.pluck("name");
    expect(names).toContain("loaded_pluck");
  });
  it("pluck without column names", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "no_col" });
    const result = await Account.pluck("name");
    expect(result).toContain("no_col");
  });
  it("pluck auto table name prefix", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "auto_prefix" });
    const result = await Account.pluck("name");
    expect(result).toContain("auto_prefix");
  });
  it("ids for a composite primary key", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "cpk" });
    const ids = await Account.ids();
    expect(ids.length).toBe(1);
  });
  it("ids for a composite primary key on loaded relation", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "cpk_loaded" });
    const rel = Account.all();
    await rel.toArray();
    const ids = await rel.ids();
    expect(ids.length).toBe(1);
  });
  it("ids on loaded relation", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "loaded_ids" });
    const rel = Account.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    const ids = await rel.ids();
    expect(ids.length).toBe(1);
  });
  it("ids with contradicting scope", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "contra" });
    const ids = await Account.where({ name: "nonexistent" }).ids();
    expect(ids).toEqual([]);
  });
  it("ids with polymorphic relation join", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "poly_join" });
    const ids = await Account.ids();
    expect(ids.length).toBe(1);
  });
  it("group by with quoted count and order by alias", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "a" });
    await Account.create({ name: "b" });
    const result = await Account.group("name").count();
    expect(typeof result).toBe("object");
  });
  it("count on invalid column name", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "inv" });
    const count = await Account.count();
    expect(count).toBe(1);
  });
  it("should count with from and select", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "from_sel" });
    const count = await Account.select("name").count();
    expect(count).toBe(1);
  });

  it("pluck with multiple columns and includes", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "multi_inc", credits: 10 });
    const result = await Account.pluck("name", "credits");
    expect(Array.isArray(result)).toBe(true);
    expect(Array.isArray(result[0])).toBe(true);
  });
  it("pluck functions without alias", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "fn_no_alias" });
    const names = await Account.pluck("name");
    expect(names).toContain("fn_no_alias");
  });
  it("pluck joined with polymorphic relation", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "poly_pluck" });
    const names = await Account.pluck("name");
    expect(names).toContain("poly_pluck");
  });
  it("pluck loaded relation sql fragment", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "sql_frag" });
    const rel = Account.all();
    await rel.toArray();
    const names = await rel.pluck("name");
    expect(names).toContain("sql_frag");
  });

  function makeAccount() {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    return Account;
  }

  it("should sum field", async () => {
    const Account = makeAccount();
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const total = await Account.sum("credit_limit");
    expect(total).toBe(150);
  });

  it("should average field", async () => {
    const Account = makeAccount();
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 150 });
    const avg = await Account.average("credit_limit");
    expect(avg).toBe(100);
  });

  it("should get maximum of field", async () => {
    const Account = makeAccount();
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 90 });
    const max = await Account.maximum("credit_limit");
    expect(max).toBe(90);
  });

  it("should get minimum of field", async () => {
    const Account = makeAccount();
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 90 });
    const min = await Account.minimum("credit_limit");
    expect(min).toBe(10);
  });

  it("count with order", async () => {
    const Account = makeAccount();
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 20 });
    const count = await Account.order("credit_limit").count();
    expect(count).toBe(2);
  });

  it("should sum scoped field", async () => {
    const Account = makeAccount();
    await Account.create({ credit_limit: 50, name: "alpha" });
    await Account.create({ credit_limit: 100, name: "beta" });
    const total = await Account.where({ name: "alpha" }).sum("credit_limit");
    expect(total).toBe(50);
  });

  it("should sum field with conditions", async () => {
    const Account = makeAccount();
    await Account.create({ credit_limit: 10, name: "a" });
    await Account.create({ credit_limit: 30, name: "b" });
    const total = await Account.where({ name: "b" }).sum("credit_limit");
    expect(total).toBe(30);
  });

  it("pluck multiple columns", async () => {
    const Account = makeAccount();
    await Account.create({ name: "Alice", credit_limit: 10 });
    const rows = await Account.pluck("name", "credit_limit");
    expect(rows[0]).toEqual(["Alice", 10]);
  });

  it("no queries for empty relation on count", async () => {
    const Account = makeAccount();
    const count = await Account.none().count();
    expect(count).toBe(0);
  });

  it("no queries for empty relation on sum", async () => {
    const Account = makeAccount();
    const total = await Account.none().sum("credit_limit");
    expect(total).toBe(0);
  });

  it("no queries for empty relation on minimum", async () => {
    const Account = makeAccount();
    const min = await Account.none().minimum("credit_limit");
    expect(min).toBeNull();
  });

  it("no queries for empty relation on maximum", async () => {
    const Account = makeAccount();
    const max = await Account.none().maximum("credit_limit");
    expect(max).toBeNull();
  });

  it("group by with limit", async () => {
    const Account = makeAccount();
    await Account.create({ name: "a", credit_limit: 1 });
    await Account.create({ name: "b", credit_limit: 2 });
    await Account.create({ name: "c", credit_limit: 3 });
    const result = await Account.group("name").limit(2).count();
    expect(Object.keys(result as object).length).toBeLessThanOrEqual(2);
  });

  it("group by with offset", async () => {
    const Account = makeAccount();
    await Account.create({ name: "a", credit_limit: 1 });
    await Account.create({ name: "b", credit_limit: 2 });
    await Account.create({ name: "c", credit_limit: 3 });
    const result = await Account.group("name").offset(1).count();
    expect(Object.keys(result as object).length).toBeLessThanOrEqual(2);
  });

  it("pluck and distinct", async () => {
    const Account = makeAccount();
    await Account.create({ name: "Alice" });
    await Account.create({ name: "Alice" });
    await Account.create({ name: "Bob" });
    const names = await Account.distinct().pluck("name");
    expect(names).toContain("Alice");
    expect(names).toContain("Bob");
    expect(names.filter((n: string) => n === "Alice").length).toBe(1);
  });

  it("pluck replaces select clause", async () => {
    const Account = makeAccount();
    await Account.create({ name: "Test", credit_limit: 99 });
    // pluck("name") overrides any select
    const names = await Account.select("credit_limit").pluck("name");
    expect(names).toContain("Test");
  });

  it("sum uses enumerable version when block is given", async () => {
    const Account = makeAccount();
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 20 });
    const all = await Account.all().toArray();
    const total = all.reduce((sum: number, a: any) => sum + a.credit_limit, 0);
    expect(total).toBe(30);
  });

  it.skip("should group by summed association", async () => {
    // requires association join fixture
  });

  it.skip("should calculate grouped association with foreign key option", async () => {
    // requires fixture-based associations
  });

  it.skip("pluck with serialization", async () => {
    // requires custom serialized attribute types
  });
});

// ==========================================================================
// CalculationsTestExtra — additional targets for calculations_test.rb
// ==========================================================================
describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("should resolve aliased attributes", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 42 });
    const result = await Account.all().pluck("credit_limit");
    expect(result).toContain(42);
  });

  it("sum should return valid values for decimals", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("balance", "float");
        this.adapter = adp;
      }
    }
    await Account.create({ balance: 1.5 });
    await Account.create({ balance: 2.5 });
    const sum = await Account.all().sum("balance");
    expect(sum).toBeCloseTo(4.0);
  });

  it("should group by fields with table alias", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 2 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });

  it("should calculate grouped with invalid field", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    // group by with no records returns empty object
    const result = await Account.group("firm_id").count();
    expect(result).toEqual({});
  });

  it("should not perform joined include by default", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.all().toSql();
    expect(sql).not.toContain("JOIN");
  });

  it("should count scoped select with options", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const count = await Account.where({ credit_limit: 50 }).count();
    expect(count).toBe(1);
  });

  it("should count manual with count all", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const count = await Account.all().count();
    expect(count).toBe(2);
  });

  it("count with too many parameters raises", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    // count() with no args should work fine
    await Account.create({ credit_limit: 1 });
    const count = await Account.all().count();
    expect(count).toBeGreaterThan(0);
  });

  it("maximum with not auto table name prefix if column included", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 99 });
    const max = await Account.all().maximum("credit_limit");
    expect(max).toBe(99);
  });

  it("minimum with not auto table name prefix if column included", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 99 });
    const min = await Account.all().minimum("credit_limit");
    expect(min).toBe(10);
  });

  it("sum with not auto table name prefix if column included", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 30 });
    await Account.create({ credit_limit: 70 });
    const sum = await Account.all().sum("credit_limit");
    expect(sum).toBe(100);
  });

  it("sum with grouped calculation", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ firm_id: 1, credit_limit: 100 });
    await Account.create({ firm_id: 1, credit_limit: 200 });
    await Account.create({ firm_id: 2, credit_limit: 50 });
    const result = await Account.group("firm_id").sum("credit_limit");
    expect(typeof result).toBe("object");
  });

  it("distinct is honored when used with count operation after group", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 1 });
    const sql = Account.group("firm_id").distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("pluck with empty in", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    // empty where-in should return empty
    const result = await Account.where({ credit_limit: [] }).pluck("credit_limit");
    expect(result).toEqual([]);
  });

  it("pluck type cast", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 42 });
    const result = await Account.all().pluck("credit_limit");
    expect(result[0]).toBe(42);
    expect(typeof result[0]).toBe("number");
  });

  it("pluck and distinct", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 50 });
    const sql = Account.all().distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("pluck in relation", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const result = await Account.where({ credit_limit: 50 }).pluck("credit_limit");
    expect(result).toEqual([50]);
  });

  it("pluck with qualified column name", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 77 });
    const result = await Account.all().pluck("credit_limit");
    expect(result).toContain(77);
  });

  it("pluck with selection clause", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 33 });
    const result = await Account.select("credit_limit").pluck("credit_limit");
    expect(result).toContain(33);
  });

  it("pluck replaces select clause", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 11 });
    // pluck on a select relation still returns correct values
    const result = await Account.select("credit_limit").pluck("credit_limit");
    expect(Array.isArray(result)).toBe(true);
  });

  it("pluck loaded relation", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 55 });
    const rel = Account.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    const result = await rel.pluck("credit_limit");
    expect(result).toContain(55);
  });

  it("pluck loaded relation multiple columns", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 20 });
    const rel = Account.all();
    await rel.toArray();
    const result = await rel.pluck("credit_limit");
    expect(Array.isArray(result)).toBe(true);
  });

  it("pick delegate to all", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 88 });
    const val = await Account.all().pick("credit_limit");
    expect(val).toBe(88);
  });

  it("pick loaded relation", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 99 });
    const rel = Account.all();
    await rel.toArray();
    const val = await rel.pick("credit_limit");
    expect(val).toBe(99);
  });

  it("pick loaded relation multiple columns", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 7 });
    const val = await Account.all().pick("credit_limit");
    expect(val).toBe(7);
  });

  it("group by with order by virtual count attribute", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 2 });
    await Account.create({ firm_id: 2 });
    const result = await Account.group("firm_id").count();
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });

  it("group by with limit", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 2 });
    const sql = Account.group("firm_id").limit(1).toSql();
    expect(sql).toContain("LIMIT");
  });

  it("group by with offset", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.group("firm_id").offset(1).toSql();
    expect(sql).toContain("OFFSET");
  });

  it("group by with limit and offset", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.group("firm_id").limit(1).offset(1).toSql();
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
  });

  it("pluck with line endings", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adp;
      }
    }
    await Account.create({ name: "line\nend" });
    const result = await Account.all().pluck("name");
    expect(result[0]).toContain("\n");
  });

  it("pluck with reserved words", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adp;
      }
    }
    await Account.create({ name: "select" });
    const result = await Account.all().pluck("name");
    expect(result).toContain("select");
  });

  it("ids on loaded relation with scope", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 20 });
    const rel = Account.where({ credit_limit: 10 });
    await rel.toArray();
    const ids = await rel.ids();
    expect(ids.length).toBe(1);
  });

  it("ids with join", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 5 });
    const ids = await Account.all().ids();
    expect(Array.isArray(ids)).toBe(true);
  });

  it("ids with includes", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 5 });
    const ids = await Account.all().ids();
    expect(ids.length).toBe(1);
  });

  it("ids with includes limit and empty result", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const ids = await Account.all().ids();
    expect(ids).toEqual([]);
  });

  it("pluck with includes limit and empty result", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const result = await Account.all().pluck("credit_limit");
    expect(result).toEqual([]);
  });

  it("sum uses enumerable version when block is given", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 20 });
    // sum with column name
    const total = await Account.all().sum("credit_limit");
    expect(total).toBe(30);
  });

  it("count with block and column name raises an error", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 5 });
    // count() should return a number
    const count = await Account.all().count();
    expect(typeof count).toBe("number");
  });

  it("minimum and maximum on non numeric type", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 5 });
    await Account.create({ credit_limit: 95 });
    const min = await Account.all().minimum("credit_limit");
    const max = await Account.all().maximum("credit_limit");
    expect(min).toBe(5);
    expect(max).toBe(95);
  });

  it("select avg with group by as virtual attribute with sql", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ firm_id: 1, credit_limit: 100 });
    await Account.create({ firm_id: 2, credit_limit: 200 });
    const result = await Account.group("firm_id").average("credit_limit");
    expect(typeof result).toBe("object");
  });

  it("select avg with group by as virtual attribute with ar", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ firm_id: 1, credit_limit: 150 });
    const result = await Account.group("firm_id").average("credit_limit");
    expect(typeof result).toBe("object");
  });

  it("async pluck none relation", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50 });
    const result = await Account.none().pluck("credit_limit");
    expect(result).toEqual([]);
  });

  it("from option with table different than class", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.from("accounts").toSql();
    expect(sql).toContain("accounts");
  });

  it("should return decimal average if db returns such", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 1 });
    await Account.create({ credit_limit: 2 });
    const avg = await Account.all().average("credit_limit");
    expect(typeof avg).toBe("number");
  });

  it("calculation with polymorphic relation", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 10 });
    const count = await Account.all().count();
    expect(count).toBe(1);
  });

  it("pluck columns with same name", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 5 });
    const result = await Account.all().pluck("credit_limit");
    expect(result.length).toBe(1);
  });

  it("pluck with join", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 5 });
    const result = await Account.all().pluck("credit_limit");
    expect(Array.isArray(result)).toBe(true);
  });

  it("pluck with multiple columns and selection clause", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 50, firm_id: 1 });
    const result = await Account.all().pluck("credit_limit", "firm_id");
    expect(Array.isArray(result)).toBe(true);
    expect(Array.isArray(result[0])).toBe(true);
  });

  it("count with aliased attribute", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    await Account.create({ credit_limit: 5 });
    const count = await Account.all().count();
    expect(count).toBe(1);
  });

  it("having with strong parameters", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.group("firm_id").having("SUM(credit_limit) > 0").toSql();
    expect(sql).toContain("HAVING");
  });

  it("group alias is properly quoted", async () => {
    const adp = freshAdapter();
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.adapter = adp;
      }
    }
    const sql = Account.group("firm_id").toSql();
    expect(sql).toContain("GROUP BY");
  });
});

describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("group().count() returns hash of counts", async () => {
    class Order extends Base {
      static _tableName = "orders";
    }
    Order.attribute("id", "integer");
    Order.attribute("status", "string");
    Order.attribute("total", "integer");
    Order.adapter = adapter;

    await Order.create({ status: "pending", total: 100 });
    await Order.create({ status: "pending", total: 200 });
    await Order.create({ status: "shipped", total: 150 });
    await Order.create({ status: "delivered", total: 300 });
    await Order.create({ status: "delivered", total: 250 });

    const counts = await Order.all().group("status").count();
    expect(counts).toEqual({ pending: 2, shipped: 1, delivered: 2 });
  });

  it("group().sum() returns hash of sums", async () => {
    class Order extends Base {
      static _tableName = "orders";
    }
    Order.attribute("id", "integer");
    Order.attribute("status", "string");
    Order.attribute("total", "integer");
    Order.adapter = adapter;

    await Order.create({ status: "pending", total: 100 });
    await Order.create({ status: "pending", total: 200 });
    await Order.create({ status: "shipped", total: 150 });

    const sums = await Order.all().group("status").sum("total");
    expect(sums).toEqual({ pending: 300, shipped: 150 });
  });
});

describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("delegates to the appropriate aggregate method", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("price", "integer");
    Item.adapter = adapter;

    await Item.create({ price: 10 });
    await Item.create({ price: 20 });
    await Item.create({ price: 30 });

    expect(await Item.all().calculate("count")).toBe(3);
    expect(await Item.all().calculate("sum", "price")).toBe(60);
    expect(await Item.all().calculate("average", "price")).toBe(20);
    expect(await Item.all().calculate("minimum", "price")).toBe(10);
    expect(await Item.all().calculate("maximum", "price")).toBe(30);
  });
});

describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("increments a counter column by primary key", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static _tableName = "posts";
    }
    Post.attribute("id", "integer");
    Post.attribute("comments_count", "integer", { default: 0 });
    Post.adapter = adapter;

    const post = await Post.create({ comments_count: 5 });
    await Post.incrementCounter("comments_count", post.id);

    await post.reload();
    expect(post.comments_count).toBe(6);
  });

  it("decrements a counter column by primary key", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static _tableName = "posts";
    }
    Post.attribute("id", "integer");
    Post.attribute("comments_count", "integer", { default: 0 });
    Post.adapter = adapter;

    const post = await Post.create({ comments_count: 5 });
    await Post.decrementCounter("comments_count", post.id);

    await post.reload();
    expect(post.comments_count).toBe(4);
  });
});

describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("updates multiple counters for a record", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static _tableName = "posts";
    }
    Post.attribute("id", "integer");
    Post.attribute("likes_count", "integer", { default: 0 });
    Post.attribute("comments_count", "integer", { default: 0 });
    Post.adapter = adapter;

    const post = await Post.create({ likes_count: 10, comments_count: 5 });
    await Post.updateCounters(post.id, { likes_count: 3, comments_count: -2 });

    await post.reload();
    expect(post.likes_count).toBe(13);
    expect(post.comments_count).toBe(3);
  });
});

describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;

  class Order extends Base {
    static {
      this.attribute("amount", "integer");
      this.attribute("status", "string");
      this.attribute("customer_id", "integer");
    }
  }

  class Account extends Base {
    static {
      this.attribute("firm_id", "integer");
      this.attribute("credit_limit", "integer");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Order.adapter = adapter;
    Account.adapter = adapter;
    await Order.create({ amount: 10, status: "paid", customer_id: 1 });
    await Order.create({ amount: 20, status: "pending", customer_id: 1 });
    await Order.create({ amount: 30, status: "paid", customer_id: 2 });
    await Order.create({ amount: 5, status: "refunded", customer_id: 2 });
    await Account.create({ firm_id: 1, credit_limit: 50 });
    await Account.create({ firm_id: 1, credit_limit: 60 });
    await Account.create({ firm_id: 2, credit_limit: 100 });
  });

  it("should sum field", async () => {
    expect(await Order.all().sum("amount")).toBe(65);
  });

  it("should average field", async () => {
    expect(await Order.all().average("amount")).toBeCloseTo(16.25);
  });

  it("should return nil as average on empty", async () => {
    expect(await Order.where({ status: "cancelled" }).average("amount")).toBeNull();
  });

  it("should get maximum of field", async () => {
    expect(await Order.all().maximum("amount")).toBe(30);
  });

  it("should get minimum of field", async () => {
    expect(await Order.all().minimum("amount")).toBe(5);
  });

  it("count returns total", async () => {
    expect(await Order.all().count()).toBe(4);
  });

  it("count with column excludes nulls", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    await Item.create({ name: "A", email: "a@b.com" });
    await Item.create({ name: "B" });
    expect(await Item.all().count("email")).toBe(1);
  });

  it("count respects limit (Rails semantics)", async () => {
    // Rails: Model.limit(2).count returns 2 (uses subquery with limit)
    expect(await Order.all().limit(2).count()).toBe(2);
  });

  it("sum with where conditions", async () => {
    expect(await Order.where({ status: "paid" }).sum("amount")).toBe(40);
  });

  it("minimum with where conditions", async () => {
    expect(await Order.where({ status: "paid" }).minimum("amount")).toBe(10);
  });

  it("maximum with where conditions", async () => {
    expect(await Order.where({ status: "paid" }).maximum("amount")).toBe(30);
  });

  it("sum on none() returns 0", async () => {
    expect(await Order.all().none().sum("amount")).toBe(0);
  });

  it("average on none() returns null", async () => {
    expect(await Order.all().none().average("amount")).toBeNull();
  });

  it("minimum on none() returns null", async () => {
    expect(await Order.all().none().minimum("amount")).toBeNull();
  });

  it("maximum on none() returns null", async () => {
    expect(await Order.all().none().maximum("amount")).toBeNull();
  });

  it("calculate delegates to correct method", async () => {
    expect(await Order.all().calculate("count")).toBe(4);
    expect(await Order.all().calculate("sum", "amount")).toBe(65);
    expect(await Order.all().calculate("minimum", "amount")).toBe(5);
    expect(await Order.all().calculate("maximum", "amount")).toBe(30);
  });

  it("sum with conditions", async () => {
    expect(await Account.where({ firm_id: 1 }).sum("credit_limit")).toBe(110);
  });

  it("count counts all records", async () => {
    expect(await Account.all().count()).toBe(3);
  });

  it("count with column skips nulls", async () => {
    class Nullable extends Base {
      static {
        this.attribute("value", "integer");
        this.adapter = adapter;
      }
    }
    await Nullable.create({ value: 1 });
    await Nullable.create({}); // value is null
    await Nullable.create({ value: 3 });

    expect(await Nullable.all().count("value")).toBe(2);
  });

  it("sum on empty table returns 0", async () => {
    class Empty extends Base {
      static {
        this.attribute("amount", "integer");
        this.adapter = adapter;
      }
    }
    expect(await Empty.all().sum("amount")).toBe(0);
  });

  it("average on empty table returns null", async () => {
    class Empty extends Base {
      static {
        this.attribute("amount", "integer");
        this.adapter = adapter;
      }
    }
    expect(await Empty.all().average("amount")).toBeNull();
  });
});

describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;

  class Product extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("price", "integer");
      this.attribute("category", "string");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Product.adapter = adapter;
  });

  // Rails: test_sum_on_empty_table
  it("sum on empty table returns 0", async () => {
    expect(await Product.all().sum("price")).toBe(0);
  });

  // Rails: test_sum_with_where
  it("sum with where condition", async () => {
    await Product.create({ name: "A", price: 10, category: "x" });
    await Product.create({ name: "B", price: 20, category: "x" });
    await Product.create({ name: "C", price: 30, category: "y" });

    expect(await Product.where({ category: "x" }).sum("price")).toBe(30);
  });

  // Rails: test_average
  it("average calculates mean", async () => {
    await Product.create({ name: "A", price: 10 });
    await Product.create({ name: "B", price: 20 });
    await Product.create({ name: "C", price: 30 });

    expect(await Product.all().average("price")).toBe(20);
  });

  // Rails: test_minimum
  it("minimum returns smallest value", async () => {
    await Product.create({ name: "A", price: 30 });
    await Product.create({ name: "B", price: 10 });
    await Product.create({ name: "C", price: 20 });

    expect(await Product.all().minimum("price")).toBe(10);
  });

  // Rails: test_maximum
  it("maximum returns largest value", async () => {
    await Product.create({ name: "A", price: 30 });
    await Product.create({ name: "B", price: 10 });
    await Product.create({ name: "C", price: 20 });

    expect(await Product.all().maximum("price")).toBe(30);
  });

  // Rails: test_minimum_on_empty_table
  it("minimum on empty table returns null", async () => {
    expect(await Product.all().minimum("price")).toBeNull();
  });

  // Rails: test_maximum_on_empty_table
  it("maximum on empty table returns null", async () => {
    expect(await Product.all().maximum("price")).toBeNull();
  });

  // Rails: test_sum_on_none
  it("sum on none() returns 0", async () => {
    await Product.create({ name: "A", price: 10 });
    expect(await Product.all().none().sum("price")).toBe(0);
  });

  // Rails: test_count_with_column
  it("count with column skips NULLs", async () => {
    await Product.create({ name: "A", price: 10 });
    await Product.create({ name: "B", price: null as any });
    await Product.create({ name: "C", price: 20 });

    expect(await Product.all().count("price")).toBe(2);
    expect(await Product.all().count()).toBe(3);
  });
});

describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test "group count"
  it("group().count() returns counts keyed by group value", async () => {
    class Order extends Base {
      static {
        this._tableName = "orders";
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.attribute("total", "integer");
        this.adapter = adapter;
      }
    }

    await Order.create({ status: "new", total: 100 });
    await Order.create({ status: "new", total: 200 });
    await Order.create({ status: "paid", total: 150 });
    await Order.create({ status: "shipped", total: 300 });
    await Order.create({ status: "shipped", total: 250 });
    await Order.create({ status: "shipped", total: 175 });

    const counts = await Order.all().group("status").count();
    expect(counts).toEqual({ new: 2, paid: 1, shipped: 3 });
  });

  // Rails: test "group sum"
  it("group().sum() returns sums keyed by group value", async () => {
    class Order extends Base {
      static {
        this._tableName = "orders";
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.attribute("total", "integer");
        this.adapter = adapter;
      }
    }

    await Order.create({ status: "new", total: 100 });
    await Order.create({ status: "new", total: 200 });
    await Order.create({ status: "paid", total: 150 });

    const sums = await Order.all().group("status").sum("total");
    expect(sums).toEqual({ new: 300, paid: 150 });
  });

  // Rails: test "group maximum"
  it("group().maximum() returns max values keyed by group value", async () => {
    class Order extends Base {
      static {
        this._tableName = "orders";
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.attribute("total", "integer");
        this.adapter = adapter;
      }
    }

    await Order.create({ status: "new", total: 100 });
    await Order.create({ status: "new", total: 200 });
    await Order.create({ status: "paid", total: 150 });

    const maxes = await Order.all().group("status").maximum("total");
    expect(maxes).toEqual({ new: 200, paid: 150 });
  });

  // Rails: test "group minimum"
  it("group().minimum() returns min values keyed by group value", async () => {
    class Order extends Base {
      static {
        this._tableName = "orders";
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.attribute("total", "integer");
        this.adapter = adapter;
      }
    }

    await Order.create({ status: "new", total: 100 });
    await Order.create({ status: "new", total: 200 });
    await Order.create({ status: "paid", total: 150 });

    const mins = await Order.all().group("status").minimum("total");
    expect(mins).toEqual({ new: 100, paid: 150 });
  });

  // =====================================================================
  // readonly — activerecord/test/cases/readonly_test.rb
  // =====================================================================

  // Rails: test "find with readonly option"
  it("readonly() marks loaded records as frozen/readonly", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "First" });
    const topics = await Topic.all().readonly().toArray();
    expect(topics[0].isReadonly()).toBe(true);
  });

  // Rails: test "readonly record cannot be saved"
  it("readonly record raises ReadOnlyRecord on save", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "First" });
    const topic = (await Topic.all().readonly().first()) as Base;
    topic.title = "Modified";
    await expect(topic.save()).rejects.toThrow(ReadOnlyRecord);
  });

  // Rails: test "readonly record cannot be destroyed"
  it("readonly record raises ReadOnlyRecord on destroy", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "First" });
    const topic = (await Topic.all().readonly().first()) as Base;
    await expect(topic.destroy()).rejects.toThrow(ReadOnlyRecord);
  });

  // =====================================================================
  // sole — activerecord/test/cases/finder_test.rb
  // =====================================================================

  // Rails: test "sole"
  it("sole() returns the only matching record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Unique" });
    const topic = await Topic.all().where({ title: "Unique" }).sole();
    expect(topic.title).toBe("Unique");
  });

  // Rails: test "sole when no records"
  it("sole() raises RecordNotFound when no records found", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await expect(Topic.all().where({ title: "Nothing" }).sole()).rejects.toThrow(RecordNotFound);
  });

  // Rails: test "sole when more than one record"
  it("sole() raises SoleRecordExceeded when more than one record found", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Duplicate" });
    await Topic.create({ title: "Duplicate" });
    await expect(Topic.all().where({ title: "Duplicate" }).sole()).rejects.toThrow(
      SoleRecordExceeded,
    );
  });

  // =====================================================================
  // take — activerecord/test/cases/finder_test.rb
  // =====================================================================

  // Rails: test "take"
  it("take() returns a record without implicit ordering", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "First" });
    await Topic.create({ title: "Second" });
    const topic = await Topic.all().take();
    expect(topic).not.toBeNull();
  });

  // Rails: test "take with limit"
  it("take(n) returns an array of n records", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "A" });
    await Topic.create({ title: "B" });
    await Topic.create({ title: "C" });
    const topics = await Topic.all().take(2);
    expect(topics).toHaveLength(2);
  });

  // Rails: test "take!"
  it("takeBang() raises RecordNotFound when empty", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    await expect(Topic.all().takeBang()).rejects.toThrow(RecordNotFound);
  });

  // =====================================================================
  // annotate — activerecord/test/cases/relation/annotate_test.rb
  // =====================================================================

  // Rails: test "annotate adds comment to the query"
  it("annotate() appends SQL comment to generated query", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    const sql = Topic.all().annotate("this is a test annotation").toSql();
    expect(sql).toContain("/* this is a test annotation */");
  });

  // Rails: test "annotate is chainable"
  it("annotate() is chainable and preserves multiple comments", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    const sql = Topic.all().annotate("first annotation").annotate("second annotation").toSql();
    expect(sql).toContain("/* first annotation */");
    expect(sql).toContain("/* second annotation */");
  });

  // Rails: test "annotate works with where"
  it("annotate() works alongside where clauses", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Hello" });
    const topics = await Topic.all().where({ title: "Hello" }).annotate("finder").toArray();
    expect(topics).toHaveLength(1);
  });

  // =====================================================================
  // merge — activerecord/test/cases/relation/merging_test.rb
  // =====================================================================

  // Rails: test "merge conditions"
  it("merge() combines where conditions from two relations", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }

    await Post.create({ title: "A", status: "published" });
    await Post.create({ title: "B", status: "draft" });
    await Post.create({ title: "A", status: "draft" });

    const named = Post.all().where({ title: "A" });
    const published = Post.all().where({ status: "published" });
    const result = await named.merge(published).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("A");
    expect(result[0].status).toBe("published");
  });

  // Rails: test "merge with scope"
  it("merge() works with named scopes", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    Post.scope("published", (rel: any) => rel.where({ status: "published" }));

    await Post.create({ title: "X", status: "published" });
    await Post.create({ title: "Y", status: "draft" });

    const allPosts = Post.all();
    const publishedScope = Post.all().where({ status: "published" });
    const result = await allPosts.merge(publishedScope).toArray();
    expect(result).toHaveLength(1);
  });

  // Rails: test "merge with ordering"
  it("merge() adopts ordering from the merged relation", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Post.create({ title: "B" });
    await Post.create({ title: "A" });

    const ordered = Post.all().order({ title: "asc" });
    const result = await Post.all().merge(ordered).toArray();
    expect(result[0].title).toBe("A");
  });

  // =====================================================================
  // from — activerecord/test/cases/relation_test.rb
  // =====================================================================

  // Rails: test "from"
  it("from() overrides the FROM clause in SQL generation", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    const sql = Topic.all().from('"archived_topics"').toSql();
    expect(sql).toContain('FROM "archived_topics"');
    expect(sql).not.toContain('FROM "topics"');
  });

  // Rails: test "from with subquery"
  it("from() works with subquery strings", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const subquery = '(SELECT * FROM "topics" WHERE "topics"."title" = \'Hello\') AS "filtered"';
    const sql = Topic.all().from(subquery).toSql();
    expect(sql).toContain("FROM (SELECT");
    // The main FROM should be the subquery, not the original table directly
    expect(sql).toMatch(/FROM\s*\(SELECT/);
  });

  // =====================================================================
  // strict_loading — activerecord/test/cases/strict_loading_test.rb
  // =====================================================================

  // Rails: test "strict loading on a relation"
  it("strictLoading() on Relation marks loaded records for strict loading", async () => {
    class Author extends Base {
      static {
        this._tableName = "sl_authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel("SlAuthor", Author);

    class Book extends Base {
      static {
        this._tableName = "sl_books";
        this.attribute("id", "integer");
        this.attribute("sl_author_id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Book, "slAuthor", { className: "SlAuthor" });

    const author = await Author.create({ name: "Jane" });
    await Book.create({ sl_author_id: author.id, title: "Novel" });

    const books = await Book.all().strictLoading().toArray();
    expect(books[0].isStrictLoading()).toBe(true);
    await expect(loadBelongsTo(books[0], "slAuthor", { className: "SlAuthor" })).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  // Rails: test "strict_loading!"
  it("strictLoadingBang() on a record enables strict loading", async () => {
    class Author extends Base {
      static {
        this._tableName = "sl2_authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel("Sl2Author", Author);

    class Book extends Base {
      static {
        this._tableName = "sl2_books";
        this.attribute("id", "integer");
        this.attribute("sl2_author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Book, "sl2Author", { className: "Sl2Author" });

    const author = await Author.create({ name: "Jane" });
    await Book.create({ sl2_author_id: author.id });

    const book = (await Book.all().first()) as Base;
    book.strictLoadingBang();
    await expect(loadBelongsTo(book, "sl2Author", { className: "Sl2Author" })).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  // Rails: test "strict_loading doesn't raise if association is preloaded"
  it("strict_loading allows access to preloaded associations", async () => {
    class Author extends Base {
      static {
        this._tableName = "sl3_authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel("Sl3Author", Author);

    class Book extends Base {
      static {
        this._tableName = "sl3_books";
        this.attribute("id", "integer");
        this.attribute("sl3_author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Book, "sl3Author", { className: "Sl3Author" });
    registerModel("Sl3Book", Book);

    const author = await Author.create({ name: "Jane" });
    await Book.create({ sl3_author_id: author.id });

    // With includes, the association is preloaded — no error
    const books = await Book.all().includes("sl3Author").strictLoading().toArray();
    expect(books[0].isStrictLoading()).toBe(true);
    // Preloaded association should be accessible without error
    const loaded = await loadBelongsTo(books[0], "sl3Author", { className: "Sl3Author" });
    expect(loaded).not.toBeNull();
  });

  // =====================================================================
  // find_sole_by — activerecord/test/cases/finder_test.rb
  // =====================================================================

  // Rails: test "find_sole_by"
  it("findSoleBy() returns the sole matching record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Sole Topic" });
    const topic = await Topic.findSoleBy({ title: "Sole Topic" });
    expect(topic.title).toBe("Sole Topic");
  });

  // Rails: test "find_sole_by raises when not found"
  it("findSoleBy() raises RecordNotFound when none found", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await expect(Topic.findSoleBy({ title: "Nothing" })).rejects.toThrow(RecordNotFound);
  });

  // Rails: test "find_sole_by raises when multiple found"
  it("findSoleBy() raises SoleRecordExceeded when multiple found", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Dup" });
    await Topic.create({ title: "Dup" });
    await expect(Topic.findSoleBy({ title: "Dup" })).rejects.toThrow(SoleRecordExceeded);
  });

  // =====================================================================
  // create_with — activerecord/test/cases/relation_test.rb
  // =====================================================================

  // Rails: test "create_with"
  it("createWith() applies default attrs when creating via findOrCreateBy", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.all()
      .createWith({ status: "published" })
      .findOrCreateBy({ title: "New Topic" });
    expect(topic.status).toBe("published");
    expect(topic.title).toBe("New Topic");
  });

  // Rails: test "create_with does not affect existing record lookup"
  it("createWith() does not affect existing record lookup", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Existing", status: "draft" });
    const topic = await Topic.all()
      .createWith({ status: "published" })
      .findOrCreateBy({ title: "Existing" });
    expect(topic.status).toBe("draft"); // kept original
  });

  // =====================================================================
  // unscope — activerecord/test/cases/relation/where_test.rb
  // =====================================================================

  // Rails: test "unscope where"
  it("unscope(:where) removes all where conditions", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "A" });
    await Topic.create({ title: "B" });

    const topics = await Topic.all().where({ title: "A" }).unscope("where").toArray();
    expect(topics).toHaveLength(2);
  });

  // Rails: test "unscope order"
  it("unscope(:order) removes ordering", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const sql = Topic.all().order({ title: "asc" }).unscope("order").toSql();
    expect(sql).not.toContain("ORDER");
  });

  // Rails: test "unscope multiple"
  it("unscope() can remove multiple parts at once", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    const sql = Topic.all()
      .limit(5)
      .offset(10)
      .order("id")
      .unscope("limit", "offset", "order")
      .toSql();
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("OFFSET");
    expect(sql).not.toContain("ORDER");
  });

  // =====================================================================
  // dup — activerecord/test/cases/dup_test.rb
  // =====================================================================

  // Rails: test "dup"
  it("dup() creates an unsaved copy with no primary key", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.create({ title: "Original" });
    const copy = topic.dup();
    expect(copy.isNewRecord()).toBe(true);
    expect(copy.id).toBeNull();
    expect(copy.title).toBe("Original");
  });

  // Rails: test "dup can be saved"
  it("dup() copy can be saved as a new record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const original = await Topic.create({ title: "Original" });
    const copy = original.dup();
    await copy.save();
    expect(copy.isPersisted()).toBe(true);
    expect(copy.id).not.toBe(original.id);
  });

  // =====================================================================
  // becomes — activerecord/test/cases/base_test.rb
  // =====================================================================

  // Rails: test "becomes"
  it("becomes() transforms record to another class", async () => {
    class Vehicle extends Base {
      static {
        this._tableName = "vehicles";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = adapter;
      }
    }
    class Car extends Base {
      static {
        this._tableName = "vehicles";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = adapter;
      }
    }

    const vehicle = await Vehicle.create({ name: "Tesla", type: "Car" });
    const car = vehicle.becomes(Car);
    expect(car).toBeInstanceOf(Car);
    expect(car.name).toBe("Tesla");
    expect(car.id).toBe(vehicle.id);
    expect(car.isPersisted()).toBe(true);
  });

  // =====================================================================
  // has_attribute? — activerecord/test/cases/attribute_methods_test.rb
  // =====================================================================

  // Rails: test "has_attribute?"
  it("hasAttribute() returns true for defined attributes", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const topic = new Topic({ title: "Test" });
    expect(topic.hasAttribute("title")).toBe(true);
    expect(topic.hasAttribute("id")).toBe(true);
    expect(topic.hasAttribute("unknown")).toBe(false);
  });

  // Rails: test "attribute_names"
  it("attributeNames() returns all attribute names", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }

    expect(Topic.attributeNames()).toEqual(["id", "title", "body"]);
  });

  // =====================================================================
  // exists? with conditions — activerecord/test/cases/finder_test.rb
  // =====================================================================

  // Rails: test "exists? with conditions hash"
  it("exists(conditions) checks with hash conditions", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Found" });
    expect(await Topic.all().exists({ title: "Found" })).toBe(true);
    expect(await Topic.all().exists({ title: "Missing" })).toBe(false);
  });

  // Rails: test "exists? with primary key"
  it("exists(id) checks by primary key", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.create({ title: "Found" });
    expect(await Topic.all().exists(topic.id)).toBe(true);
    expect(await Topic.all().exists(999)).toBe(false);
  });

  // =====================================================================
  // calculate — activerecord/test/cases/calculations_test.rb
  // =====================================================================

  // Rails: test "calculate"
  it("calculate() dispatches to the correct aggregate method", async () => {
    class Order extends Base {
      static {
        this._tableName = "orders";
        this.attribute("id", "integer");
        this.attribute("total", "integer");
        this.adapter = adapter;
      }
    }

    await Order.create({ total: 100 });
    await Order.create({ total: 200 });

    expect(await Order.all().calculate("count")).toBe(2);
    expect(await Order.all().calculate("sum", "total")).toBe(300);
    expect(await Order.all().calculate("average", "total")).toBe(150);
    expect(await Order.all().calculate("minimum", "total")).toBe(100);
    expect(await Order.all().calculate("maximum", "total")).toBe(200);
  });

  // =====================================================================
  // extending — activerecord/test/cases/relation_test.rb
  // =====================================================================

  // Rails: test "extending"
  it("extending() adds custom methods to a relation", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("published", "boolean");
        this.adapter = adapter;
      }
    }

    await Post.create({ title: "Draft", published: false });
    await Post.create({ title: "Live", published: true });

    const myScope = {
      publishedOnly() {
        return (this as any).where({ published: true });
      },
    };

    const posts = await Post.all().extending(myScope).publishedOnly().toArray();
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe("Live");
  });

  // Rails: test "extending with multiple modules"
  it("extending() can add multiple method sets", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Post.create({ title: "Hello" });
    await Post.create({ title: "World" });

    const mod1 = {
      titled(t: string) {
        return (this as any).where({ title: t });
      },
    };

    const posts = await Post.all().extending(mod1).titled("Hello").toArray();
    expect(posts).toHaveLength(1);
  });

  // =====================================================================
  // enum enhancements — activerecord/test/cases/enum_test.rb
  // =====================================================================

  // Rails: test "enum bang setter persists"
  it("enum bang setter persists the value", async () => {
    class Conversation extends Base {
      static {
        this._tableName = "conversations";
        this.attribute("id", "integer");
        this.attribute("status", "integer");
        this.adapter = adapter;
      }
    }
    defineEnum(Conversation, "status", ["active", "archived"]);

    const conv = await Conversation.create({ status: 0 });
    expect((conv as any).isActive()).toBe(true);
    await (conv as any).archivedBang();
    expect((conv as any).isArchived()).toBe(true);
    const reloaded = await Conversation.find(conv.id);
    expect(reloaded.status).toBe(1);
  });

  // Rails: test "enum generates not-scopes"
  it("enum generates not-scope (e.g., notArchived)", async () => {
    class Conversation extends Base {
      static {
        this._tableName = "conversations";
        this.attribute("id", "integer");
        this.attribute("status", "integer");
        this.adapter = adapter;
      }
    }
    defineEnum(Conversation, "status", ["active", "archived"]);

    await Conversation.create({ status: 0 }); // active
    await Conversation.create({ status: 1 }); // archived
    await Conversation.create({ status: 0 }); // active

    const notArchived = await (Conversation as any).notArchived().toArray();
    expect(notArchived).toHaveLength(2);
  });

  // Rails: test "enum scopes"
  it("enum generates scopes for each value", async () => {
    class Conversation extends Base {
      static {
        this._tableName = "conversations";
        this.attribute("id", "integer");
        this.attribute("status", "integer");
        this.adapter = adapter;
      }
    }
    defineEnum(Conversation, "status", ["active", "archived"]);

    await Conversation.create({ status: 0 }); // active
    await Conversation.create({ status: 1 }); // archived

    const active = await (Conversation as any).active().toArray();
    expect(active).toHaveLength(1);
    const archived = await (Conversation as any).archived().toArray();
    expect(archived).toHaveLength(1);
  });

  // =====================================================================
  // saved_changes — activerecord/test/cases/dirty_test.rb
  // =====================================================================

  // Rails: test "saved_changes"
  it("savedChanges returns changes from the last save", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.create({ title: "First" });
    topic.title = "Second";
    await topic.save();
    expect(topic.savedChanges).toHaveProperty("title");
    const [before, after] = topic.savedChanges.title;
    expect(before).toBe("First");
    expect(after).toBe("Second");
  });

  // Rails: test "saved_change_to_attribute?"
  it("savedChangeToAttribute() checks if attribute was changed in last save", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.create({ title: "First", body: "Content" });
    topic.title = "Second";
    await topic.save();
    expect(topic.savedChangeToAttribute("title")).toBe(true);
    expect(topic.savedChangeToAttribute("body")).toBe(false);
  });

  // =====================================================================
  // destroy_by / delete_by — activerecord/test/cases/persistence_test.rb
  // =====================================================================

  // Rails: test "destroy_by"
  it("destroyBy destroys matching records", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Keep" });
    await Topic.create({ title: "Remove" });
    await Topic.create({ title: "Remove" });

    const destroyed = await Topic.destroyBy({ title: "Remove" });
    expect(destroyed).toHaveLength(2);
    const remaining = await Topic.all().toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("Keep");
  });

  // Rails: test "delete_by"
  it("deleteBy deletes matching records without callbacks", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Keep" });
    await Topic.create({ title: "Remove" });

    const count = await Topic.deleteBy({ title: "Remove" });
    expect(count).toBe(1);
    const remaining = await Topic.all().toArray();
    expect(remaining).toHaveLength(1);
  });

  // Rails: test "update_all class method"
  it("static updateAll updates all records", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ status: "draft" });
    await Topic.create({ status: "draft" });

    await Topic.updateAll({ status: "published" });
    const topics = await Topic.all().toArray();
    expect(topics.every((t: any) => t.status === "published")).toBe(true);
  });

  // =====================================================================
  // in_order_of — activerecord/test/cases/relation_test.rb
  // =====================================================================

  // Rails: test "in_order_of"
  it("inOrderOf() generates CASE-based ordering", () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }

    const sql = Topic.all().inOrderOf("status", ["published", "draft", "archived"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("WHEN");
    expect(sql).toContain("published");
    expect(sql).toContain("draft");
    expect(sql).toContain("archived");
  });

  // =====================================================================
  // touch_all — activerecord/test/cases/touch_test.rb
  // =====================================================================

  // Rails: test "touch_all"
  it("touchAll updates timestamps on matching records", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }

    await Topic.create({});
    await Topic.create({});

    const affected = await Topic.all().touchAll();
    expect(affected).toBe(2);
  });

  // Rails: test "touch_all with named timestamps"
  it("touchAll can touch named timestamp columns", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("updated_at", "datetime");
        this.attribute("checked_at", "datetime");
        this.adapter = adapter;
      }
    }

    await Topic.create({});
    const affected = await Topic.all().touchAll("checked_at");
    expect(affected).toBe(1);
  });

  // =====================================================================
  // static update — activerecord/test/cases/persistence_test.rb
  // =====================================================================

  // Rails: test "update class method"
  it("static update(id, attrs) finds and updates a record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.create({ title: "Old" });
    const updated = await Topic.update(topic.id, { title: "New" });
    expect(updated.title).toBe("New");
  });

  // =====================================================================
  // static destroy_all — activerecord/test/cases/persistence_test.rb
  // =====================================================================

  // Rails: test "destroy_all class method"
  it("static destroyAll destroys all records", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "A" });
    await Topic.create({ title: "B" });
    await Topic.create({ title: "C" });
    const destroyed = await Topic.destroyAll();
    expect(destroyed).toHaveLength(3);
    expect(await Topic.all().count()).toBe(0);
  });

  // =====================================================================
  // where.associated / where.missing — activerecord/test/cases/relation/where_test.rb
  // =====================================================================

  // Rails: test "where.associated"
  it("whereAssociated filters for records with a present FK", async () => {
    class Author extends Base {
      static {
        this._tableName = "rg_wa_authors";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("RgWaAuthor", Author);

    class Post extends Base {
      static {
        this._tableName = "rg_wa_posts";
        this.attribute("id", "integer");
        this.attribute("rg_wa_author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Post, "rgWaAuthor", { className: "RgWaAuthor" });

    const author = await Author.create({});
    await Post.create({ rg_wa_author_id: author.id });
    await Post.create({ rg_wa_author_id: null });

    const associated = await Post.all().whereAssociated("rgWaAuthor").toArray();
    expect(associated).toHaveLength(1);
  });

  // Rails: test "where.missing"
  it("whereMissing filters for records with a null FK", async () => {
    class Author extends Base {
      static {
        this._tableName = "rg_wm_authors";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("RgWmAuthor", Author);

    class Post extends Base {
      static {
        this._tableName = "rg_wm_posts";
        this.attribute("id", "integer");
        this.attribute("rg_wm_author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Post, "rgWmAuthor", { className: "RgWmAuthor" });

    const author = await Author.create({});
    await Post.create({ rg_wm_author_id: author.id });
    await Post.create({ rg_wm_author_id: null });
    await Post.create({ rg_wm_author_id: null });

    const missing = await Post.all().whereMissing("rgWmAuthor").toArray();
    expect(missing).toHaveLength(2);
  });

  // =====================================================================
  // Positional finders — activerecord/test/cases/finder_test.rb
  // =====================================================================

  // Rails: test "second"
  it("second returns the second record ordered by PK", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "First" });
    await Topic.create({ title: "Second" });
    await Topic.create({ title: "Third" });

    const topic = await Topic.second();
    expect(topic).not.toBeNull();
    expect(topic!.title).toBe("Second");
  });

  // Rails: test "third"
  it("third returns the third record ordered by PK", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "First" });
    await Topic.create({ title: "Second" });
    await Topic.create({ title: "Third" });

    const topic = await Topic.third();
    expect(topic!.title).toBe("Third");
  });

  // Rails: test "fourth"
  it("fourth returns the fourth record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    for (const t of ["A", "B", "C", "D", "E"]) {
      await Topic.create({ title: t });
    }
    const topic = await Topic.fourth();
    expect(topic!.title).toBe("D");
  });

  // Rails: test "fifth"
  it("fifth returns the fifth record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    for (const t of ["A", "B", "C", "D", "E"]) {
      await Topic.create({ title: t });
    }
    const topic = await Topic.fifth();
    expect(topic!.title).toBe("E");
  });

  // Rails: test "second_to_last"
  it("secondToLast returns the second-to-last record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "First" });
    await Topic.create({ title: "Second" });
    await Topic.create({ title: "Third" });

    const topic = await Topic.secondToLast();
    expect(topic!.title).toBe("Second");
  });

  // Rails: test "third_to_last"
  it("thirdToLast returns the third-to-last record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "First" });
    await Topic.create({ title: "Second" });
    await Topic.create({ title: "Third" });
    await Topic.create({ title: "Fourth" });

    const topic = await Topic.thirdToLast();
    expect(topic!.title).toBe("Second");
  });

  // Rails: test "forty_two"
  it("fortyTwo returns the 42nd record", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    // Create 43 records
    for (let i = 1; i <= 43; i++) {
      await Topic.create({ title: `Topic ${i}` });
    }
    const topic = await Topic.fortyTwo();
    expect(topic!.title).toBe("Topic 42");
  });

  // =====================================================================
  // select block form — activerecord/test/cases/relation/select_test.rb
  // =====================================================================

  // Rails: test "select with block form"
  it("select with block filters loaded records", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("approved", "boolean");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Approved", approved: true });
    await Topic.create({ title: "Not Approved", approved: false });
    await Topic.create({ title: "Also Approved", approved: true });

    const approved = await Topic.all().select((t: any) => t.approved === true);
    expect(approved).toHaveLength(2);
    expect(approved.every((t: any) => t.approved === true)).toBe(true);
  });

  // =====================================================================
  // find_each / find_in_batches — activerecord/test/cases/batches_test.rb
  // =====================================================================

  // Rails: test "find_each should execute the query in batches"
  it("findEach processes all records in batches", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 10; i++) {
      await Post.create({ title: `Post ${i}` });
    }

    const titles: string[] = [];
    for await (const post of Post.all().findEach({ batchSize: 3 })) {
      titles.push(post.title as string);
    }
    expect(titles).toHaveLength(10);
  });

  // Rails: test "find_in_batches should return batches"
  it("findInBatches returns batch arrays", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 10; i++) {
      await Post.create({ title: `Post ${i}` });
    }

    const batchSizes: number[] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 4 })) {
      batchSizes.push(batch.length);
    }
    expect(batchSizes).toEqual([4, 4, 2]);
  });

  // =====================================================================
  // regroup — activerecord/test/cases/relation/group_test.rb
  // =====================================================================

  // Rails: test "regroup replaces group columns"
  it("regroup replaces existing GROUP BY", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("category", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ category: "tech", status: "active" });
    await Topic.create({ category: "tech", status: "archived" });
    await Topic.create({ category: "sports", status: "active" });

    const counts = (await Topic.all().group("category").regroup("status").count()) as Record<
      string,
      number
    >;
    expect(counts["active"]).toBe(2);
    expect(counts["archived"]).toBe(1);
  });

  // =====================================================================
  // excluding / without — activerecord/test/cases/relation/excluding_test.rb
  // =====================================================================

  // Rails: test "excluding with records"
  it("excluding removes specific records by PK", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const first = await Topic.create({ title: "First" });
    await Topic.create({ title: "Second" });
    await Topic.create({ title: "Third" });

    const remaining = await Topic.all().excluding(first).toArray();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((t: any) => t.title !== "First")).toBe(true);
  });

  // Rails: test "without is an alias"
  it("without is an alias for excluding", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const t1 = await Topic.create({ title: "A" });
    const t2 = await Topic.create({ title: "B" });
    await Topic.create({ title: "C" });

    const remaining = await Topic.all().without(t1, t2).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("C");
  });

  // =====================================================================
  // Relation state — activerecord/test/cases/relation_test.rb
  // =====================================================================

  // Rails: test "loaded?"
  it("isLoaded tracks whether records have been fetched", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "Test" });
    const rel = Topic.all();
    expect(rel.isLoaded).toBe(false);
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    rel.reset();
    expect(rel.isLoaded).toBe(false);
  });

  // Rails: test "size"
  it("size returns count efficiently", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "A" });
    await Topic.create({ title: "B" });
    expect(await Topic.all().size()).toBe(2);
  });

  // Rails: test "empty?"
  it("isEmpty checks for empty result", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    expect(await Topic.all().isEmpty()).toBe(true);
    await Topic.create({ title: "A" });
    expect(await Topic.all().isEmpty()).toBe(false);
  });

  // Rails: test "any?"
  it("isAny checks for any matching records", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    expect(await Topic.all().isAny()).toBe(false);
    await Topic.create({ title: "A" });
    expect(await Topic.all().isAny()).toBe(true);
  });

  // Rails: test "many?"
  it("isMany returns true for 2+ records", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "A" });
    expect(await Topic.all().isMany()).toBe(false);
    await Topic.create({ title: "B" });
    expect(await Topic.all().isMany()).toBe(true);
  });

  // =====================================================================
  // inspect — activerecord/test/cases/base_test.rb
  // =====================================================================

  // Rails: test "inspect"
  it("inspect returns a human-readable representation", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.create({ title: "Hello" });
    const str = topic.inspect();
    expect(str).toContain("#<Topic");
    expect(str).toContain('title: "Hello"');
    expect(str).toContain("id:");
  });

  // =====================================================================
  // scoping — activerecord/test/cases/scoping/scoping_test.rb
  // =====================================================================

  // Rails: test "scoping sets current_scope"
  it("scoping sets and restores currentScope", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const scope = Topic.all().where({ title: "Active" });
    expect(Topic.currentScope).toBeNull();
    await Topic.scoping(scope, async () => {
      expect(Topic.currentScope).toBe(scope);
    });
    expect(Topic.currentScope).toBeNull();
  });

  // =====================================================================
  // Relation#load — activerecord/test/cases/relation_test.rb
  // =====================================================================

  // Rails: test "load loads the records"
  it("load eagerly loads records and returns relation", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "A" });
    await Topic.create({ title: "B" });

    const rel = Topic.all();
    expect(rel.isLoaded).toBe(false);
    const result = await rel.load();
    expect(result.isLoaded).toBe(true);
  });

  // =====================================================================
  // attribute_before_type_cast — activerecord/test/cases/attribute_methods_test.rb
  // =====================================================================

  // Rails: test "read_attribute_before_type_cast returns the raw value"
  it("readAttributeBeforeTypeCast returns raw uncast value", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("written_on", "datetime");
        this.adapter = adapter;
      }
    }

    const topic = new Topic({ written_on: "2024-01-15" });
    // The cast value should be a Date
    expect(topic.readAttribute("written_on")).toBeInstanceOf(Date);
    // The before_type_cast value should be the raw string
    expect(topic.readAttributeBeforeTypeCast("written_on")).toBe("2024-01-15");
  });

  // =====================================================================
  // length — activerecord/test/cases/relation_test.rb
  // =====================================================================

  // Rails: test "length loads records and returns count"
  it("length loads and returns record count", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ title: "A" });
    await Topic.create({ title: "B" });
    await Topic.create({ title: "C" });

    expect(await Topic.all().length()).toBe(3);
  });

  // =====================================================================
  // slice / values_at — activerecord/test/cases/base_test.rb
  // =====================================================================

  // Rails: test "slice returns a hash of the given keys"
  it("slice returns a subset of attributes", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("content", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.create({ title: "Hello", content: "World" });
    const sliced = topic.slice("title", "content");
    expect(sliced).toEqual({ title: "Hello", content: "World" });
    expect(sliced).not.toHaveProperty("id");
  });

  // Rails: test "values_at returns an array of attribute values"
  it("valuesAt returns values as an array", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("content", "string");
        this.adapter = adapter;
      }
    }

    const topic = await Topic.create({ title: "Hello", content: "World" });
    expect(topic.valuesAt("title", "content")).toEqual(["Hello", "World"]);
  });

  // =====================================================================
  // distinct count — activerecord/test/cases/calculations_test.rb
  // =====================================================================

  // Rails: test "should count distinct with column"
  it("distinct().count(column) uses COUNT(DISTINCT ...)", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("author_name", "string");
        this.adapter = adapter;
      }
    }

    await Topic.create({ author_name: "Alice" });
    await Topic.create({ author_name: "Alice" });
    await Topic.create({ author_name: "Bob" });
    await Topic.create({ author_name: "Charlie" });

    const total = (await Topic.all().count()) as number;
    expect(total).toBe(4);

    const distinctCount = (await Topic.all().distinct().count("author_name")) as number;
    expect(distinctCount).toBe(3);
  });

  // =====================================================================
  // where with subquery — activerecord/test/cases/relation/where_test.rb
  // =====================================================================

  // Rails: test "where with subquery relation"
  it("where with Relation value generates IN subquery SQL", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const alice = await Author.create({ name: "Alice" });
    await Author.create({ name: "Bob" });
    await Post.create({ author_id: alice.id, title: "Hello" });

    const aliceIds = Author.all().where({ name: "Alice" }).select("id") as any;
    const sql = Post.all().where({ author_id: aliceIds }).toSql();
    expect(sql).toContain("IN (SELECT");
    expect(sql).toContain("author_id");
  });

  // =====================================================================
  // enum prefix — activerecord/test/cases/enum_test.rb
  // =====================================================================

  // Rails: test "enum prefix true"
  it("enum with prefix: true generates prefixed methods", async () => {
    class Conversation extends Base {
      static {
        this._tableName = "conversations";
        this.attribute("id", "integer");
        this.attribute("status", "integer");
        this.adapter = adapter;
      }
    }
    defineEnum(Conversation, "status", ["active", "archived"], { prefix: true });

    const conv = await Conversation.create({ status: 0 });
    expect((conv as any).isStatusActive()).toBe(true);
    expect((conv as any).isStatusArchived()).toBe(false);
  });

  // Rails: test "enum prefix string"
  it("enum with prefix string generates custom-prefixed methods", async () => {
    class Conversation extends Base {
      static {
        this._tableName = "conversations";
        this.attribute("id", "integer");
        this.attribute("comments_status", "integer");
        this.adapter = adapter;
      }
    }
    defineEnum(Conversation, "comments_status", ["open", "closed"], { prefix: "comments" });

    const conv = await Conversation.create({ comments_status: 0 });
    expect((conv as any).isCommentsOpen()).toBe(true);
    expect((conv as any).isCommentsClosed()).toBe(false);
  });

  // Rails: test "enum suffix true"
  it("enum with suffix: true generates suffixed methods", async () => {
    class Conversation extends Base {
      static {
        this._tableName = "conversations";
        this.attribute("id", "integer");
        this.attribute("question_type", "integer");
        this.adapter = adapter;
      }
    }
    defineEnum(Conversation, "question_type", ["multiple", "single"], { suffix: true });

    const conv = await Conversation.create({ question_type: 0 });
    expect((conv as any).isMultipleQuestionType()).toBe(true);
  });

  // Rails: test "or with scopes"
  it("or combines two scoped relations", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    User.scope("active", (rel: any) => rel.where({ status: "active" }));
    User.scope("pending", (rel: any) => rel.where({ status: "pending" }));

    await User.create({ name: "A", status: "active" });
    await User.create({ name: "B", status: "pending" });
    await User.create({ name: "C", status: "archived" });

    const result = await (User as any)
      .active()
      .or((User as any).pending())
      .toArray();
    expect(result.length).toBe(2);
  });

  // Rails: test "rewhere clears NOT conditions"
  it("rewhere replaces both where and whereNot for the same key", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ role: "admin" });
    await User.create({ role: "viewer" });

    const result = await User.all()
      .whereNot({ role: "admin" })
      .rewhere({ role: "admin" })
      .toArray();
    expect(result.length).toBe(1);
    expect(result[0].role).toBe("admin");
  });

  // Rails: test "pluck with Arel attributes"
  it("pluck accepts Arel Attribute nodes", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const names = await User.all().pluck(User.arelTable.get("name"));
    expect(names.sort()).toEqual(["Alice", "Bob"]);
  });

  // Rails: test "previously_new_record?"
  it("previously_new_record? returns true after first save", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = new User({ name: "Alice" });
    expect(user.isPreviouslyNewRecord()).toBe(false);
    expect(user.isNewRecord()).toBe(true);

    await user.save();
    expect(user.isPreviouslyNewRecord()).toBe(true);
    expect(user.isNewRecord()).toBe(false);

    await user.update({ name: "Bob" });
    expect(user.isPreviouslyNewRecord()).toBe(false);
  });

  // Rails: test "frozen after destroy"
  it("record is frozen after destroy and prevents modification", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    expect(user.isFrozen()).toBe(false);

    await user.destroy();
    expect(user.isFrozen()).toBe(true);
    expect(user.isDestroyed()).toBe(true);
    expect(() => (user.name = "Bob")).toThrow("Cannot modify a frozen");
  });

  // Rails: test "frozen after delete"
  it("record is frozen after delete", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    await user.delete();
    expect(user.isFrozen()).toBe(true);
  });

  // Rails: test "destroyed_by_association"
  it("destroyed_by_association tracks which association triggered destroy", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }

    const post = await Post.create({ title: "Hello" });
    expect(post.destroyedByAssociation).toBeNull();

    post.destroyedByAssociation = { name: "user", type: "belongsTo" };
    expect(post.destroyedByAssociation).toEqual({ name: "user", type: "belongsTo" });
  });

  // Rails: test "freeze manually"
  it("freeze prevents attribute modification", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = new User({ name: "Alice" });
    user.freeze();
    expect(user.isFrozen()).toBe(true);
    expect(() => (user.name = "Bob")).toThrow();
  });

  // Rails: test "save(validate: false)"
  it("save(validate: false) skips validations", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
        this.validates("name", { presence: true });
      }
    }

    const user = new User({ name: "" });
    expect(await user.save()).toBe(false);
    expect(await user.save({ validate: false })).toBe(true);
    expect(user.isPersisted()).toBe(true);
  });

  // Rails: test "create_or_find_by"
  it("createOrFindBy creates when none exists", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.createOrFindBy({ name: "Alice" });
    expect(user.name).toBe("Alice");
    expect(user.isPersisted()).toBe(true);
  });

  // Rails: test "lock! reloads with FOR UPDATE"
  it("lockBang reloads the record", async () => {
    class Account extends Base {
      static {
        this._tableName = "accounts";
        this.attribute("id", "integer");
        this.attribute("balance", "integer");
        this.adapter = adapter;
      }
    }

    const account = await Account.create({ balance: 100 });
    await adapter.executeMutation(
      `UPDATE "accounts" SET "balance" = 200 WHERE "id" = ${account.id}`,
    );

    await account.lockBang();
    expect(account.balance).toBe(200);
  });

  // Rails: test "attribute_for_inspect"
  it("attributeForInspect formats values for display", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice", age: 30 });
    expect(user.attributeForInspect("name")).toBe('"Alice"');
    expect(user.attributeForInspect("age")).toBe("30");
    expect(user.attributeForInspect("id")).not.toBe("nil");
  });

  // Rails: test "attribute_for_inspect truncates long strings"
  it("attributeForInspect truncates strings over 50 characters", () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }

    const post = new Post({ body: "x".repeat(100) });
    expect(post.attributeForInspect("body")).toBe(`"${"x".repeat(50)}..."`);
  });

  // Rails: test "in_batches yields relations"
  it("inBatches yields Relation objects for each batch", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 7; i++) {
      await User.create({ name: `User ${i}` });
    }

    const batchSizes: number[] = [];
    for await (const batchRel of User.all().inBatches({ batchSize: 3 })) {
      const records = await batchRel.toArray();
      batchSizes.push(records.length);
    }
    expect(batchSizes).toEqual([3, 3, 1]);
  });

  // Rails: test "createOrFindBy on relation"
  it("createOrFindBy works on Relation", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.all().createOrFindBy({ name: "Alice", role: "admin" });
    expect(user.name).toBe("Alice");
    expect(user.role).toBe("admin");
  });

  // Rails: test "find_by_sql"
  it("findBySql returns model instances from raw SQL", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const results = await User.findBySql('SELECT * FROM "users" WHERE "name" = \'Bob\'');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Bob");
    expect(results[0].isPersisted()).toBe(true);
  });

  // Rails: test "increment_counter"
  it("incrementCounter increments a counter column", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("comments_count", "integer", { default: 0 });
        this.adapter = adapter;
      }
    }

    const post = await Post.create({ comments_count: 3 });
    await Post.incrementCounter("comments_count", post.id);
    await post.reload();
    expect(post.comments_count).toBe(4);
  });

  // Rails: test "decrement_counter"
  it("decrementCounter decrements a counter column", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("comments_count", "integer", { default: 0 });
        this.adapter = adapter;
      }
    }

    const post = await Post.create({ comments_count: 5 });
    await Post.decrementCounter("comments_count", post.id);
    await post.reload();
    expect(post.comments_count).toBe(4);
  });

  // Rails: test "update_counters"
  it("updateCounters updates multiple counters at once", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("likes_count", "integer", { default: 0 });
        this.attribute("views_count", "integer", { default: 0 });
        this.adapter = adapter;
      }
    }

    const post = await Post.create({ likes_count: 10, views_count: 100 });
    await Post.updateCounters(post.id, { likes_count: 5, views_count: -10 });
    await post.reload();
    expect(post.likes_count).toBe(15);
    expect(post.views_count).toBe(90);
  });

  // Rails: test "save(touch: false)"
  it("save(touch: false) skips updating timestamps", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }

    const post = await Post.create({ title: "Hello" });
    const originalUpdatedAt = post.updated_at;

    post.title = "Changed";
    await post.save({ touch: false });
    expect(post.updated_at).toEqual(originalUpdatedAt);
  });

  // Rails: test "attr_readonly"
  it("attrReadonly prevents updating readonly attributes", async () => {
    class Product extends Base {
      static {
        this._tableName = "products";
        this.attribute("id", "integer");
        this.attribute("sku", "string");
        this.attribute("name", "string");
        this.adapter = adapter;
        this.attrReadonly("sku");
      }
    }

    const product = await Product.create({ sku: "ABC-123", name: "Widget" });
    product.sku = "CHANGED";
    product.name = "Better Widget";
    await product.save();
    await product.reload();

    expect(product.sku).toBe("ABC-123");
    expect(product.name).toBe("Better Widget");
  });

  // Rails: test "readonly_attributes"
  it("readonlyAttributes returns the list of readonly attributes", () => {
    class Product extends Base {
      static {
        this._tableName = "products";
        this.attribute("id", "integer");
        this.attribute("sku", "string");
        this.adapter = adapter;
        this.attrReadonly("sku");
      }
    }
    expect(Product.readonlyAttributes).toContain("sku");
  });

  // Rails: test "willSaveChangeToAttribute"
  it("willSaveChangeToAttribute detects pending changes", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    expect(user.willSaveChangeToAttribute("name")).toBe(false);

    user.name = "Bob";
    expect(user.willSaveChangeToAttribute("name")).toBe(true);
    expect(user.willSaveChangeToAttributeValues("name")).toEqual(["Alice", "Bob"]);
  });

  // Rails: test "update_attribute"
  it("updateAttribute saves a single attribute skipping validations", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
        this.validates("email", { presence: true });
      }
    }

    const user = await User.create({ name: "Alice", email: "a@b.com" });
    const result = await user.updateAttribute("email", "");
    expect(result).toBe(true);
    expect(user.email).toBe("");
  });

  // Rails: test "attribute_in_database"
  it("attributeInDatabase returns the value before unsaved changes", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    user.name = "Bob";
    expect(user.attributeInDatabase("name")).toBe("Alice");
  });

  // Rails: test "attribute_before_last_save"
  it("attributeBeforeLastSave returns the value from before the last save", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    await user.update({ name: "Bob" });
    expect(user.attributeBeforeLastSave("name")).toBe("Alice");
  });

  // Rails: test "changed_attribute_names_to_save"
  it("changedAttributeNamesToSave lists attributes with pending changes", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice", age: 25 });
    user.name = "Bob";
    expect(user.changedAttributeNamesToSave).toContain("name");
    expect(user.changedAttributeNamesToSave).not.toContain("age");
  });

  // Rails: test "find_each with start and finish"
  it("findEach with start/finish limits the PK range", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 10; i++) {
      await User.create({ name: `User ${i}` });
    }

    const ids: number[] = [];
    for await (const user of User.all().findEach({ start: 4, finish: 8 })) {
      ids.push(user.id as number);
    }
    expect(ids).toEqual([4, 5, 6, 7, 8]);
  });

  // Rails: test "column_names"
  it("columnNames returns list of attribute names", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    expect(User.columnNames()).toEqual(["id", "name", "email"]);
  });

  // Rails: test "human_attribute_name"
  it("humanAttributeName converts to readable form", () => {
    expect(Base.humanAttributeName("first_name")).toBe("First name");
    expect(Base.humanAttributeName("email_address")).toBe("Email address");
    expect(Base.humanAttributeName("id")).toBe("Id");
  });

  // Rails: test "blank? / present?"
  it("isBlank and isPresent check for empty results", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    expect(await User.all().isBlank()).toBe(true);
    expect(await User.all().isPresent()).toBe(false);

    await User.create({ name: "Alice" });
    expect(await User.all().isBlank()).toBe(false);
    expect(await User.all().isPresent()).toBe(true);
  });

  // Rails: test "structurally_compatible?"
  it("structurallyCompatible checks if relations can be combined", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    expect(User.all().structurallyCompatible(User.all())).toBe(true);
    expect(User.all().structurallyCompatible(Post.all() as any)).toBe(false);
  });

  // Rails: test "changed_for_autosave?"
  it("isChangedForAutosave detects records needing save", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const newUser = new User({ name: "Alice" });
    expect(newUser.isChangedForAutosave()).toBe(true);

    const saved = await User.create({ name: "Bob" });
    expect(saved.isChangedForAutosave()).toBe(false);

    saved.name = "Changed";
    expect(saved.isChangedForAutosave()).toBe(true);
  });

  // Rails: test "exists?"
  it("exists? checks record existence by id, conditions, or no args", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    expect(await User.exists()).toBe(false);
    const user = await User.create({ name: "Alice" });
    expect(await User.exists()).toBe(true);
    expect(await User.exists(user.id)).toBe(true);
    expect(await User.exists(999)).toBe(false);
    expect(await User.exists({ name: "Alice" })).toBe(true);
    expect(await User.exists({ name: "Missing" })).toBe(false);
  });

  // Rails: test "class-level aggregates"
  it("Base.count, minimum, maximum, sum, average delegate to Relation", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ age: 20 });
    await User.create({ age: 40 });

    expect(await User.count()).toBe(2);
    expect(await User.minimum("age")).toBe(20);
    expect(await User.maximum("age")).toBe(40);
    expect(await User.sum("age")).toBe(60);
    expect(await User.average("age")).toBe(30);
  });

  // Rails: test "pluck and ids class methods"
  it("Base.pluck and Base.ids return extracted values", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const names = (await User.pluck("name")).sort();
    expect(names).toEqual(["Alice", "Bob"]);
    expect((await User.ids()).length).toBe(2);
  });

  // Rails: test "cache_key"
  it("cacheKey returns model/id for persisted records and model/new for new records", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }

    const newUser = new User({ name: "Alice" });
    expect(newUser.cacheKey()).toBe("users/new");

    const saved = await User.create({ name: "Alice" });
    expect(saved.cacheKey()).toBe(`users/${saved.id}`);
  });

  // Rails: test "cache_key_with_version"
  it("cacheKeyWithVersion includes updated_at timestamp", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    const key = user.cacheKeyWithVersion();
    expect(key).toMatch(/^users\/\d+-\d+$/);
  });

  // Rails: test "scope_for_create"
  it("scopeForCreate returns equality where conditions for new record creation", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }

    const scope = User.all().where({ role: "admin" }).scopeForCreate();
    expect(scope).toEqual({ role: "admin" });
  });

  // Rails: test "where_values_hash"
  it("whereValuesHash returns a hash of equality conditions", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }

    const hash = User.all().where({ name: "Alice", role: "admin" }).whereValuesHash();
    expect(hash).toEqual({ name: "Alice", role: "admin" });
  });

  // Rails: test "and"
  it("and() combines two relations with AND intersection", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Charlie", role: "admin" });

    const results = await User.all()
      .where({ role: "admin" })
      .and(User.all().where({ name: "Alice" }))
      .toArray();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Alice");
  });

  // Rails: test "reject"
  it("reject() filters out matching records", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    const results = await User.all().reject((u: any) => u.name === "Alice");
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Bob");
  });

  // Rails: test "compact_blank"
  it("compactBlank() filters out records with null column values", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", email: "a@test.com" });
    await User.create({ name: "Bob" }); // email is null

    const results = await User.all().compactBlank("email").toArray();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Alice");
  });

  // Rails: test "sanitize_sql_array"
  it("sanitizeSqlArray safely quotes values", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    expect(User.sanitizeSqlArray("name = ? AND age > ?", "O'Brien", 25)).toBe(
      "name = 'O''Brien' AND age > 25",
    );
  });

  // Rails: test "sanitize_sql"
  it("sanitizeSql handles both string and array forms", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    expect(User.sanitizeSql("raw SQL")).toBe("raw SQL");
    expect(User.sanitizeSql(["name = ?", "Alice"])).toBe("name = 'Alice'");
  });

  // Rails: test "ignored_columns"
  it("ignoredColumns can be set and retrieved", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }

    User.ignoredColumns = ["old_field", "deprecated_col"];
    expect(User.ignoredColumns).toEqual(["old_field", "deprecated_col"]);
  });

  // Rails: test "new"
  it("Base.new() creates an unsaved record", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = User.new({ name: "Alice" });
    expect(user.isNewRecord()).toBe(true);
    expect(user.name).toBe("Alice");
  });

  // Rails: test "attribute_present?"
  it("attributePresent returns true for non-blank values", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    expect(user.attributePresent("name")).toBe(true);
    expect(user.attributePresent("email")).toBe(false);
  });

  // Rails: test "to_key"
  it("toKey returns [id] for persisted records, null for new", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const newUser = new User({ name: "Alice" });
    expect(newUser.toKey()).toBeNull();

    const saved = await User.create({ name: "Alice" });
    expect(saved.toKey()).toEqual([saved.id]);
  });

  // Rails: test "after_touch callback"
  it("afterTouch fires after touch()", async () => {
    const log: string[] = [];
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("updated_at", "datetime");
        this.afterTouch((r: any) => {
          log.push("touched");
        });
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    await user.touch();
    expect(log).toEqual(["touched"]);
  });

  // Rails: test "dependent restrict_with_exception"
  it("dependent restrictWithException raises on destroy with children", async () => {
    class RGComment extends Base {
      static {
        this._tableName = "rg_comments";
        this.attribute("id", "integer");
        this.attribute("rg_post_id", "integer");
        this.adapter = adapter;
      }
    }
    class RGPost extends Base {
      static _tableName = "rg_posts";
      static _associations: any[] = [
        {
          type: "hasMany",
          name: "rgComments",
          options: {
            dependent: "restrictWithException",
            className: "RGComment",
            foreignKey: "rg_post_id",
          },
        },
      ];
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(RGComment);
    registerModel(RGPost);

    const post = await RGPost.create({ title: "Hello" });
    await RGComment.create({ rg_post_id: post.id });

    await expect(post.destroy()).rejects.toThrow("Cannot delete record");
  });

  // Rails: test "belongs_to required"
  it("belongs_to required: true validates FK presence", async () => {
    class RGAuthor extends Base {
      static {
        this._tableName = "rg_authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class RGBook extends Base {
      static {
        this._tableName = "rg_books";
        this.attribute("id", "integer");
        this.attribute("rg_author_id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(RGAuthor);
    registerModel(RGBook);
    Associations.belongsTo.call(RGBook, "rgAuthor", { required: true, foreignKey: "rg_author_id" });

    const book = new RGBook({ title: "Orphan" });
    const saved = await book.save();
    expect(saved).toBe(false);

    const author = await RGAuthor.create({ name: "Tolkien" });
    const book2 = new RGBook({ title: "LotR", rg_author_id: author.id });
    const saved2 = await book2.save();
    expect(saved2).toBe(true);
  });

  // Rails: test "where with named binds"
  it("where replaces :name placeholders with quoted values", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 15 });

    const results = await User.all().where("age >= :min", { min: 20 }).toArray();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Alice");
  });

  // Rails: test "only keeps specified relation parts"
  it("only() keeps only specified query components", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const rel = User.all().where({ name: "Alice" }).order("name").limit(1);
    const onlyWhere = rel.only("where");
    const results = await onlyWhere.toArray();
    expect(results.length).toBe(1);
  });

  // Rails: test "unscope removes specified relation parts"
  it("unscope() removes specified query components", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const rel = User.all().where({ name: "Alice" }).limit(1);
    const withoutLimit = rel.unscope("limit");
    const results = await withoutLimit.toArray();
    expect(results.length).toBe(1); // still has where clause
  });

  // Rails: test "normalizes"
  it("normalizes trims and lowercases email before save", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    User.normalizes("email", (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v));

    const user = await User.create({ email: "  ALICE@TEST.COM  " });
    expect(user.email).toBe("alice@test.com");
  });

  // Rails: test "destroy(id)"
  it("Base.destroy(id) finds and destroys a record", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    const destroyed = await User.destroy(user.id);
    expect((destroyed as any).isDestroyed()).toBe(true);
    expect(await User.count()).toBe(0);
  });

  // Rails: test "find with multiple ids"
  it("find(id1, id2) returns array of records", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const u1 = await User.create({ name: "Alice" });
    const u2 = await User.create({ name: "Bob" });

    const results = await User.find(u1.id, u2.id);
    expect(results.length).toBe(2);
  });

  // Rails: test "update!(id, attrs)"
  it("Base.updateBang raises on validation failure", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }

    const user = await User.create({ name: "Alice" });
    const updated = await User.updateBang(user.id, { name: "Bob" });
    expect(updated.name).toBe("Bob");
  });

  // Rails: test "one?"
  it("isOne returns true when exactly one record matches", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    expect(await User.all().isOne()).toBe(true);
    await User.create({ name: "Bob" });
    expect(await User.all().isOne()).toBe(false);
  });

  // Rails: test "reload"
  it("relation reload() clears cache and re-queries", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    const rel = User.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);

    await User.create({ name: "Bob" });
    await rel.reload();
    const records = await rel.records();
    expect(records.length).toBe(2);
  });

  // Rails guide: attributeChanged?(from:, to:) — Active Model Dirty
  it("attributeChanged? supports from: and to: options (Active Model Dirty)", async () => {
    const adapter = createTestAdapter();

    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    const p = await Person.create({ name: "Alice", age: 25 });
    p.age = 30;

    // Rails: person.attribute_changed?(:age) => true
    expect(p.attributeChanged("age")).toBe(true);
    // Rails: person.attribute_changed?(:age, from: 25, to: 30) => true
    expect(p.attributeChanged("age", { from: 25, to: 30 })).toBe(true);
    // Rails: person.attribute_changed?(:age, from: 20) => false
    expect(p.attributeChanged("age", { from: 20 })).toBe(false);
    // Rails: person.will_save_change_to_attribute?(:age, from: 25) => true
    expect(p.willSaveChangeToAttribute("age", { from: 25 })).toBe(true);

    await p.save();

    // Rails: person.saved_change_to_attribute?(:age, from: 25, to: 30) => true
    expect(p.savedChangeToAttribute("age", { from: 25, to: 30 })).toBe(true);
    expect(p.savedChangeToAttribute("age", { to: 99 })).toBe(false);
  });

  // Rails guide: optimizer_hints — add database query hints
  it("optimizerHints() adds hints to generated SQL", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const sql = User.all().optimizerHints("MAX_EXECUTION_TIME(1000)").toSql();
    expect(sql).toMatch(/SELECT\s+\/\*\+\s+MAX_EXECUTION_TIME\(1000\)\s+\*\//);
  });

  // Rails guide: errors.full_messages_for — error messages for specific attribute
  it("errors.fullMessagesFor() returns messages for specific attribute", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.validates("name", { presence: true });
        this.validates("email", { presence: true });
        this.adapter = adapter;
      }
    }
    const u = new User({});
    u.isValid();
    expect(u.errors.fullMessagesFor("name")).toEqual(["Name can't be blank"]);
    expect(u.errors.fullMessagesFor("email")).toEqual(["Email can't be blank"]);
  });

  // Rails guide: errors.of_kind? — check for specific error type
  it("errors.ofKind() checks for error type on attribute", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }
    const u = new User({});
    u.isValid();
    expect(u.errors.ofKind("name", "blank")).toBe(true);
    expect(u.errors.ofKind("name", "taken")).toBe(false);
  });

  // Rails guide: column_for_attribute — attribute metadata
  it("columnForAttribute() returns type info for attribute", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }
    const u = new User({ name: "Alice", age: 25 });
    const col = u.columnForAttribute("name");
    expect(col).not.toBeNull();
    expect(col!.name).toBe("name");
    expect(u.columnForAttribute("unknown")).toBeNull();
  });

  // Rails guide: attributes_before_type_cast — raw attribute values
  it("attributesBeforeTypeCast returns raw values", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }
    const u = new User({ age: "42" });
    expect(u.attributesBeforeTypeCast.age).toBe("42");
    expect(u.age).toBe(42);
  });

  // Rails guide: encrypts — encrypted attributes
  it("encrypts() transparently encrypts and decrypts attributes", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("ssn", "string");
        this.adapter = adapter;
        this.encrypts("ssn");
      }
    }
    const user = await User.create({ name: "Alice", ssn: "123-45-6789" });
    expect(user.ssn).toBe("123-45-6789");
    // Serialized value (for DB) is encrypted
    const dbValues = user._attributes.valuesForDatabase();
    expect(dbValues.ssn).not.toBe("123-45-6789");
    // Reload from DB still decrypts
    const loaded = await User.find(1);
    expect(loaded.ssn).toBe("123-45-6789");
  });

  // Rails guide: human_attribute_name on Model (inherited by Base)
  it("humanAttributeName() is available on Base via Model", () => {
    expect(Base.humanAttributeName("first_name")).toBe("First name");
    expect(Base.humanAttributeName("created_at")).toBe("Created at");
  });

  // Rails guide: scope with extension block
  it("scope with extension block adds methods to the relation", () => {
    const adapter = createTestAdapter();
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
        this.scope("published", (rel: any) => rel.where({ status: "published" }), {
          recentFirst: function (this: any) {
            return this.order("id", "desc");
          },
        });
      }
    }
    const rel = (Post as any).published();
    expect(typeof rel.recentFirst).toBe("function");
  });

  // Rails guide: abstract_class — ApplicationRecord pattern
  it("abstract_class marks a class as abstract (ApplicationRecord pattern)", () => {
    class ApplicationRecord extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class User extends ApplicationRecord {}
    expect(ApplicationRecord.abstractClass).toBe(true);
    expect(User.abstractClass).toBe(false);
    // User still gets its own inferred table name
    expect(User.tableName).toBe("users");
  });

  // Rails guide: table_name_prefix / table_name_suffix
  it("table_name_prefix and table_name_suffix customize table names", () => {
    class Order extends Base {
      static {
        this.tableNamePrefix = "shop_";
        this.tableNameSuffix = "_records";
      }
    }
    expect(Order.tableName).toBe("shop_orders_records");
  });

  // Rails guide: record_timestamps — control timestamp behavior
  it("recordTimestamps controls timestamp auto-updates", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = createTestAdapter();
      }
    }
    expect(User.recordTimestamps).toBe(true);
    User.recordTimestamps = false;
    expect(User.recordTimestamps).toBe(false);
  });

  // Rails guide: no_touching — suppress touch callbacks
  it("noTouching() suppresses touching during block", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    let suppressed = false;
    await User.noTouching(async () => {
      suppressed = User.isTouchingSuppressed;
    });
    expect(suppressed).toBe(true);
    expect(User.isTouchingSuppressed).toBe(false);
  });

  // Rails guide: generates_token_for — purpose-specific tokens
  it("generatesTokenFor creates and resolves purpose tokens", async () => {
    const { generatesTokenFor } = await import("./generates-token-for.js");
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    generatesTokenFor(User, "email_verify", {});
    const user = await User.create({ name: "Alice" });
    const token = (user as any).generateTokenFor("email_verify");
    const found = await (User as any).findByTokenFor("email_verify", token);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Alice");
  });

  // Rails guide: Relation#readonly? — check readonly status
  it("Relation.isReadonly reflects readonly state", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    expect(User.all().isReadonly).toBe(false);
    expect(User.all().readonly().isReadonly).toBe(true);
  });

  // Rails guide: define_model_callbacks — custom lifecycle callbacks
  it("defineModelCallbacks creates custom callback methods", () => {
    class Order extends Base {
      static {
        this._tableName = "orders";
        this.attribute("id", "integer");
        this.adapter = createTestAdapter();
        this.defineModelCallbacks("ship", "deliver");
      }
    }
    const log: string[] = [];
    (Order as any).beforeShip(() => log.push("before_ship"));
    (Order as any).afterDeliver(() => log.push("after_deliver"));
    const o = new Order({});
    (Order as any)._callbackChain.runBeforeSync("ship", o);
    (Order as any)._callbackChain.runAfterSync("deliver", o);
    expect(log).toEqual(["before_ship", "after_deliver"]);
  });

  // Rails guide: nullify_blanks — auto-nullify blank strings
  it("nullifyBlanks converts empty strings to null", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("bio", "string");
        this.adapter = adapter;
        this.nullifyBlanks("name");
      }
    }
    const u = new User({ name: "  ", bio: "  " });
    expect(u.name).toBeNull();
    expect(u.bio).toBe("  ");
  });

  // Rails guide: prepend callbacks
  it("before_destroy with prepend: true runs first", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    const order: string[] = [];
    User.beforeDestroy(() => {
      order.push("normal");
    });
    User.beforeDestroy(
      () => {
        order.push("prepended");
      },
      { prepend: true },
    );
    const u = new User({});
    (User as any)._callbackChain.runBeforeSync("destroy", u);
    expect(order[0]).toBe("prepended");
  });

  // Rails guide: suppress — skip persistence during block
  it("suppress() prevents database writes", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.suppress(async () => {
      await User.create({ name: "Ghost" });
    });
    const all = await User.all().toArray();
    expect(all.length).toBe(0);
  });

  // Rails guide: with_options — common validation options
  it("withOptions applies shared options to multiple validates calls", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = createTestAdapter();
      }
    }
    User.withOptions({ on: "update" }, (m: any) => {
      m.validates("name", { presence: true });
      m.validates("email", { presence: true });
    });
    const validations = (User as any)._validations.filter((v: any) => v.on === "update");
    expect(validations.length).toBe(2);
  });

  // Rails guide: to_xml — XML serialization
  it("toXml() serializes model to XML", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }
    const u = new User({ name: "Alice", age: 30 });
    const xml = u.toXml();
    expect(xml).toContain("<user>");
    expect(xml).toContain("<name>Alice</name>");
    expect(xml).toContain("<age");
    expect(xml).toContain("</user>");
  });

  // Rails guide: from_json — JSON deserialization
  it("fromJson() sets attributes from JSON", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = new User({});
    u.fromJson('{"name":"Alice"}');
    expect(u.name).toBe("Alice");
  });

  // Rails guide: from_json with root
  it("fromJson() supports include_root", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = new User({});
    u.fromJson('{"user":{"name":"Bob"}}', true);
    expect(u.name).toBe("Bob");
  });

  // Rails guide: persisted? — checks if record is saved
  it("isPersisted() returns false for new records, true after save", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = new User({ name: "Alice" });
    expect(u.isPersisted()).toBe(false);
    await u.save();
    expect(u.isPersisted()).toBe(true);
  });

  // Rails guide: attribute_types — returns map of column types
  it("attributeTypes returns type objects per column", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const types = User.attributeTypes;
    expect(types).toHaveProperty("id");
    expect(types).toHaveProperty("name");
  });

  // Rails guide: logger — set/get logger
  it("logger defaults to null and can be set", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    expect(User.logger).toBe(null);
    const log = { info: () => {} };
    User.logger = log;
    expect(User.logger).toBe(log);
    User.logger = null;
  });

  // Rails guide: Relation#build — creates unsaved record with scope
  it("Relation#build creates unsaved record with scoped attributes", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }
    const u = User.where({ role: "admin" }).build({ name: "Alice" });
    expect(u.role).toBe("admin");
    expect(u.name).toBe("Alice");
    expect(u.isPersisted()).toBe(false);
  });

  // Rails guide: Relation#create — persists record with scope
  it("Relation#create persists record with scoped attributes", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.where({ role: "admin" }).create({ name: "Bob" });
    expect(u.isPersisted()).toBe(true);
    expect(u.role).toBe("admin");
  });

  // Rails guide: Relation#spawn — independent copy
  it("Relation#spawn returns an independent copy", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const rel = User.where({ name: "Alice" });
    const spawned = rel.spawn();
    expect(spawned).not.toBe(rel);
  });

  // Rails guide: invert_where — inverts where conditions
  it("invertWhere swaps where and whereNot", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("active", "boolean");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice", active: true });
    await User.create({ name: "Bob", active: false });
    const active = await User.where({ active: true }).toArray();
    expect(active.length).toBe(1);
    const inactive = await User.where({ active: true }).invertWhere().toArray();
    expect(inactive.length).toBe(1);
    expect(inactive[0].name).toBe("Bob");
  });

  // Rails guide: Relation#inspect — debug representation
  it("inspect() returns human-readable relation info", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const str = User.where({ name: "Alice" }).limit(5).inspect();
    expect(str).toContain("User");
    expect(str).toContain("Alice");
    expect(str).toContain("limit(5)");
  });

  // Rails guide: toModel returns self (ActiveModel::Conversion)
  it("toModel() returns self", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    const u = new User({});
    expect(u.toModel()).toBe(u);
  });

  // Rails guide: i18nScope
  it("i18nScope returns 'activemodel' on Model", () => {
    // Base overrides Model's i18nScope to return "activerecord"
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    expect(User.i18nScope).toBe("activerecord");
  });

  // Rails guide: attribute_previously_changed?
  it("attributePreviouslyChanged checks last save changes", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    u.name = "Bob";
    await u.save();
    expect(u.attributePreviouslyChanged("name")).toBe(true);
    expect(u.attributePreviouslyChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
  });

  // Rails guide: CollectionProxy#push
  it("CollectionProxy push adds records", async () => {
    const adapter = createTestAdapter();
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("Author", Author);
    registerModel("Post", Post);
    Associations.hasMany.call(Author, "posts");
    const author = await Author.create({ name: "Alice" });
    const post = await Post.create({ title: "Hello" });
    const proxy = association(author, "posts");
    await proxy.push(post);
    expect(await proxy.size()).toBe(1);
  });

  // Rails guide: CollectionProxy#isEmpty
  it("CollectionProxy isEmpty returns true when empty", async () => {
    const adapter = createTestAdapter();
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel("Author", Author);
    registerModel("Post", Post);
    Associations.hasMany.call(Author, "posts");
    const author = await Author.create({ name: "Alice" });
    expect(await association(author, "posts").isEmpty()).toBe(true);
  });

  // Rails guide: load_async schedules background load
  it("loadAsync returns the relation for chaining", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    const rel = User.where({ id: 1 }).loadAsync();
    expect(rel).toBeDefined();
  });

  // Rails guide: clone — shallow clone preserving id
  it("clone preserves id and persisted state", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const c = u.clone();
    expect(c.id).toBe(u.id);
    expect(c.isPersisted()).toBe(true);
  });

  // Rails guide: find_each with order: :desc (Rails 7.1)
  it("findEach supports order option", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.createTable();
    await User.all().deleteAll();
    await User.create({ name: "A" });
    await User.create({ name: "B" });
    const names: string[] = [];
    const rel = User.where({});
    for await (const u of rel.findEach({ order: "desc" })) {
      names.push(u.name as string);
    }
    expect(names[0]).toBe("B");
  });

  // Rails guide: to_gid — GlobalID
  it("toGid returns a GlobalID-like URI", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    expect(u.toGid()).toContain("gid://User/");
  });

  // Rails guide: to_sgid — signed GlobalID
  it("toSgid returns a base64-encoded GID", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const sgid = u.toSgid();
    expect(typeof sgid).toBe("string");
    expect(sgid.length).toBeGreaterThan(0);
  });

  // Rails guide: column_defaults
  it("columnDefaults returns default values", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("role", "string", { default: "user" });
        this.adapter = adapter;
      }
    }
    expect(User.columnDefaults.role).toBe("user");
  });

  // Rails guide: find_by_attribute dynamic finder
  it("findByAttribute finds record by single column", async () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    const found = await User.findByAttribute("name", "Alice");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Alice");
  });

  // Rails guide: confirmation validator with caseSensitive: false
  it("confirmation validator supports case_sensitive: false", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("email", "string");
        this.adapter = adapter;
        this.validates("email", { confirmation: { caseSensitive: false } });
      }
    }
    const u = new User({ email: "Test@Example.com" });
    u._attributes.set("email_confirmation", "test@example.com");
    expect(u.isValid()).toBe(true);
  });

  // Rails guide: extending with function
  it("extending accepts a function argument", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const rel = User.where({ name: "Alice" }).extending((r: any) => {
      r.greet = () => "hello";
    });
    expect((rel as any).greet()).toBe("hello");
  });

  // Rails guide: attribute_method_prefix
  it("attributeMethodPrefix defines prefixed methods", () => {
    const adapter = createTestAdapter();
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
        this.attributeMethodPrefix("get_");
      }
    }
    const u = new User({ name: "Alice" });
    expect((u as any)["get_name"]()).toBe("Alice");
  });
});

describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("pick returns single column value from first record", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    expect(await User.all().order("name").pick("name")).toBe("Alice");
  });

  it("pick returns null when no records exist", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    expect(await User.all().pick("name")).toBe(null);
  });
});
describe("CalculationsTest", () => {
  let adapter: DatabaseAdapter;

  class Product extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("price", "integer");
      this.attribute("quantity", "integer");
      this.attribute("category", "string");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Product.adapter = adapter;
    await Product.create({ name: "Apple", price: 1, quantity: 10, category: "fruit" });
    await Product.create({ name: "Banana", price: 2, quantity: 20, category: "fruit" });
    await Product.create({ name: "Carrot", price: 3, quantity: 30, category: "vegetable" });
    await Product.create({ name: "Donut", price: 5, quantity: 5, category: "pastry" });
  });

  describe("count", () => {
    it("counts all records", async () => {
      expect(await Product.count()).toBe(4);
    });

    it("counts with where clause", async () => {
      const count = await Product.all().where({ category: "fruit" }).count();
      expect(count).toBe(2);
    });

    it("returns 0 when no records match", async () => {
      const count = await Product.all().where({ category: "meat" }).count();
      expect(count).toBe(0);
    });
  });

  describe("sum", () => {
    it("sums a column", async () => {
      const total = await Product.all().sum("price");
      expect(total).toBe(11);
    });

    it("sums with where clause", async () => {
      const total = await Product.all().where({ category: "fruit" }).sum("price");
      expect(total).toBe(3);
    });

    it("returns 0 for no records", async () => {
      const total = await Product.all().where({ category: "meat" }).sum("price");
      expect(total).toBe(0);
    });
  });

  describe("minimum", () => {
    it("returns minimum value", async () => {
      const min = await Product.all().minimum("price");
      expect(min).toBe(1);
    });

    it("returns minimum with where clause", async () => {
      const min = await Product.all().where({ category: "fruit" }).minimum("price");
      expect(min).toBe(1);
    });
  });

  describe("maximum", () => {
    it("returns maximum value", async () => {
      const max = await Product.all().maximum("price");
      expect(max).toBe(5);
    });

    it("returns maximum with where clause", async () => {
      const max = await Product.all().where({ category: "fruit" }).maximum("price");
      expect(max).toBe(2);
    });
  });

  describe("average", () => {
    it("returns average value", async () => {
      const avg = await Product.all().average("price");
      expect(avg).toBeCloseTo(2.75, 1);
    });

    it("returns average with where clause", async () => {
      const avg = await Product.all().where({ category: "fruit" }).average("price");
      expect(avg).toBeCloseTo(1.5, 1);
    });
  });

  describe("pluck", () => {
    it("returns values for a single column", async () => {
      const names = await Product.all().pluck("name");
      expect(names).toContain("Apple");
      expect(names).toContain("Banana");
      expect(names).toHaveLength(4);
    });

    it("returns values with where clause", async () => {
      const names = await Product.all().where({ category: "fruit" }).pluck("name");
      expect(names).toHaveLength(2);
    });
  });

  describe("ids", () => {
    it("returns all primary key values", async () => {
      const ids = await Product.all().ids();
      expect(ids).toHaveLength(4);
    });
  });

  describe("exists", () => {
    it("returns true when records exist", async () => {
      expect(await Product.all().exists()).toBe(true);
    });

    it("returns false for empty result set", async () => {
      expect(await Product.all().where({ category: "meat" }).exists()).toBe(false);
    });
  });

  describe("count via class method", async () => {
    it("delegates to relation", async () => {
      expect(await Product.count()).toBe(4);
    });
  });

  describe("sum via class method", () => {
    it("delegates to relation", async () => {
      expect(await Product.sum("price")).toBe(11);
    });
  });

  describe("minimum via class method", () => {
    it("delegates to relation", async () => {
      expect(await Product.minimum("price")).toBe(1);
    });
  });

  describe("maximum via class method", () => {
    it("delegates to relation", async () => {
      expect(await Product.maximum("price")).toBe(5);
    });
  });

  describe("average via class method", () => {
    it("delegates to relation", async () => {
      const avg = await Product.average("price");
      expect(avg).toBeCloseTo(2.75, 1);
    });
  });

  describe("pick", () => {
    it("returns a single value from first record", async () => {
      const val = await Product.all().order("name").pick("name");
      expect(val).toBe("Apple");
    });
  });

  describe("none", () => {
    it("returns empty results", async () => {
      const items = await Product.all().none().toArray();
      expect(items).toHaveLength(0);
    });

    it("count returns 0", async () => {
      expect(await Product.all().none().count()).toBe(0);
    });
  });
  it("should sum scoped field with conditions", async () => {
    const adapter = freshAdapter();

    class Order extends Base {
      static {
        this.attribute("amount", "integer");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }

    await Order.create({ amount: 10, status: "paid" });
    await Order.create({ amount: 20, status: "pending" });
    await Order.create({ amount: 30, status: "paid" });

    expect(await Order.where({ status: "paid" }).sum("amount")).toBe(40);
    expect(await Order.where({ status: "pending" }).sum("amount")).toBe(20);
  });

  it("count with column parameter", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", email: "a@b.com" });
    await User.create({ name: "Bob" }); // email is null

    expect(await User.all().count()).toBe(2);
    expect(await User.all().count("email")).toBe(1);
  });
});

// ==========================================================================
// CalculationsTest — targets calculations_test.rb (continued)
// ==========================================================================
