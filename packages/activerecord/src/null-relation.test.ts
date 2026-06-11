/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/null_relation_test.rb
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { assertNoQueries, assertQueriesCount } from "./testing/query-assertions.js";
import { association, registerModel } from "./associations.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Post } from "./test-helpers/models/post.js";

registerModel(Developer);
registerModel(Comment);
registerModel(Post);

// ==========================================================================
// NullRelationTest — targets null_relation_test.rb
// ==========================================================================
describe("NullRelationTest", () => {
  // Mirrors Rails `fixtures :posts, :comments`; `{ schema }` recreates the
  // canonical tables so the suite survives sibling-file contamination.
  useHandlerFixtures(["posts", "comments"], { schema: canonicalSchema });

  it("none", async () => {
    await assertNoQueries(false, async () => {
      expect(await Developer.none().toArray()).toEqual([]);
      expect(await Developer.all().none().toArray()).toEqual([]);
    });
  });

  it("none chainable", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Developer.none().where({ name: "David" }).toArray()).toEqual([]);
    });
  });

  // Rails: test_none_chainable_to_existing_scope_extension_method exercises
  // `Topic.anonymous_extension.none.one`, where `anonymous_extension` is a named
  // scope carrying an instance-method block (`def one; 1; end`). trails' `scope`
  // helper takes only a query lambda — scope-extension method blocks aren't
  // modeled — so the `.one` extension call has no equivalent.
  it.skip("none chainable to existing scope extension method", () => {});

  it("async query on null relation", async () => {
    await assertNoQueries(false, async () => {
      const relation = await Developer.none().loadAsync().load();
      expect(await relation.toArray()).toEqual([]);
    });
  });

  it("none chained to methods firing queries straight to db", async () => {
    await assertNoQueries(false, async () => {
      expect(await Developer.none().pluck("id", "name")).toEqual([]);
      expect(await Developer.none().deleteAll()).toBe(0);
      expect(await Developer.none().updateAll({ name: "David" })).toBe(0);
      expect(await Developer.none().delete(1)).toBe(0);
      expect(await Developer.none().exists(1)).toBe(false);
    });
  });

  it("null relation content size methods", async () => {
    await assertNoQueries(false, async () => {
      expect(await Developer.none().size()).toBe(0);
      expect(await Developer.none().count()).toBe(0);
      expect(await Developer.none().isEmpty()).toBe(true);
      expect(Developer.none().isNone()).toBe(true);
      expect(await Developer.none().isAny()).toBe(false);
      expect(await Developer.none().isOne()).toBe(false);
      expect(await Developer.none().isMany()).toBe(false);
    });
  });

  it("null relation used with constraints", async () => {
    const post = await Post.first();
    await assertNoQueries(false, async () => {
      let scope = association(post!, "comments").scope();
      const none = Post.none();
      scope = scope.merge(none);
      expect(await scope.size()).toBe(0);
    });
  });

  it("null relation metadata methods", () => {
    expect(Developer.none().toSql()).toContain(" WHERE (1=0)");
    expect(Developer.none().whereValuesHash()).toEqual({});
  });

  it("null relation where values hash", () => {
    expect(Developer.none().where({ salary: 100_000 }).whereValuesHash()).toEqual({
      salary: 100_000,
    });
  });

  it("null relation count", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().count("id")).toBe(0);
      expect(await Comment.none().group("post_id").count("id")).toEqual({});
    });
  });

  it("null relation count async", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().asyncCount("id")).toBe(0);
      expect(await Comment.none().group("post_id").asyncCount("id")).toEqual({});
    });
  });

  it("null relation sum", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().sum("id")).toBe(0);
      expect(await Comment.none().group("post_id").sum("id")).toEqual({});
    });
  });

  it("null relation sum async", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().asyncSum("id")).toBe(0);
      expect(await Comment.none().group("post_id").asyncSum("id")).toEqual({});
    });
  });

  it("null relation average", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().average("id")).toBeNull();
      expect(await Comment.none().group("post_id").average("id")).toEqual({});
    });
  });

  it("null relation average async", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().asyncAverage("id")).toBeNull();
      expect(await Comment.none().group("post_id").asyncAverage("id")).toEqual({});
    });
  });

  it("null relation minimum", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().minimum("id")).toBeNull();
      expect(await Comment.none().group("post_id").minimum("id")).toEqual({});
    });
  });

  it("null relation minimum async", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().asyncMinimum("id")).toBeNull();
      expect(await Comment.none().group("post_id").asyncMinimum("id")).toEqual({});
    });
  });

  it("null relation maximum", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().maximum("id")).toBeNull();
      expect(await Comment.none().group("post_id").maximum("id")).toEqual({});
    });
  });

  it("null relation maximum async", async () => {
    await assertNoQueries(false, async () => {
      expect(await Comment.none().asyncMaximum("id")).toBeNull();
      expect(await Comment.none().group("post_id").asyncMaximum("id")).toEqual({});
    });
  });

  it("null relation in where condition", async () => {
    expect(await Comment.count()).toBeGreaterThan(0); // precondition, make sure there are comments.
    expect(await Comment.where({ post_id: Post.none() }).count()).toBe(0);
  });
});
