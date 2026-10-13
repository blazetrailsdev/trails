import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base, registerModel } from "../../index.js";
import { Author } from "../../test-helpers/models/author.js";
import { Post } from "../../test-helpers/models/post.js";

registerModel(Author);
registerModel(Post);

fixtures(["authors", "authorAddresses"]);

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });
  afterAll(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS ex_explains CASCADE`);
  });
  describe("PostgresqlExplainTest", () => {
    it("explain for one query", async () => {
      const explain = await Author.where({ id: 1 }).explain().inspect();
      expect(explain).toMatch(
        /EXPLAIN SELECT "authors"\.\* FROM "authors" WHERE "authors"\."id" = (?:\$1 \[\["id", 1\]\]|1)/,
      );
      expect(explain).toMatch("QUERY PLAN");
    });

    it("explain with eager loading", async () => {
      const explain = await Author.where({ id: 1 }).includes(":posts").explain().inspect();
      expect(explain).toMatch("QUERY PLAN");
      expect(explain).toMatch(
        /EXPLAIN SELECT "authors"\.\* FROM "authors" WHERE "authors"\."id" = (?:\$1 \[\["id", 1\]\]|1)/,
      );
      expect(explain).toMatch(
        /EXPLAIN SELECT "posts"\.\* FROM "posts" WHERE "posts"\."author_id" = (?:\$1 \[\["author_id", 1\]\]|1)/,
      );
    });

    it("explain with options as symbols", async () => {
      class ExExplain extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      await adapter.execute(`CREATE TABLE "ex_explains" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await ExExplain.create({ name: "test" });
      const explain = await ExExplain.where({ id: 1 }).explain(":analyze", ":buffers").inspect();
      expect(explain).toMatch(
        /EXPLAIN \(ANALYZE, BUFFERS\) SELECT "ex_explains"\.\* FROM "ex_explains" WHERE "ex_explains"\."id" = (?:\$1 \[\["id", 1\]\]|1)/,
      );
      expect(explain).toMatch(/QUERY PLAN/);
    });

    it("explain with options as strings", async () => {
      const explain = await Author.where({ id: 1 })
        .explain("VERBOSE", "ANALYZE", "FORMAT JSON")
        .inspect();
      expect(explain).toMatch(
        /EXPLAIN \(VERBOSE, ANALYZE, FORMAT JSON\) SELECT "authors"\.\* FROM "authors" WHERE "authors"\."id" = (?:\$1 \[\["id", 1\]\]|1)/,
      );
      expect(explain).toMatch("QUERY PLAN");
    });

    it("explain options with eager loading", async () => {
      const explain = await Author.where({ id: 1 })
        .includes(":posts")
        .explain(":analyze")
        .inspect();
      expect(explain).toMatch("QUERY PLAN");
      expect(explain).toMatch(
        /EXPLAIN \(ANALYZE\) SELECT "authors"\.\* FROM "authors" WHERE "authors"\."id" = (?:\$1 \[\["id", 1\]\]|1)/,
      );
      expect(explain).toMatch(
        /EXPLAIN \(ANALYZE\) SELECT "posts"\.\* FROM "posts" WHERE "posts"\."author_id" = (?:\$1 \[\["author_id", 1\]\]|1)/,
      );
    });
  });
});
