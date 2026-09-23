import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { permanentConnectionCheckout, setPermanentConnectionCheckout } from "../active-record.js";

registerModel(Post);

describe("relation quoting through the adapter class", () => {
  fixtures(["posts"]);

  it("builds order and select arel with nothing leased under permanent_connection_checkout = true", () => {
    const was = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
    try {
      Base.releaseConnection();
      expect(Post.connectionPool().activeConnection).toBeNull();
      const adapterClass = Post.adapterClassSync() as unknown as {
        quoteTableName(n: string): string;
      };

      const ordered = Post.order(":no_such_column");
      const selected = Post.select({ posts: { title: "post_title" } });
      expect(Post.connectionPool().activeConnection).toBeNull();
      expect(ordered.toSql()).toContain(adapterClass.quoteTableName("no_such_column"));
      expect(selected.toSql()).toContain("post_title");
      expect(Post.connectionPool().activeConnection).toBeNull();
    } finally {
      setPermanentConnectionCheckout(was);
    }
  });
});
