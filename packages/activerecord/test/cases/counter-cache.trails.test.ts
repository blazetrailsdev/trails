import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../../lib/index.js";
import { fixtures } from "../../lib/test-helpers/use-fixtures.js";
import { Post as CanonicalPost } from "../../lib/test-helpers/models/post.js";
import { Comment as CanonicalComment } from "../models/comment.js";

describe("CounterCacheTest (trails)", () => {
  fixtures(["posts", "comments"]);
  beforeAll(() => {
    constSet(TopLevel, "Post", CanonicalPost);
    constSet(TopLevel, "Comment", CanonicalComment);
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
