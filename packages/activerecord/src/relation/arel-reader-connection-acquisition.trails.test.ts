import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { ConnectionNotEstablished } from "../errors.js";

registerModel(Post);

describe("Relation#arel connection acquisition", () => {
  fixtures(["posts"]);

  it("raises ConnectionNotEstablished rather than building against a substitute", () => {
    const relation = Post.limit(1);
    const descriptor = Object.getOwnPropertyDescriptor(Post, "connection");
    Object.defineProperty(Post, "connection", {
      configurable: true,
      get() {
        throw new ConnectionNotEstablished("no pool for Post");
      },
    });
    try {
      expect(() => relation.arel()).toThrow(ConnectionNotEstablished);
    } finally {
      if (descriptor) Object.defineProperty(Post, "connection", descriptor);
      else delete (Post as unknown as Record<string, unknown>).connection;
    }
  });
});
