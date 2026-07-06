/**
 * Preloader::ThroughAssociation#through_scope fidelity.
 *
 * Pins the parts of Rails' `through_scope`
 * (vendor/rails/activerecord/lib/active_record/associations/preloader/through_association.rb)
 * that our preloader can honour without the single-query JOIN strategy:
 *
 *   - `annotate(...)` on the through reflection's own scope is carried onto
 *     the through (intermediate) query rather than being silently dropped.
 *   - a strict-loading preload scope cascades to the through query.
 *
 * The `where_clause`/`includes`/`joins` JOIN branch of `through_scope` is a
 * single-query strategy; our preloader applies target-table conditions at the
 * source-preloader stage instead, so that branch is exercised by the
 * join-based eager-loading tests, not here.
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

// A raw-SQL source-table condition whose text embeds the THROUGH table name
// (`posts.`) inside a string literal. The through table is `posts`; a naive
// text scan for a `posts.` qualifier would relocate this source predicate onto
// the through query (a false positive), so this pins that string literals are
// stripped before the qualifier scan.
(Author as any).hasMany("commentsWithLiteralThroughRef", {
  className: "Comment",
  through: "posts",
  source: "comments",
  scope: (rel: any) => rel.where("comments.body = 'mention posts.title here'"),
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

  it("does not relocate a source predicate whose string literal embeds the through table name", () => {
    const david = authors("david");
    const loader = throughLoader([david], "commentsWithLiteralThroughRef");
    const partition = (loader as any)._partitionReflectionWhere();
    // The `posts.` token lives inside a string literal, so the predicate is a
    // source-table condition and must stay on the source preloader.
    expect(partition.throughPredicates).toHaveLength(0);
    expect(partition.sourcePredicates).toHaveLength(1);

    // And the through query must not carry the source predicate.
    const scope = (loader as any)._buildThroughScope();
    expect(scope.toSql()).not.toContain("mention posts.title here");
  });

  it("cascades strict loading from the preload scope onto the through query", async () => {
    const david = authors("david");

    const loader = throughLoader([david], "annotatedComments", Comment.all().strictLoading());
    const scope = (loader as any)._buildThroughScope();
    expect(scope.isStrictLoading).toBe(true);
  });
});
