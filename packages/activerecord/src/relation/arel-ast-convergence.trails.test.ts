import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { adapterType } from "../test-adapter.js";
import { fixtures } from "../test-fixtures.js";
import { Post as CanonicalPost } from "../test-helpers/models/post.js";

fixtures({});

class Post extends Base {
  static _tableName = "posts";
}
Post.attribute("id", "integer");
Post.attribute("author", "string");

function compile(rel: unknown): [string, unknown[]] {
  const conn = Base.connection as unknown as {
    toSqlAndBinds(arel: unknown): [string, unknown[], boolean | null, boolean];
  };
  const [sql, binds] = conn.toSqlAndBinds((rel as { arel(): unknown }).arel());
  return [sql, binds];
}

function rawSql(rel: unknown): string {
  return compile(rel)[0];
}

function bindValues(rel: unknown): unknown[] {
  return compile(rel)[1].map((b) => (b as { _value?: unknown })?._value ?? b);
}

const openQuote = adapterType === "mysql" ? "`" : '"';
const placeholder1 = adapterType === "postgres" ? "$1" : "?";
const placeholder2 = adapterType === "postgres" ? "$2" : "?";

describe("RFC 0022 arel-AST convergence (relation layer)", () => {
  describe("Relation#with with an array (UNION ALL) body", () => {
    function cteRelation() {
      return Post.with({
        posts_cte: [Post.where({ author: "alice" }), Post.where({ author: "bob" })],
      }).from("posts_cte AS posts");
    }

    it("compiles the array body as a UNION ALL CTE", () => {
      const sql = rawSql(cteRelation());
      expect(sql).toContain(`WITH ${openQuote}posts_cte${openQuote} AS`);
      expect(sql).toContain("UNION ALL");
    });

    it("threads both operand binds through one collector in order", async (ctx) => {
      ctx.skip(!(await Base.connection).preparedStatements);
      const rel = cteRelation();
      const sql = rawSql(rel);
      expect(sql).toContain(placeholder1);
      expect(sql).toContain(placeholder2);
      expect(bindValues(rel)).toEqual(["alice", "bob"]);
    });
  });

  describe("Relation#from(subquery) on the manager", () => {
    it("renders a derived-table subquery with a qualified projection", () => {
      const sub = Post.where({ author: "alice" });
      const sql = (Post.from(sub, "posts") as unknown as { toSql(): string }).toSql();
      const q = openQuote;
      expect(sql).toMatch(new RegExp(`FROM \\(SELECT .* FROM ${q}posts${q} WHERE .*\\) posts`));
      expect(sql).toContain(`SELECT ${q}posts${q}.*`);
    });

    describe("executing through Relation#pluck", () => {
      fixtures(["posts"]);

      it("scopes plucked rows to the from(subquery)", async () => {
        const sub = CanonicalPost.where("id <= 2");
        const ids = await (
          CanonicalPost.from(sub, "posts") as unknown as {
            order(c: string): { pluck(c: string): Promise<unknown[]> };
          }
        )
          .order("id")
          .pluck("id");
        expect(ids.map(Number)).toEqual([1, 2]);
      });
    });
  });
});
