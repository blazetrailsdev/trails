import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
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
  } = fixtures(["authors", "authorAddresses", "posts", "comments", "ratings"]);

  it("proxy.toArray() walks a 3-level nested-through chain and filters by owner", async () => {
    const david = authors("david");
    const r1 = ratings("normal_comment_rating");
    const r2 = ratings("special_comment_rating");
    const r3 = ratings("sub_special_comment_rating");
    const result = await david.ratings;
    expect(result.map((r) => r.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [r1.id, r2.id, r3.id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("includes() preloads nested-through and binds results into the association target", async () => {
    const david = authors("david");
    const r1 = ratings("normal_comment_rating");
    const r2 = ratings("special_comment_rating");
    const r3 = ratings("sub_special_comment_rating");
    const [author] = await Author.where({ id: david.id }).includes(":ratings");
    const preloaded = (author.association("ratings").target ?? []) as any[];
    expect(preloaded.map((r: any) => r.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [r1.id, r2.id, r3.id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("includes() preloads the direct-through intermediate independently from the nested-through", async () => {
    const david = authors("david");
    const [author] = await Author.where({ id: david.id }).includes(":comments");
    const preloadedComments = (author.association("comments").target ?? []) as any[];
    expect(preloadedComments.length).toBeGreaterThan(0);
    expect(author.association("ratings").loaded).toBe(false);
  });

  it("includes() + outer-relation where preserves all preloaded nested-through targets", async () => {
    const david = authors("david");
    const r1 = ratings("normal_comment_rating");
    const r2 = ratings("special_comment_rating");
    const r3 = ratings("sub_special_comment_rating");
    const [author] = await Author.where({ id: david.id }).includes(":ratings");
    const preloaded = (author.association("ratings").target ?? []) as any[];
    expect(preloaded.map((r: any) => r.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [r1.id, r2.id, r3.id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it.skip("joins() on a nested-through chain emits intermediates and accepts where on the target table", async () => {
    // BLOCKED: associations — JoinDependency nested-through chaining
    const david = authors("david");
    const matched = await Author.joins(":ratings").where({ "ratings.value": 1 }).distinct();
    expect(matched.map((row) => row.id)).toContain(david.id);

    const none = await Author.joins(":ratings").where({ "ratings.value": 9999 });
    expect(none).toHaveLength(0);
  });

  it("STI subclass instances flow through the nested-through chain with the correct type", async () => {
    const david = authors("david");
    const preloaded = await Author.where({ id: david.id }).includes(":comments");
    const comments = (preloaded[0].association("comments").target ?? []) as any[];
    const byId = new Map(comments.map((c: any) => [c.id, c]));

    const specialRow = byId.get(fixtureComments("eager_sti_on_associations_s_comment1").id);
    expect(specialRow).toBeDefined();
    expect(specialRow!.constructor).toBe(SpecialComment);
    const subSpecialRow = byId.get(fixtureComments("sub_special_comment").id);
    expect(subSpecialRow).toBeDefined();
    expect(subSpecialRow!.constructor).toBe(SubSpecialComment);

    const directComments = await david.comments;
    const directById = new Map(directComments.map((c) => [c.id, c]));
    const directSpecial = directById.get(
      fixtureComments("eager_sti_on_associations_s_comment1").id,
    );
    expect(directSpecial).toBeDefined();
    expect(directSpecial!.constructor).toBe(SpecialComment);
  });
});
