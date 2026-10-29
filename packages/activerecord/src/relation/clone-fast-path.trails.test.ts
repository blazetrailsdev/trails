import { describe, expect, it } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Post } from "../test-helpers/models/post.js";

class PostWithColumnIndexes extends Post {
  static {
    this.attribute("columnIndexes", "integer");
  }
}

registerModel([Post, PostWithColumnIndexes]);

describe("Relation#clone on a class-specific relation", () => {
  fixtures(["posts"]);

  it("dispatches initializeClone before initializeCopy, as Object#clone does", () => {
    const relation = Post.where({ id: 1 });
    const proto = Object.getPrototypeOf(relation) as { initializeClone?: unknown };
    const seen: unknown[] = [];
    proto.initializeClone = function (
      this: { initializeCopy(o: unknown): unknown },
      orig: unknown,
    ) {
      seen.push(orig);
      return this.initializeCopy(orig);
    };
    try {
      const copy = relation.limit(1);
      expect(seen).toHaveLength(1);
      expect(copy).not.toBe(relation);
    } finally {
      delete proto.initializeClone;
    }
  });
});

describe("instantiate", () => {
  fixtures(["posts"]);

  it("instantiates an attribute hash whose columnIndexes key is not an object", () => {
    const record = PostWithColumnIndexes.instantiate({ id: 1, columnIndexes: 5 });
    expect(record.readAttribute("columnIndexes")).toBe(5);
  });
});
