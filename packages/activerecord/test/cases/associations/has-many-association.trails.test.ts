import { describe, it, expect } from "vitest";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Post } from "../../models/post.js";
import { HasManyAssociation } from "../../../lib/associations/has-many-association.js";

describe("HasManyAssociation#intersection — Array#& semantics", () => {
  fixtures(["posts"]);

  it("drops duplicates of separately loaded records with the same id", async () => {
    const [a, b] = await Promise.all([Post.find(1), Post.find(1)]);
    const other = await Post.find(2);
    expect(a).not.toBe(b);
    const { intersection } = HasManyAssociation.prototype as unknown as {
      intersection(a: Post[], b: Post[]): Post[];
    };
    const result = intersection([a, b, other], [b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(a);
  });
});
