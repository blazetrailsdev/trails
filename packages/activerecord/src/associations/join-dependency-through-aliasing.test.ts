/**
 * Covers the real-table-name reuse a `has_many :through` chain gets from
 * `JoinDependency#makeConstraints` (`join_dependency.rb:189-211`).
 *
 * Mirrors AliasTracker behavior (`activerecord/lib/active_record/table_metadata.rb`
 * / `alias_tracker.rb`): a joined table uses its real name when not already
 * in use, falling back to a tN alias only on collision.
 */
import { describe, it, expect } from "vitest";
import "../support/canonical-model-index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { JoinDependency } from "./join-dependency.js";
import type { JoinPart } from "./join-dependency/join-part.js";
import { Nodes, Table, tableRealName, tableSqlName, type TableRef } from "@blazetrails/arel";

/** The tree node a JoinDependency built for a dotted association path. */
function nodeAt(jd: JoinDependency, path: string): JoinPart {
  return jd.nodes.find((n) => n.assocName === path)!;
}

/**
 * The SQL name of every table the emitted joins join, in emission order.
 * A `has_many :through` chain's intermediate links live inside the one
 * JoinAssociation (join_association.rb:32-73) and have no tree node of their
 * own, so the emitted joins are the only place their aliasing is observable.
 */
function joinedTableNames(joins: Nodes.Join[]): string[] {
  return joins.map((join) => tableSqlName(join.left as TableRef));
}

/**
 * The join a node's own chain root contributed, picked out of what
 * `joinConstraints` returned — Rails' JoinAssociation keeps no back-reference to
 * it (join_dependency.rb:189-211 concatenates the joins into the arel).
 */
function joinFor(joins: Nodes.Join[], node: JoinPart): Nodes.Join {
  return joins.find((join) => tableSqlName(join.left as TableRef) === node.effectiveSqlName)!;
}

describe("JoinDependency has_many :through real-table-name reuse", () => {
  // The canonical schema and models: `Author.comments` is
  // `has_many :comments, through: :posts` (author.rb:19), the same shape Rails'
  // own alias coverage uses in
  // `test/cases/associations/inner_join_association_test.rb`.
  fixtures({});

  it("uses real table names for through+target when no collision", () => {
    const jd = new JoinDependency(Author, null, "comments", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "comments");
    expect(node).not.toBeNull();
    expect(joinFor(joins, node)).toBeInstanceOf(Nodes.OuterJoin);
    expect(node.effectiveSqlName).toBe("comments");

    // Target table uses real name (no alias)
    const targetTable = (joinFor(joins, node) as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("comments");
    expect(targetTable.tableAlias).toBeNull();

    expect(joinedTableNames(joins)).toContain("posts");
    const throughJoin = joins.find((j) => tableSqlName(j.left as TableRef) === "posts")!;
    expect(throughJoin).toBeInstanceOf(Nodes.OuterJoin);
    expect((throughJoin.left as Table).tableAlias).toBeNull();
  });

  it("uses the Rails alias_candidate when the target real name collides", () => {
    // `comments` and `commentsWithForeignKey` (author.rb:19, 28) are two
    // `through: :posts` associations onto the same `comments` table, so the
    // second one's target collides.
    const jd = new JoinDependency(
      Author,
      null,
      ["comments", "commentsWithForeignKey"],
      Nodes.OuterJoin,
    );
    const node = nodeAt(jd, "commentsWithForeignKey");
    expect(node).not.toBeNull();

    // Aliasing is deferred to emit: resolve against the shared AliasTracker.
    const joins = jd.joinConstraints([]);
    // Rails names the collision `{plural_name}_{owner_table}` (root link, no _join)
    // — `Reflection#alias_candidate` (reflection.rb:328).
    expect(node.effectiveSqlName).toBe("comments_with_foreign_keys_authors");

    // Target aliased — Rails encodes this as a `TableAlias` over the real table.
    const targetTable = (joinFor(joins, node) as Nodes.OuterJoin).left as TableRef;
    expect(tableRealName(targetTable)).toBe("comments");
    expect(tableSqlName(targetTable)).toBe("comments_with_foreign_keys_authors");

    // Through still uses real name
    const throughJoin = joins.find((j) => tableSqlName(j.left as TableRef) === "posts")!;
    expect(throughJoin).toBeDefined();
    expect((throughJoin.left as Table).tableAlias).toBeNull();
  });

  it("builds one JoinAssociation for a has_many :through, not a node per chain link", () => {
    // Rails' join tree holds only JoinBase and JoinAssociation
    // (join_dependency.rb:228-240): a `has_many :through` is ONE tree edge whose
    // `join_constraints` walks `reflection.chain` internally, so the through
    // link never becomes a child of the root.
    const jd = new JoinDependency(Author, null, "comments", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "comments");
    expect(node).not.toBeNull();

    const root = jd.joinRoot;
    expect(root.baseKlass).toBe(Author);
    expect(root.children.length).toBe(1);
    const targetChild = root.children[0];
    expect(targetChild.immediateAssocName).toBe("comments");
    expect(targetChild.tableName).toBe("comments");

    expect(joinedTableNames(joins)).toEqual(["posts", "comments"]);
  });

  it("emits canonical self-join aliases when a nested-through chain references a table multiple times", () => {
    // Mirrors the alias-emission slice of Rails
    // test_nested_has_many_through_with_a_table_referenced_multiple_times
    // (nested_through_associations_test.rb:437): Author.similar_posts
    // (author.rb:165) walks Author -> tags -> tagged_posts so the chain visits
    // `posts` and `taggings` twice. AliasTracker names the colliding self-joins
    // `{plural_name}_{owner_table}_join` (join_dependency.rb:204-206), giving
    // `posts_authors_join` / `taggings_authors_join`.
    const jd = new JoinDependency(Author, null, "similarPosts", Nodes.OuterJoin);
    const node = nodeAt(jd, "similarPosts");
    expect(node).not.toBeNull();

    // Aliasing is deferred to emit: the one `joinConstraints` call resolves the
    // whole chain against the shared AliasTracker.
    const effectiveNames = joinedTableNames(jd.joinConstraints([]));
    // A twice-visited table keeps its real name on first encounter and is
    // self-join aliased only on the colliding second encounter (the emit-time
    // chain resolution claims each link in forward order), so exactly one
    // aliased + one real-named join exists for each.
    expect(effectiveNames).toContain("posts_authors_join");
    expect(effectiveNames).toContain("taggings_authors_join");
    expect(effectiveNames.filter((n) => n === "taggings").length).toBe(1);
    expect(effectiveNames.filter((n) => n === "posts").length).toBe(1);

    // The canonical alias is addressable in the emitted SQL. Match either
    // quote style (PG/SQLite double-quote, MySQL backtick) so the assertion
    // isn't tied to the test adapter's quoting.
    const sql = (Author as any).all().leftJoins(":similarPosts").toSql();
    expect(sql).toMatch(/["`]taggings["`]\s+["`]taggings_authors_join["`]/);
    expect(sql).toMatch(/["`]posts["`]\s+["`]posts_authors_join["`]/);
  });

  it("aliases a referenced through-target table to the reference name when free", () => {
    // Mirrors Rails JoinDependency#make_constraints consuming `@references`
    // uniformly across every reflection in the chain (join_dependency.rb:202):
    // `Author.includes(:comments_with_foreign_key).references(...)` records the
    // through-target name in `@references`, and when its join is emitted
    // `aliased_table_for` uses the referenced name on first/free use. The
    // aliasing is consumed lazily in `joinConstraints`/`makeConstraints`, so the
    // through-target JoinAssociation is reference-aliased identically to a
    // direct join target — without `_addThroughViaJoinAssociation` receiving
    // `references` at build time.
    const jd = new JoinDependency(Author, null, "commentsWithForeignKey", Nodes.OuterJoin);
    const target = jd.nodes.find((n) => n.immediateAssocName === "commentsWithForeignKey")!;
    expect(target.effectiveSqlName).toBe("comments");

    // Lazily consume references; the free reference name renames the target.
    jd.joinConstraints([], (jd as any)._aliasTracker, [
      new Nodes.SqlLiteral("commentsWithForeignKey"),
    ]);
    expect(target.effectiveSqlName).toBe("commentsWithForeignKey");
    expect(tableRealName(target.arelTable as TableRef)).toBe("comments");
    expect(tableSqlName(target.arelTable as TableRef)).toBe("commentsWithForeignKey");

    // The intermediate chain link is internal and never reference-aliased.
    expect(joinedTableNames(jd.joinConstraints([]))).toContain("posts");
  });

  it("reuses one chain-tail alias for two distinct through associations sharing it", () => {
    // Mirrors Rails JoinDependency#make_constraints memoizing `@joined_tables`
    // (join_dependency.rb:193-200): `Author.comments` (author.rb:19) and
    // `Author.taggings` (author.rb:158) are both `through: :posts`, so they
    // carry the owner's single `posts` reflection as their chain tail and
    // eager-loading both reuses ONE `posts` join instead of minting a second
    // `posts_authors_join` alias.
    const jd = new JoinDependency(Author, null, ["comments", "taggings"], Nodes.OuterJoin);
    const effectiveNames = joinedTableNames(jd.joinConstraints([]));
    // Exactly one `posts` join survives; the shared tail emits no spurious
    // `_join` alias for the second through path.
    expect(effectiveNames.filter((n) => n === "posts").length).toBe(1);
    expect(effectiveNames.some((n) => n.includes("posts") && n.includes("_join"))).toBe(false);

    // Both targets still join — and both key off the one shared `posts`.
    expect(effectiveNames).toContain("comments");
    expect(effectiveNames).toContain("taggings");
  });

  it("uses the Rails alias_candidate with _join when the through real name collides", () => {
    // Rails JoinDependency#make_constraints memoizes `@joined_tables` for EVERY
    // child (join_dependency.rb:193-209), including a plain (non-through)
    // include. The direct `posts` include and the `comments`-through-posts path
    // both carry the owner's single `posts` reflection as a chain tail, so the
    // direct include populates the memo and the through path reuses that ONE
    // `posts` join instead of minting a second `posts_authors_join` alias.
    const jd = new JoinDependency(Author, null, ["posts", "comments"], Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const directNode = nodeAt(jd, "posts");
    const node = nodeAt(jd, "comments");
    expect(node).not.toBeNull();

    // The direct include keeps the real `posts` name (first use) and owns
    // the one emitted join.
    expect(directNode.effectiveSqlName).toBe("posts");
    const directTable = (joinFor(joins, directNode) as Nodes.OuterJoin).left as Table;
    expect(directTable.name).toBe("posts");
    expect(directTable.tableAlias).toBeNull();

    // The through link reuses the memoized `posts` alias — it is suppressed
    // (no duplicate join emitted) so exactly one `posts` join survives and
    // no spurious `_join` alias is minted.
    const effectiveNames = joinedTableNames(joins);
    expect(effectiveNames.filter((n) => n === "posts").length).toBe(1);
    expect(effectiveNames.some((n) => n.includes("_join"))).toBe(false);

    // Target uses real name (first use), keyed off the one shared `posts`.
    const targetTable = (joinFor(joins, node) as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("comments");
    expect(targetTable.tableAlias).toBeNull();
  });
});
