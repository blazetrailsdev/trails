/**
 * Rails' `arel` reader is `with_connection { |c| build_arel(c, aliases) }`
 * (query_methods.rb:1595), so a model with no connection raises out of the
 * reader rather than building Arel against a substitute. trails' `arel`
 * acquires through `_conn()` for the same reason. Rails has no test for this —
 * `with_connection` raising is a property of the pool, not of `arel` — so the
 * pin that `arel` does not swallow `ConnectionNotEstablished` lives here.
 */
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
