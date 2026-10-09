import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Post as CanonicalPost } from "./test-helpers/models/post.js";
import { Comment as CanonicalComment } from "./test-helpers/models/comment.js";

describe("CounterCacheTest (trails)", () => {
  fixtures(["posts", "comments"]);
  beforeAll(() => {
    registerModel(CanonicalPost);
    registerModel(CanonicalComment);
  });

  it("counter cache updates an aliased column", async () => {
    const post = await CanonicalPost.create({ title: "Hello", body: "World" });
    await CanonicalComment.create({ body: "First", post_id: post.id });

    const reloaded = await CanonicalPost.find(post.id);
    expect(reloaded.legacy_comments_count).toBe(1);
  });

  it("registering a counter cached association does not mutate the superclass list", () => {
    class ParentModel extends Base {}
    class ChildModel extends ParentModel {}
    ChildModel.belongsTo("post", { counterCache: true });

    expect(ChildModel.counterCachedAssociationNames).toEqual(["post"]);
    expect(ParentModel.counterCachedAssociationNames).toEqual([]);
  });
});
