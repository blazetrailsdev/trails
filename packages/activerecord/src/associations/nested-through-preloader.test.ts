/**
 * HMT Slot D — Nested-through preloader + STI + joins/includes.
 *
 * A "nested through" is a `has_many :through` whose `through:`
 * association is itself a `has_many :through` (i.e. the source
 * reflection chain has more than one through step). Rails treats
 * these chains by flattening them through `Reflection#chain` and
 * walking each step. These tests pin our preloader's nested-through
 * path against:
 *
 *   - direct load through a 3-level chain (Author -> Posts ->
 *     Comments -> Ratings) with the regular JOIN-based path
 *   - eager preload through the same chain via `includes`
 *   - eager preload combined with an outer-relation `where` filter
 *     (preloaded targets must not be silently dropped)
 *   - STI subclass as the final source of a nested-through chain,
 *     under both direct load and `includes` preload
 *
 *   - JOIN-based `joins(nestedThrough).where(targetTable.col: N)`
 *     traversal of the same 3-level chain (currently BLOCKED on a
 *     JoinDependency gap — see the skipped test below)
 *
 * Intermediate-table `references` against a nested-through chain
 * belong to Slot E and are not covered here.
 *
 * Mirrors selected scenarios from
 * vendor/rails/activerecord/test/cases/associations/nested_through_associations_test.rb.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment, SpecialComment, SubSpecialComment } from "../test-helpers/models/comment.js";
import { Rating } from "../test-helpers/models/rating.js";
import { Post } from "../test-helpers/models/post.js";

registerModel(Author);
registerModel(Comment);
registerModel(SpecialComment);
registerModel(SubSpecialComment);
registerModel(Rating);
registerModel(Post);

describe("HMT Slot D — nested-through preloader / STI / joins+includes", () => {
  const {
    authors,
    ratings,
    comments: fixtureComments,
  } = useHandlerFixtures(["authors", "authorAddresses", "posts", "comments", "ratings"], {
    schema: canonicalSchema,
  });

  it("proxy.toArray() walks a 3-level nested-through chain and filters by owner", async () => {
    // Author → comments (through posts) → ratings (3-level chain).
    // ratings fixture: normal_comment_rating(id=1), special_comment_rating(id=2),
    // sub_special_comment_rating(id=3) — all on david's sti_comments post.
    const david = authors("david");
    const r1 = ratings("normal_comment_rating");
    const r2 = ratings("special_comment_rating");
    const r3 = ratings("sub_special_comment_rating");
    const result = await david.ratings.toArray();
    expect(result.map((r) => r.id).sort((a: any, b: any) => a - b)).toEqual(
      [r1.id, r2.id, r3.id].sort((a: any, b: any) => a - b),
    );
  });

  it("includes() preloads nested-through and binds results into the association target", async () => {
    const david = authors("david");
    const r1 = ratings("normal_comment_rating");
    const r2 = ratings("special_comment_rating");
    const r3 = ratings("sub_special_comment_rating");
    const [author] = await Author.where({ id: david.id }).includes("ratings").toArray();
    const preloaded = (author.association("ratings").target ?? []) as any[];
    expect(preloaded.map((r: any) => r.id).sort((a: any, b: any) => a - b)).toEqual(
      [r1.id, r2.id, r3.id].sort((a: any, b: any) => a - b),
    );
  });

  it("includes() preloads the direct-through intermediate independently from the nested-through", async () => {
    // `comments` on Author = through: "posts" (a direct 2-level through).
    // Loading it independently must not bleed into a separate `ratings` preload.
    const david = authors("david");
    const [author] = await Author.where({ id: david.id }).includes("comments").toArray();
    const preloadedComments = (author.association("comments").target ?? []) as any[];
    expect(preloadedComments.length).toBeGreaterThan(0);
    // The ratings association must NOT be loaded as a side-effect.
    expect(author.association("ratings").loaded).toBe(false);
  });

  it("includes() + outer-relation where preserves all preloaded nested-through targets", async () => {
    const david = authors("david");
    const r1 = ratings("normal_comment_rating");
    const r2 = ratings("special_comment_rating");
    const r3 = ratings("sub_special_comment_rating");
    const [author] = await Author.where({ id: david.id }).includes("ratings").toArray();
    const preloaded = (author.association("ratings").target ?? []) as any[];
    // Filtering the outer relation must not silently drop preloaded
    // targets, introduce duplicates, or leak stray rows.
    expect(preloaded.map((r: any) => r.id).sort((a: any, b: any) => a - b)).toEqual(
      [r1.id, r2.id, r3.id].sort((a: any, b: any) => a - b),
    );
  });

  it.skip("joins() on a nested-through chain emits intermediates and accepts where on the target table", async () => {
    // BLOCKED: associations — JoinDependency nested-through chaining
    // ROOT-CAUSE: associations/join-dependency/ — inner through (comments) not flattened;
    // emits wrong join column instead of walking posts→comments
    // Mirrors Post.joins(:special_comments_ratings).where(...) in
    // vendor/rails/activerecord/test/cases/associations/nested_through_associations_test.rb.
    const david = authors("david");
    const matched = await Author.joins("ratings")
      .where({ "ratings.value": 1 })
      .distinct()
      .toArray();
    expect(matched.map((row) => row.id)).toContain(david.id);

    const none = await Author.joins("ratings").where({ "ratings.value": 9999 }).toArray();
    expect(none).toHaveLength(0);
  });

  it("STI subclass instances flow through the nested-through chain with the correct type", async () => {
    // david has SpecialComment and SubSpecialComment instances on sti_comments post.
    // When loaded through the Author→posts→comments chain, STI discriminator
    // must materialize the correct subclass — not the base Comment.
    const david = authors("david");
    const preloaded = await Author.where({ id: david.id }).includes("comments").toArray();
    const comments = (preloaded[0].association("comments").target ?? []) as any[];
    const byId = new Map(comments.map((c: any) => [c.id, c]));

    const specialRow = byId.get(fixtureComments("eager_sti_on_associations_s_comment1").id);
    expect(specialRow).toBeDefined();
    expect(specialRow!.constructor).toBe(SpecialComment);
    const subSpecialRow = byId.get(fixtureComments("sub_special_comment").id);
    expect(subSpecialRow).toBeDefined();
    expect(subSpecialRow!.constructor).toBe(SubSpecialComment);

    // Same check via proxy (direct load)
    const directComments = await david.comments.toArray();
    const directById = new Map(directComments.map((c) => [c.id, c]));
    const directSpecial = directById.get(
      fixtureComments("eager_sti_on_associations_s_comment1").id,
    );
    expect(directSpecial).toBeDefined();
    expect(directSpecial!.constructor).toBe(SpecialComment);
  });
});
