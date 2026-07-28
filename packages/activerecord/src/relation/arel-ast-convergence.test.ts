/**
 * Verification for RFC 0022 (relation-arel-ast-convergence).
 *
 * After the clusters landed — CTE/UnionAll body as an arel AST
 * (`build_with_expression_from_value`) and from()/pluck threaded through the
 * SelectManager (`build_from`) — the read path emits SQL by compiling one arel
 * node through the dialect visitor instead of assembling strings.
 *
 * These spot-checks drive the *relation* API (`Relation#with` / `#from`) and
 * inspect the compiled SQL +
 * threaded binds, so a regression back to string assembly in the relation
 * layer fails here. `_toSql()` is the pre-substitution compile (public
 * `toSql()` inlines bind values for human-readable output, mirroring Rails
 * `to_sql`), so it exposes the raw `?` / `$N` placeholders; `_lastSelectBinds`
 * is the single ordered bind array the collector produced.
 *
 * The dialect-specific assertions key off `adapterType` so each CI lane
 * (sqlite / postgres / mysql) verifies its own quoting + placeholder style:
 *   - SQLite / PostgreSQL quote identifiers with `"…"`; MySQL with backticks.
 *   - PostgreSQL numbers binds `$N` globally across both set-op operands (one
 *     collector — no per-side `rightSql.replace(/\$(\d+)/)` renumber); SQLite /
 *     MySQL use positional `?`.
 *
 * Not Rails-mirrored test names — RFC 0022 is a TS-internal refactor with no
 * new Ruby counterpart, so the names describe the invariant.
 */
import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { adapterType } from "../test-adapter.js";
import { fixtures } from "../test-fixtures.js";
import { Post as CanonicalPost } from "../test-helpers/models/post.js";

// Establish the primary (boot-laid canonical-schema) pool so the bespoke
// `Post` model's SQL compiles through `Base.connection`.
fixtures({});

class Post extends Base {
  static _tableName = "posts";
}
Post.attribute("id", "integer");
Post.attribute("author", "string");

// Pre-substitution SQL (raw `?` / `$N` placeholders) for the relation.
function rawSql(rel: unknown): string {
  return (rel as { _toSql(): string })._toSql();
}

// The single ordered bind array the collector threaded, projected to values.
function bindValues(rel: unknown): unknown[] {
  rawSql(rel); // populates _lastSelectBinds as a side effect of compilation
  const binds = (rel as { _lastSelectBinds?: unknown[] })._lastSelectBinds ?? [];
  return binds.map((b) => (b as { _value?: unknown })?._value ?? b);
}

const openQuote = adapterType === "mysql" ? "`" : '"';
const placeholder1 = adapterType === "postgres" ? "$1" : "?";
const placeholder2 = adapterType === "postgres" ? "$2" : "?";

describe("RFC 0022 arel-AST convergence (relation layer)", () => {
  // Cluster 1: CTE array body → Arel::Nodes::UnionAll
  // (build_with_expression_from_value), not `.join(" UNION ALL ")`.
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

    it("threads both operand binds through one collector in order", () => {
      const rel = cteRelation();
      const sql = rawSql(rel);
      expect(sql).toContain(placeholder1);
      expect(sql).toContain(placeholder2);
      expect(bindValues(rel)).toEqual(["alice", "bob"]);
    });
  });

  // Cluster 3: from(subquery) threads through the SelectManager (`build_from`)
  // — a derived table, not a `sql.replace(/FROM …/)` rewrite.
  describe("Relation#from(subquery) on the manager", () => {
    it("renders a derived-table subquery with a qualified projection", () => {
      const sub = Post.where({ author: "alice" });
      const sql = (Post.from(sub, "posts") as unknown as { toSql(): string }).toSql();
      const q = openQuote;
      expect(sql).toMatch(new RegExp(`FROM \\(SELECT .* FROM ${q}posts${q} WHERE .*\\) posts`));
      expect(sql).toContain(`SELECT ${q}posts${q}.*`);
    });

    // pluck spawns its own relation and executes `relation.arel` via
    // select_all (calculations.rb), a path distinct from the toSql() read
    // path above. build_arel must apply `arel.from(build_from)` there too, so
    // the derived-table subquery actually scopes the rows. Executes against
    // the active adapter (each CI lane runs its own backend).
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
