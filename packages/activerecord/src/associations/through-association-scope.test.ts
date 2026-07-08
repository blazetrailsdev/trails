/**
 * Preloader::ThroughAssociation#through_scope fidelity.
 *
 * Pins Rails' `through_scope`
 * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb):
 *
 *   - `annotate(...)` on the through reflection's own scope is carried onto
 *     the through (intermediate) query.
 *   - a strict-loading preload scope cascades to the through query.
 *   - the `elsif !reflection_scope.where_clause.empty?` branch copies the FULL
 *     reflection-scope `where_clause` onto the through query and JOINs the
 *     source reflection, so every referenced column resolves in ONE query. A
 *     source-table condition is therefore carried onto the through query (with
 *     the source JOIN) rather than being deferred to the source-preloader stage.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Preloader } from "./preloader.js";
import { ThroughAssociation } from "./preloader/through-association.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

registerModel(Author);
registerModel(Post);
registerModel(Comment);

// Add a scope-annotated through association to Author for this test suite.
// Author → posts → comments, but with an SQL annotation on the scope.
(Author as any).hasMany("annotatedComments", {
  className: "Comment",
  through: "posts",
  source: "comments",
  scope: (rel: any) => rel.annotate("preload-through"),
});

// A source-table (`comments.`) condition on a has_many-through (collection
// source). Rails' `through_scope` copies the FULL where_clause onto the through
// query and `includes!(source)` + `references!(source.table_name)`, eager-loading
// the source via a JOIN whose JoinDependency dedups the middle records by PK — so
// the source condition IS carried onto the through query (with the source JOIN)
// rather than deferred to the source-preloader stage.
(Author as any).hasMany("commentsWithSourceCondition", {
  className: "Comment",
  through: "posts",
  source: "comments",
  scope: (rel: any) => rel.where("comments.body = 'first comment'"),
});

// A through-table (`posts.title`) condition expressed as a hash so its Arel
// attribute is precisely detected. For a collection-source two-step, the
// through-table predicate is copied onto the through query to constrain which
// intermediate rows are selected.
(Author as any).hasMany("commentsWithThroughCondition", {
  className: "Comment",
  through: "posts",
  source: "comments",
  scope: (rel: any) => rel.where({ posts: { title: "Welcome to the weblog" } }),
});

// Same, but the through-table condition is RAW SQL. Rails' `through_scope`
// assigns the full `reflection_scope.where_clause` before the source join, so a
// raw through-table predicate must be copied onto the through query too (not
// left on the source query, where `posts` is not joined — an invalid predicate).
(Author as any).hasMany("commentsWithRawThroughCondition", {
  className: "Comment",
  through: "posts",
  source: "comments",
  scope: (rel: any) => rel.where("posts.title = 'Welcome to the weblog'"),
});

// A MIXED predicate referencing both the through table (`posts`) and the source
// table (`comments`) in one node. Rails copies the full where_clause and JOINs
// the source, so both `posts` and `comments` are available on the through query
// and the whole predicate resolves there in one query.
(Author as any).hasMany("commentsWithMixedCondition", {
  className: "Comment",
  through: "posts",
  source: "comments",
  scope: (rel: any) => rel.where("posts.title = 'Welcome to the weblog' OR comments.body = 'x'"),
});

describe("Preloader::ThroughAssociation#through_scope", () => {
  const { authors, posts } = fixtures(["authors", "authorAddresses", "posts", "comments"]);

  function throughLoader(owners: Author[], name: string, scope?: any): ThroughAssociation {
    const loaders = new Preloader({
      records: owners,
      associations: [name],
      scope,
      associateByDefault: false,
    }).loaders;
    const loader = loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  it("carries annotate from the through reflection scope onto the through query", async () => {
    const david = authors("david");
    const loader = throughLoader([david], "annotatedComments");
    const scope = (loader as any)._buildThroughScope();
    expect(scope.toSql()).toContain("preload-through");

    const [row] = await Author.where({ id: david.id }).preload("annotatedComments");
    const comments = (row.association("annotatedComments").target ?? []) as any[];
    expect(comments.length).toBeGreaterThan(0);
  });

  it("keeps a source-table condition on a collection source at the source stage, not the through query", () => {
    const david = authors("david");
    const loader = throughLoader([david], "commentsWithSourceCondition");
    // Rails copies the full where_clause and eager-loads the source (JOIN
    // comments), whose JoinDependency dedups the middle records by PK — so the
    // source condition rides the through query with the source JOIN, resolving
    // in one query rather than being deferred to the source stage.
    const scope = (loader as any)._buildThroughScope();
    const sql = scope.toSql();
    expect(sql).toContain("first comment");
    expect(sql).toMatch(/JOIN .*comments/);
  });

  it("copies a through-table condition onto the through query for a collection source", () => {
    const david = authors("david");
    const loader = throughLoader([david], "commentsWithThroughCondition");
    const scope = (loader as any)._buildThroughScope();
    const sql = scope.toSql();
    // The through-table predicate constrains the intermediate (posts) rows.
    expect(sql).toContain("Welcome to the weblog");
  });

  it("copies a raw-SQL through-table condition onto the through query for a collection source", () => {
    const david = authors("david");
    const loader = throughLoader([david], "commentsWithRawThroughCondition");
    const scope = (loader as any)._buildThroughScope();
    // Raw through-table predicate rides the through query (Rails' full
    // where_clause assignment), not the source query where `posts` is unjoined.
    expect(scope.toSql()).toContain("posts.title");
  });

  it("does not copy a mixed through+source predicate onto the through query", () => {
    const david = authors("david");
    const loader = throughLoader([david], "commentsWithMixedCondition");
    const scope = (loader as any)._buildThroughScope();
    // The predicate references both `posts` (through) and `comments` (source) in
    // one node. Rails copies the full where_clause and JOINs the source, so both
    // tables are available on the through query and the whole predicate resolves
    // there.
    const sql = scope.toSql();
    expect(sql).toContain("posts.title");
    expect(sql).toMatch(/JOIN .*comments/);
  });

  it("cascades strict loading from the preload scope onto the through query", async () => {
    const david = authors("david");

    const loader = throughLoader([david], "annotatedComments", Comment.all().strictLoading());
    const scope = (loader as any)._buildThroughScope();
    expect(scope.isStrictLoading).toBe(true);
  });
});
