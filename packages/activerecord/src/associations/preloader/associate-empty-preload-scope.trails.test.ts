import { describe, it, expect } from "vitest";
import { registerModel } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Association } from "./association.js";
import type { AssociationReflection } from "../../reflection.js";
import type { Relation } from "../../relation.js";
import { Post } from "../../test-helpers/models/post.js";
import { Comment } from "../../test-helpers/models/comment.js";

registerModel(Post);
registerModel(Comment);

describe("Preloader::Association#initialize @associate", () => {
  const { posts } = fixtures(["posts", "comments"]);

  it("associates records when the preload scope is present but empty", async () => {
    const post = await Post.find(posts("welcome").id);
    const reflection = (
      Post as unknown as { _reflectOnAssociation(name: string): AssociationReflection }
    )._reflectOnAssociation("comments");
    const preloadScope = (Comment as unknown as { unscoped(): Relation<Comment> }).unscoped();

    expect(preloadScope.isEmptyScope).toBe(true);

    const loader = new Association(Comment, [post], reflection, preloadScope, undefined, false);
    await loader.run();

    const association = post.association("comments") as unknown as {
      isLoaded(): boolean;
      target: Comment[];
    };
    expect(association.isLoaded()).toBe(true);
    expect(association.target.length).toBeGreaterThan(0);
  });
});
