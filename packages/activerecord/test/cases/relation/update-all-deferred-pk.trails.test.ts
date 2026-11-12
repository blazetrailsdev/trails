import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import "../../../lib/index.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Post } from "../../../lib/test-helpers/models/post.js";
import { Comment } from "../../models/comment.js";
import { DeferredIdsIn } from "../../../lib/relation/predicate-builder/deferred-distinct-pk-in.js";

constSet(TopLevel, "Post", Post);
constSet(TopLevel, "Comment", Comment);

describe("update_all / delete_all over an eager-loaded limited subquery (trails)", () => {
  fixtures(["posts", "comments"]);

  it("update_all compiles the deferred subquery to a literal id list", async () => {
    const limited = Post.eagerLoad("comments").order("posts.id").limit(2);
    const relation = Post.where({ id: limited });
    expect(relation.whereClause.predicates.some((p) => p instanceof DeferredIdsIn)).toBe(true);

    const ids = await limited.ids();
    expect(await relation.updateAll({ title: "bulk" })).toBe(ids.length);
    expect(relation.whereClause.predicates.some((p) => p instanceof DeferredIdsIn)).toBe(false);
    expect(await Post.where({ title: "bulk" }).ids()).toEqual(ids);
  });

  it("delete_all compiles the deferred subquery to a literal id list", async () => {
    const limited = Post.eagerLoad("comments").order("posts.id").limit(2);
    const relation = Comment.where({ post_id: limited });
    expect(relation.whereClause.predicates.some((p) => p instanceof DeferredIdsIn)).toBe(true);

    const ids = await limited.ids();
    const expected = await Comment.where({ post_id: ids }).count();
    expect(await relation.deleteAll()).toBe(expected);
    expect(relation.whereClause.predicates.some((p) => p instanceof DeferredIdsIn)).toBe(false);
    expect(await Comment.where({ post_id: ids }).count()).toBe(0);
  });
});
