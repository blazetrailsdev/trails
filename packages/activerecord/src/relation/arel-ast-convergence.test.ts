/**
 * Verification for RFC 0022 (relation-arel-ast-convergence).
 *
 * After the three clusters landed — CTE/UnionAll body as an arel AST
 * (build_with_expression_from_value), set operations as arel Union/UnionAll/
 * Intersect/Except nodes threaded through a single bind collector, and
 * from()/pluck threaded through the SelectManager — the read path emits SQL
 * by compiling one arel node through the dialect visitors instead of
 * assembling strings. These spot-checks compile the *relation-built* arel
 * through the SQLite, PostgreSQL, and MySQL visitors in a single run and
 * assert the cross-adapter invariants that the removed string-assembly used
 * to fake by hand:
 *
 *   - SQLite / PostgreSQL quote identifiers with `"…"`; MySQL with backticks.
 *   - PostgreSQL numbers binds `$N` *globally* across both set-op operands
 *     (one collector), so there is no per-side `rightSql.replace(/\$(\d+)/)`
 *     renumber. SQLite / MySQL emit positional `?`.
 *   - from(subquery) renders a derived-table subquery in the FROM clause
 *     rather than a `sql.replace(/FROM …/)` rewrite, and the projection stays
 *     qualified.
 *
 * These are not Rails-mirrored test names — RFC 0022 is a TS-internal
 * refactor with no new Ruby counterpart, so the names describe the invariant.
 */
import { describe, it, expect } from "vitest";
import { Nodes, Visitors, Table, star } from "@blazetrails/arel";
import { Base } from "../index.js";
import { createSidecarTestAdapter } from "../test-adapter.js";

class Post extends Base {
  static _tableName = "posts";
}
Post.attribute("id", "integer");
Post.attribute("author", "string");
Post.adapter = createSidecarTestAdapter().adapter;

function sqlFor(node: Nodes.Node, visitor: Visitors.ToSql): string {
  return visitor.compileWithBinds(node)[0];
}

const sqlite = () => new Visitors.SQLite();
const postgres = () => new Visitors.PostgreSQLWithBinds();
const mysql = () => new Visitors.MySQL();

describe("RFC 0022 arel-AST convergence", () => {
  // Cluster 1: CTE body is an Arel::Nodes::UnionAll AST
  // (build_with_expression_from_value), not `.join(" UNION ALL ")`.
  describe("CTE with a UNION ALL body", () => {
    function cteNode(): Nodes.Node {
      const left = (Post.where({ author: "alice" }) as any).arel();
      const right = (Post.where({ author: "bob" }) as any).arel();
      const body = left.unionAll(right);
      return new Table("posts").project(star).with(new Nodes.Cte("posts_cte", body)).ast;
    }

    it("compiles the union-all body through the visitor on SQLite", () => {
      const sql = sqlFor(cteNode(), sqlite());
      expect(sql).toContain('WITH "posts_cte" AS');
      expect(sql).toContain("UNION ALL");
      expect(sql).toContain('"posts"."author" = ?');
    });

    it("numbers binds globally with $N on PostgreSQL", () => {
      const sql = sqlFor(cteNode(), postgres());
      expect(sql).toContain("UNION ALL");
      expect(sql).toContain('"posts"."author" = $1');
      expect(sql).toContain('"posts"."author" = $2');
    });

    it("quotes identifiers with backticks on MySQL", () => {
      const sql = sqlFor(cteNode(), mysql());
      expect(sql).toContain("WITH `posts_cte` AS");
      expect(sql).toContain("UNION ALL");
      expect(sql).toContain("`posts`.`author` = ?");
    });
  });

  // Cluster 2: set operations are arel nodes whose binds thread through one
  // collector — the headline that retired the right-side `$N` renumber.
  describe("set operation bind threading", () => {
    function unionNode(): Nodes.Node {
      const left = (Post.where({ author: "alice" }) as any).arel();
      const right = (Post.where({ author: "bob" }) as any).arel();
      return left.union(right);
    }

    it("emits global $1/$2 across both operands on PostgreSQL", () => {
      const visitor = postgres();
      const [sql, binds] = visitor.compileWithBinds(unionNode());
      expect(sql).toContain("$1");
      expect(sql).toContain("$2");
      expect(sql).not.toContain("$3");
      expect(binds).toHaveLength(2);
    });

    it("emits positional ? on SQLite and MySQL", () => {
      expect(sqlFor(unionNode(), sqlite())).toContain('"posts"."author" = ?');
      expect(sqlFor(unionNode(), mysql())).toContain("`posts`.`author` = ?");
    });

    it("renders intersect and except as compound SELECTs", () => {
      const left = (Post.where({ author: "alice" }) as any).arel();
      const right = (Post.where({ author: "bob" }) as any).arel();
      expect(sqlFor(left.intersect(right), sqlite())).toContain("INTERSECT");
      expect(sqlFor(left.except(right), sqlite())).toContain("EXCEPT");
    });
  });

  // Cluster 3: from(subquery) threads through the SelectManager — a derived
  // table, not a `sql.replace(/FROM …/)` rewrite.
  describe("from(subquery) on the manager", () => {
    it("renders a derived-table subquery with a qualified projection", () => {
      const sub = Post.where({ author: "alice" });
      const sql = (Post.from(sub, "posts") as any).toSql();
      expect(sql).toMatch(/FROM \(SELECT .* FROM "posts" WHERE .*\) posts/);
      expect(sql).toContain('SELECT "posts".*');
    });
  });
});
