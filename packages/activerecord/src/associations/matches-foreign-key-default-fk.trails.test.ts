import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import type { Base } from "../base.js";

describe("Association#matches_foreign_key? with a derived foreign key", () => {
  fixtures(["posts", "comments", "authors"]);

  it("matches a persisted child through the derived foreign key", async () => {
    const post = (await Post.first())!;
    const association = post.association("comments") as unknown as {
      reflection: { foreignKey?: string; options: { foreignKey?: string } };
      matchesForeignKey(record: Base): boolean;
    };
    expect(association.reflection.foreignKey).toBe("post_id");
    expect(association.reflection.options.foreignKey).toBeUndefined();

    const comment = (await post.comments)[0];
    expect(association.matchesForeignKey(comment)).toBe(true);
  });
});
