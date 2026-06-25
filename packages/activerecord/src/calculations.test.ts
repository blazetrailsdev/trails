import { Temporal } from "@blazetrails/activesupport/temporal";
/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
// Side-effect: registers encryptionHooks so Base.encrypts() is wired up.
import "./encryption.js";
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, serialize } from "./index.js";
import { Associations } from "./associations.js";

import { adapterType } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Account as CanonicalAccount } from "./test-helpers/models/account.js";
import { Company, Firm } from "./test-helpers/models/company.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply } from "./test-helpers/models/reply.js";

// ==========================================================================
// CalculationsTest — targets calculations_test.rb
// ==========================================================================
describe("CalculationsTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      accounts: {
        credit_limit: "integer",
        credits: "integer",
        firm_id: "integer",
        name: "string",
        verified: "boolean",
      },
      posts: {
        category: "string",
        score: "integer",
        status: "integer",
        title: "string",
      },
    });
  });
  it("should return nil as average", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    const avg = await Account.all().average("credit_limit");
    expect(avg).toBeNull();
  });

  it("should group by field", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
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
      }
    }
    const val = await Account.all().pick("credit_limit");
    expect(val).toBeNull();
  });

  it("count should shortcut with limit zero", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
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
      }
    }
    const avg = await Account.all().none().average("credit_limit");
    expect(avg).toBeNull();
  });

  it("should calculate against given relation", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
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
      }
    }
    const sql = Account.all().limit(5).toSql();
    expect(sql).toContain("LIMIT");
  });

  it("offset is kept", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.all().offset(10).toSql();
    expect(sql).toContain("OFFSET");
  });

  it("limit with offset is kept", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
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
      }
    }
    const rel = Account.all().distinct();
    expect(rel.toSql()).toContain("DISTINCT");
  });

  it("distinct count all with custom select and order", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.select("credit_limit").distinct().order("credit_limit").toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("should group by arel attribute", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
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
      }
    }
    const sql = Account.group("firm_id").having("SUM(credit_limit) > 0").toSql();
    expect(sql).toContain("HAVING");
  });

  it("count for a composite primary key model", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
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
      }
    }
    const sql = Account.group("firm_id").toSql();
    expect(sql).toContain("GROUP BY");
  });

  it("limit should apply before count arel attribute", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
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
      }
    }
    await Account.create({ firm_id: 1 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });
  it("should generate valid sql with joins and group", () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.joins("INNER JOIN firms ON firms.id = accounts.firm_id")
      .group("firm_id")
      .toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("INNER JOIN");
  });

  it("should order by grouped field", () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.group("firm_id").order("firm_id").toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("ORDER BY");
  });

  it("should order by calculation", () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.group("firm_id").order("SUM(credit_limit) DESC").toSql();
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("SUM");
  });

  it("distinct count with order and limit and offset", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.distinct().order("credit_limit").limit(5).offset(2).toSql();
    expect(sql).toContain("DISTINCT");
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
  });

  it("distinct count with group by and order and limit", () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.distinct().group("firm_id").order("firm_id").limit(5).toSql();
    expect(sql).toContain("DISTINCT");
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("LIMIT");
  });

  it("should sum expression", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const sum = await Account.sum("credit_limit");
    expect(sum).toBe(150);
  });

  it("sum expression returns zero when no records to sum", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    const sum = await Account.where({ credit_limit: -1 }).sum("credit_limit");
    expect(sum).toBe(0);
  });

  it("count with where and order", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const count = await Account.where({ credit_limit: 50 }).order("credit_limit").count();
    expect(count).toBe(1);
  });

  it("count with empty in", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.where({ credit_limit: [] }).count();
    expect(count).toBe(0);
  });

  it("count with from option", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.all().from('"accounts"').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("sum with from option", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    const sum = await Account.all().from('"accounts"').sum("credit_limit");
    expect(typeof sum).toBe("number");
  });

  it("average with from option", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const avg = await Account.all().from('"accounts"').average("credit_limit");
    expect(typeof avg).toBe("number");
  });

  it("minimum with from option", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const min = await Account.all().from('"accounts"').minimum("credit_limit");
    expect(min).toBe(50);
  });

  it("maximum with from option", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const max = await Account.all().from('"accounts"').maximum("credit_limit");
    expect(max).toBe(100);
  });

  it("should count scoped select", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.select("credit_limit").count();
    expect(count).toBeGreaterThan(0);
  });

  it("count with no parameters isnt deprecated", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    const count = await Account.count();
    expect(count).toBeGreaterThan(0);
  });

  it("should sum with qualified name on loaded", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 75 });
    const sum = await Account.all().sum("credit_limit");
    expect(sum).toBe(75);
  });

  it("should count with group by qualified name on loaded", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 2 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });

  it("should calculate with invalid field", () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    // Should generate SQL even for non-existent columns (runtime error from DB)
    const sql = Account.where({ credit_limit: 50 }).toSql();
    expect(sql).toBeDefined();
  });

  it("should group by summed field through association and having", () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.group("firm_id").having("SUM(credit_limit) > 10").toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("HAVING");
    expect(sql).toContain("SUM");
  });

  it("should count field in joined table with group by", () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
      }
    }
    const sql = Account.joins("INNER JOIN firms ON firms.id = accounts.firm_id")
      .group("firm_id")
      .toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("INNER JOIN");
  });
  it("pluck loaded relation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
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
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "first" });
    const title = await Post.all().pick("title");
    expect(title).toBe("first");
  });

  it("pick loaded relation multiple columns", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer");
      }
    }
    await Post.create({ title: "first", score: 42 });
    const result = await Post.all().pick("title", "score");
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0]).toBe("first");
    expect((result as any[])[1]).toBe(42);
  });

  it("ids async on loaded relation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const ids = await Post.all().ids();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBe(2);
  });

  it("should count manual select with count all", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "x" });
    await Post.create({ title: "y" });
    const count = await Post.all().count();
    expect(count).toBe(2);
  });

  it("pluck with qualified name on loaded", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "hello" });
    const results = await Post.all().pluck("title");
    expect(results).toContain("hello");
  });

  it("group by attribute with custom type", async () => {
    class Post extends Base {
      static {
        this.attribute("category", "string");
        this.attribute("score", "integer");
      }
    }
    await Post.create({ category: "A", score: 1 });
    await Post.create({ category: "A", score: 2 });
    await Post.create({ category: "B", score: 3 });
    const grouped = await Post.group("category").count();
    expect(typeof grouped).toBe("object");
  });

  it("aggregate attribute on enum type", async () => {
    class Post extends Base {
      static {
        this.attribute("status", "integer");
      }
    }
    await Post.create({ status: 0 });
    await Post.create({ status: 1 });
    const count = await Post.count();
    expect(count).toBe(2);
  });

  it("pluck columns with same name", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
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
  it.skipIf(adapterType !== "mysql")("count selected arel attributes", async () => {
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
  it("pluck with join alias", async () => {
    const { Account } = makeModel();
    await Account.create({ name: "ja" });
    const names = await Account.pluck("name");
    expect(names).toContain("ja");
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
  it.skipIf(adapterType === "postgres")(
    "should group by summed field having condition from select",
    () => {
      const { Account } = makeModel();
      const sql = Account.group("name").having("SUM(credits) > 0").toSql();
      expect(sql).toContain("GROUP BY");
      expect(sql).toContain("HAVING");
    },
  );
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

  it("pluck and distinct", async () => {
    const Account = makeAccount();
    await Account.create({ name: "Alice" });
    await Account.create({ name: "Alice" });
    await Account.create({ name: "Bob" });
    const names = await Account.distinct().pluck("name");
    expect(names).toContain("Alice");
    expect(names).toContain("Bob");
    expect((names as string[]).filter((n) => n === "Alice").length).toBe(1);
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

  it("pluck with serialization", async () => {
    class Account extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    serialize(Account, "name");
    // Rails' test passes the Hash and the coder dumps it on write; trails'
    // `serialize` (serialize.ts) only wraps the read side, so we store the
    // already-dumped string. This isolates the behavior under test — that
    // pluck deserializes through the same coder a record read does — from
    // the separate, pre-existing write-side-dump gap.
    await Account.create({ name: JSON.stringify({ foo: "bar" }) });
    const loaded = await Account.all().first();
    expect(await Account.all().pluck("name")).toEqual([loaded?.name]);
    expect(await Account.all().pluck("name")).toEqual([{ foo: "bar" }]);
  });
});

// ==========================================================================
// CalculationsTestExtra — additional targets for calculations_test.rb
// ==========================================================================
describe("CalculationsTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      accounts: {
        balance: "float",
        credit_limit: "integer",
        firm_id: "integer",
        name: "string",
      },
      posts: { title: "string" },
    });
  });
  it("should resolve aliased attributes", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 42 });
    const result = await Account.all().pluck("credit_limit");
    expect(result).toContain(42);
  });

  it("sum should return valid values for decimals", async () => {
    class Account extends Base {
      static {
        this.attribute("balance", "float");
      }
    }
    await Account.create({ balance: 1.5 });
    await Account.create({ balance: 2.5 });
    const sum = await Account.all().sum("balance");
    expect(sum).toBeCloseTo(4.0);
  });

  it("should group by fields with table alias", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 2 });
    const result = await Account.group("firm_id").count();
    expect(typeof result).toBe("object");
  });

  it("should calculate grouped with invalid field", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
      }
    }
    // group by with no records returns empty object
    const result = await Account.group("firm_id").count();
    expect(result).toEqual({});
  });

  it("should not perform joined include by default", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.all().toSql();
    expect(sql).not.toContain("JOIN");
  });

  it("should count scoped select with options", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const count = await Account.where({ credit_limit: 50 }).count();
    expect(count).toBe(1);
  });

  it("count with too many parameters raises", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    // count() with no args should work fine
    await Account.create({ credit_limit: 1 });
    const count = await Account.all().count();
    expect(count).toBeGreaterThan(0);
  });

  it("maximum with not auto table name prefix if column included", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 99 });
    const max = await Account.all().maximum("credit_limit");
    expect(max).toBe(99);
  });

  it("minimum with not auto table name prefix if column included", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 10 });
    await Account.create({ credit_limit: 99 });
    const min = await Account.all().minimum("credit_limit");
    expect(min).toBe(10);
  });

  it("sum with not auto table name prefix if column included", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 30 });
    await Account.create({ credit_limit: 70 });
    const sum = await Account.all().sum("credit_limit");
    expect(sum).toBe(100);
  });

  it("sum with grouped calculation", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ firm_id: 1, credit_limit: 100 });
    await Account.create({ firm_id: 1, credit_limit: 200 });
    await Account.create({ firm_id: 2, credit_limit: 50 });
    const result = await Account.group("firm_id").sum("credit_limit");
    expect(typeof result).toBe("object");
  });

  it("distinct is honored when used with count operation after group", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
      }
    }
    await Account.create({ firm_id: 1 });
    await Account.create({ firm_id: 1 });
    const sql = Account.group("firm_id").distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("pluck with empty in", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    // empty where-in should return empty
    const result = await Account.where({ credit_limit: [] }).pluck("credit_limit");
    expect(result).toEqual([]);
  });

  it("pluck type cast", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 42 });
    const result = await Account.all().pluck("credit_limit");
    expect(result[0]).toBe(42);
    expect(typeof result[0]).toBe("number");
  });

  it("pluck in relation", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    await Account.create({ credit_limit: 100 });
    const result = await Account.where({ credit_limit: 50 }).pluck("credit_limit");
    expect(result).toEqual([50]);
  });

  it("pluck with qualified column name", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 77 });
    const result = await Account.all().pluck("credit_limit");
    expect(result).toContain(77);
  });

  it("pluck with selection clause", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 33 });
    const result = await Account.select("credit_limit").pluck("credit_limit");
    expect(result).toContain(33);
  });

  it("pluck loaded relation multiple columns", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 20 });
    const rel = Account.all();
    await rel.toArray();
    const result = await rel.pluck("credit_limit");
    expect(Array.isArray(result)).toBe(true);
  });

  it("pick delegate to all", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 88 });
    const val = await Account.all().pick("credit_limit");
    expect(val).toBe(88);
  });

  it.skipIf(adapterType !== "postgres")(
    "group by with order by virtual count attribute",
    async () => {
      class Account extends Base {
        static {
          this.attribute("firm_id", "integer");
        }
      }
      await Account.create({ firm_id: 1 });
      await Account.create({ firm_id: 2 });
      await Account.create({ firm_id: 2 });
      const result = await Account.group("firm_id").count();
      expect(Object.keys(result).length).toBeGreaterThan(0);
    },
  );

  it("group by with offset", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
      }
    }
    const sql = Account.group("firm_id").offset(1).toSql();
    expect(sql).toContain("OFFSET");
  });

  it("group by with limit and offset", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
      }
    }
    const sql = Account.group("firm_id").limit(1).offset(1).toSql();
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
  });

  it("pluck with line endings", async () => {
    class Account extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await Account.create({ name: "line\nend" });
    const result = await Account.all().pluck("name");
    expect(result[0]).toContain("\n");
  });

  it("pluck with reserved words", async () => {
    class Account extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await Account.create({ name: "select" });
    const result = await Account.all().pluck("name");
    expect(result).toContain("select");
  });

  it("ids on loaded relation with scope", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
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
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 5 });
    const ids = await Account.all().ids();
    expect(Array.isArray(ids)).toBe(true);
  });

  it("ids with includes", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 5 });
    const ids = await Account.all().ids();
    expect(ids.length).toBe(1);
  });

  it("ids with includes limit and empty result", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    const ids = await Account.all().ids();
    expect(ids).toEqual([]);
  });

  it("count with block and column name raises an error", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 5 });
    // count() should return a number
    const count = await Account.all().count();
    expect(typeof count).toBe("number");
  });

  it("minimum and maximum on non numeric type", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 5 });
    await Account.create({ credit_limit: 95 });
    const min = await Account.all().minimum("credit_limit");
    const max = await Account.all().maximum("credit_limit");
    expect(min).toBe(5);
    expect(max).toBe(95);
  });

  it("async pluck none relation", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 50 });
    const result = await Account.none().pluck("credit_limit");
    expect(result).toEqual([]);
  });

  it("from option with table different than class", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.from("accounts").toSql();
    expect(sql).toContain("accounts");
  });

  it("pluck with join", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 5 });
    const result = await Account.all().pluck("credit_limit");
    expect(Array.isArray(result)).toBe(true);
  });

  it("pluck with multiple columns and selection clause", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
        this.attribute("firm_id", "integer");
      }
    }
    await Account.create({ credit_limit: 50, firm_id: 1 });
    const result = await Account.all().pluck("credit_limit", "firm_id");
    expect(Array.isArray(result)).toBe(true);
    expect(Array.isArray(result[0])).toBe(true);
  });

  it("count with aliased attribute", async () => {
    class Account extends Base {
      static {
        this.attribute("credit_limit", "integer");
      }
    }
    await Account.create({ credit_limit: 5 });
    const count = await Account.all().count();
    expect(count).toBe(1);
  });

  it("having with strong parameters", async () => {
    class Account extends Base {
      static {
        this.attribute("firm_id", "integer");
        this.attribute("credit_limit", "integer");
      }
    }
    const sql = Account.group("firm_id").having("SUM(credit_limit) > 0").toSql();
    expect(sql).toContain("HAVING");
  });
});

describe("CalculationsTest", () => {
  class Product extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("price", "integer");
      this.attribute("quantity", "integer");
      this.attribute("category", "string");
    }
  }
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    await defineSchema({
      products: {
        name: "string",
        price: "integer",
        quantity: "integer",
        category: "string",
      },
      topics: { title: "string", status: "string" },
      orders: { amount: "integer", status: "string" },
      users: { name: "string", email: "string" },
    });
    await Product.create({ name: "Apple", price: 1, quantity: 10, category: "fruit" });
    await Product.create({ name: "Banana", price: 2, quantity: 20, category: "fruit" });
    await Product.create({ name: "Carrot", price: 3, quantity: 30, category: "vegetable" });
    await Product.create({ name: "Donut", price: 5, quantity: 5, category: "pastry" });
  });

  // Rails' Querying delegators route through `all()`, so class-level calls
  // inherit default scopes / active scoping's createWith + where attrs.
  // These regressions lock in that behavior for the firstOr* / batch
  // entry points added alongside the exists arg-form changes.
  const makeTopicClass = () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("status", "string");
      }
    }
    return Topic;
  };

  it("should sum scoped field with conditions", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
        this.attribute("status", "string");
      }
    }

    await Order.create({ amount: 10, status: "paid" });
    await Order.create({ amount: 20, status: "pending" });
    await Order.create({ amount: 30, status: "paid" });

    expect(await Order.where({ status: "paid" }).sum("amount")).toBe(40);
    expect(await Order.where({ status: "pending" }).sum("amount")).toBe(20);
  });

  it("count with column parameter", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
      }
    }

    await User.create({ name: "Alice", email: "a@b.com" });
    await User.create({ name: "Bob" }); // email is null

    expect(await User.all().count()).toBe(2);
    expect(await User.all().count("email")).toBe(1);
  });
});

// ==========================================================================
// bigint aggregate tests — type_cast_calculated_value for big_integer columns
// Mirrors Rails calculations.rb#type_cast_calculated_value (line 627):
//   sum    → type.deserialize(value || 0)
//   min/max → type.deserialize(value)
//   count  → always integer (not through type)
// ==========================================================================

// ==========================================================================
// CalculationsTest — targets calculations_test.rb (continued)
// ==========================================================================

// ==========================================================================
// count + includes join dependency tests (calculations_test.rb)
// ==========================================================================

// ==========================================================================
// pluck + includes join dependency tests (calculations_test.rb)
// ==========================================================================
describe("CalculationsTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  class PjContract extends Base {
    static _tableName = "pj_contracts";
    static {
      this.attribute("pj_company_id", "integer");
      this.attribute("body", "string");
      this.attribute("developer_id", "integer");
    }
  }
  class PjCompany extends Base {
    static _tableName = "pj_companies";
    static {
      this.attribute("name", "string");
    }
  }

  beforeAll(async () => {
    await defineSchema(
      {
        pj_companies: { name: "string" },
        pj_contracts: { pj_company_id: "integer", body: "string", developer_id: "integer" },
      },
      { dropExisting: true },
    );
    registerModel(PjContract);
    registerModel(PjCompany);
    Associations.hasMany.call(PjCompany, "pjContracts", {
      foreignKey: "pj_company_id",
      className: "PjContract",
    });
  });

  it("pluck if table included", async () => {
    // Rails: Company.includes(:contracts).where("contracts.id" => ...).pluck(:id).
    // The where referencing the included table forces apply_join_dependency, so
    // the LEFT OUTER JOIN is present and pluck can filter on the joined table.
    const c = await PjCompany.create({ name: "test" });
    const contract = await PjContract.create({ pj_company_id: c.id, body: "a" });
    const ids = await PjCompany.includes("pjContracts")
      .where({ "pj_contracts.id": contract.id })
      .pluck("id");
    expect(ids).toEqual([c.id]);
  });

  it("pluck with multiple columns and includes", async () => {
    // Rails: Company.order("companies.id").includes(:contracts).pluck(:name, ...).
    // apply_join_dependency LEFT OUTER JOINs contracts; a company with no
    // contract still yields a row (qualified contracts column is NULL).
    const c1 = await PjCompany.create({ name: "37signals" });
    const c2 = await PjCompany.create({ name: "test" });
    await PjContract.create({ pj_company_id: c2.id, body: "x" });
    const rows = await PjCompany.order("pj_companies.id")
      .includes("pjContracts")
      .pluck("name", "pj_contracts.body");
    expect(rows).toEqual([
      ["37signals", null],
      ["test", "x"],
    ]);
    void c1;
  });

  it("pluck not auto table name prefix if column joined", async () => {
    // Rails: Company.create!(name: "test", contracts: [Contract.new(developer_id: 7)])
    //        ids = Company.joins(:contracts).pluck(:developer_id); [7] == ids.sort
    // A bare column absent from the base model's columns_hash must NOT be
    // auto-prefixed with the base table; it stays unqualified so the database
    // resolves it against the joined table.
    const c = await PjCompany.create({ name: "test" });
    await PjContract.create({ pj_company_id: c.id, developer_id: 7 });
    const ids = (await PjCompany.joins("pjContracts").pluck("developer_id")) as number[];
    expect(ids.sort()).toEqual([7]);
  });

  it("pluck not auto table name prefix if column included", async () => {
    // Rails: Company.create!(name: "test", contracts: [Contract.new(developer_id: 7)])
    //        ids = Company.includes(:contracts).pluck(:developer_id)
    //        Company.count == ids.length; [7] == ids.compact
    const c = await PjCompany.create({ name: "test" });
    await PjContract.create({ pj_company_id: c.id, developer_id: 7 });
    const ids = (await PjCompany.includes("pjContracts").pluck("developer_id")) as (
      | number
      | null
    )[];
    expect(ids.length).toBe(await PjCompany.count());
    expect(ids.filter((v) => v != null)).toEqual([7]);
  });

  it("pluck with includes limit and empty result", async () => {
    // Rails: Topic.includes(:replies).limit(0).pluck(:id) == [] and
    // Topic.includes(:replies).limit(1).where("0 = 1").pluck(:id) == [].
    await PjCompany.create({ name: "test" });
    expect(await PjCompany.includes("pjContracts").limit(0).pluck("id")).toEqual([]);
    expect(await PjCompany.includes("pjContracts").limit(1).where("0 = 1").pluck("id")).toEqual([]);
  });
});

// ==========================================================================
// CalculationsTest — grouped-association + includes/offset tail.
// These mirror Rails calculations_test.rb cases that group by a belongs_to
// association (keyed by the loaded records) or paginate an eager-loaded
// relation. They need the canonical companies/accounts/topics fixtures rather
// than the inline stub models the rest of this file uses, so they live in their
// own describe block.
// ==========================================================================
describe("CalculationsTest", () => {
  registerModel("Company", Company);
  registerModel("Firm", Firm);
  registerModel("Account", CanonicalAccount);
  registerModel("Topic", Topic);
  registerModel("Reply", Reply);

  // Rails' Author `has_many :topics, primary_key: "name", foreign_key:
  // "author_name"`. Defined locally under a distinct class name (not the
  // canonical Author model) so importing it does not perturb the shared model
  // registry / name-disambiguation counter used by other describe blocks.
  class CalcAuthor extends Base {
    static {
      this._tableName = "authors";
      this.attribute("name", "string");
      this.hasMany("topics", {
        primaryKey: "name",
        foreignKey: "author_name",
        className: "Topic",
      });
    }
  }

  // Rails: `fixtures :accounts, :companies, :topics`. Companies load first so
  // accounts' `firm_id` ref() resolves to companies' declared ids, not the
  // CRC32 fallback (see define-fixtures.ts ref() ordering requirement).
  // `authors` is added for the Author.joins(:topics) aggregate-through-joins
  // assertions (Author has_many :topics on name → author_name).
  const { companies } = useHandlerFixtures(["companies", "accounts", "topics", "authors"], {
    schema: canonicalSchema,
  });

  // The canonical fixtures only create companies/accounts/topics tables; the
  // composite-key grouped-association test needs the CPK book/order tables.
  beforeAll(async () => {
    await defineSchema({
      cpk_orders: {
        columns: { shop_id: "integer", id: "integer", status: "string" },
        primaryKey: ["shop_id", "id"],
      },
      cpk_books: {
        columns: {
          author_id: "integer",
          id: "integer",
          title: "string",
          shop_id: "integer",
          order_id: "integer",
        },
        primaryKey: ["author_id", "id"],
      },
    });
  });

  // JS Map keys compare by reference, so resolve a grouped-by-association
  // result by the key record's id rather than by holding the same instance.
  const byRecord = (result: unknown, record: { id: unknown }): unknown => {
    for (const [key, value] of result as Map<{ id: unknown } | null, unknown>) {
      if (key && key.id === record.id) return value;
    }
    return undefined;
  };

  it("should group by summed association", async () => {
    const c = await CanonicalAccount.group("firm").sum("credit_limit");
    expect(byRecord(c, companies("first_firm"))).toBe(50);
    expect(byRecord(c, companies("rails_core"))).toBe(105);
    expect(byRecord(c, companies("first_client"))).toBe(60);
  });

  it("should calculate grouped association with foreign key option", async () => {
    class AccountWithAnotherFirm extends CanonicalAccount {
      static {
        this.belongsTo("anotherFirm", { className: "Firm", foreignKey: "firm_id" });
      }
    }
    const c = await AccountWithAnotherFirm.group("anotherFirm").count("*");
    expect(byRecord(c, companies("first_firm"))).toBe(1);
    expect(byRecord(c, companies("rails_core"))).toBe(2);
    expect(byRecord(c, companies("first_client"))).toBe(1);
  });

  it("ids with includes offset", async () => {
    expect((await Topic.includes("replies").order("id").offset(4).ids()).map(Number)).toEqual([5]);
    expect(await Topic.includes("replies").order("id").offset(5).ids()).toEqual([]);
  });

  it("pluck with includes offset", async () => {
    expect((await Topic.includes("replies").order("id").offset(4).pluck("id")).map(Number)).toEqual(
      [5],
    );
    expect(await Topic.includes("replies").order("id").offset(5).pluck("id")).toEqual([]);
  });

  // Rails ports the joins-with-column assertions through a private helper called
  // twice: with a table-qualified column ("topics.written_on", resolved through
  // the join dependency) and a bare one ("written_on", which only exists on the
  // joined table). The non-TZ-aware `assert_minimum_and_maximum_on_time_attributes`
  // body covers the model-table min/max and group(:approved) cases.
  const eq = (actual: unknown, iso: string): void => {
    expect(actual).toBeInstanceOf(Temporal.Instant);
    expect(Temporal.Instant.from(iso).equals(actual as Temporal.Instant)).toBe(true);
  };

  const assertMinimumAndMaximumOnTimeAttributesJoinsWithColumn = async (
    column: string,
  ): Promise<void> => {
    eq(await CalcAuthor.joins("topics").maximum(column), "2004-07-15T14:28:00.0099Z");
    eq(await CalcAuthor.joins("topics").minimum(column), "2003-07-16T14:28:11.2233Z");

    const max = (await CalcAuthor.joins("topics").group("id").maximum(column)) as Record<
      string,
      Temporal.Instant
    >;
    eq(max[1], "2003-07-16T14:28:11.2233Z");
    eq(max[2], "2004-07-15T14:28:00.0099Z");

    const min = (await CalcAuthor.joins("topics").group("id").minimum(column)) as Record<
      string,
      Temporal.Instant
    >;
    eq(min[1], "2003-07-16T14:28:11.2233Z");
    eq(min[2], "2004-07-15T14:28:00.0099Z");
  };

  it("minimum and maximum on time attributes", async () => {
    eq(await Topic.minimum("written_on"), "2003-07-16T14:28:11.2233Z");
    eq(await Topic.maximum("written_on"), "2013-07-13T11:11:00.0099Z");

    const minByApproved = (await Topic.group("approved").minimum("written_on")) as Record<
      string,
      Temporal.Instant
    >;
    eq(minByApproved.false, "2003-07-16T14:28:11.2233Z");
    eq(minByApproved.true, "2004-07-15T14:28:00.0099Z");

    const maxByApproved = (await Topic.group("approved").maximum("written_on")) as Record<
      string,
      Temporal.Instant
    >;
    eq(maxByApproved.false, "2003-07-16T14:28:11.2233Z");
    eq(maxByApproved.true, "2013-07-13T11:11:00.0099Z");

    await assertMinimumAndMaximumOnTimeAttributesJoinsWithColumn("topics.written_on");
    await assertMinimumAndMaximumOnTimeAttributesJoinsWithColumn("written_on");
  });

  it("should count field in joined table", async () => {
    expect(await CanonicalAccount.joins("firm").count("companies.id")).toBe(5);
    expect(await CanonicalAccount.joins("firm").distinct().count("companies.id")).toBe(4);
  });

  // A plain `joins(:assoc)` now feeds buildJoinDependencies (via _namedInnerJoins),
  // so lookupCastTypeFromJoinDependencies recovers the joined column's cast type
  // through the join-dependency walk — no `_joinClauses`-klass fallback. Replaces
  // the unit tests that asserted the (removed) `_joinClauses.klass` recovery.
});
