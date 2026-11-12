import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { Base } from "../../../lib/base.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Post } from "../../models/post.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "../../../lib/active-record.js";

constSet(TopLevel, "Post", Post);

describe("relation quoting through the adapter class", () => {
  fixtures(["posts"]);

  it("builds order and select arel with nothing leased under permanent_connection_checkout = true", () => {
    const was = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
    try {
      Base.releaseConnection();
      expect(Post.connectionPool().activeConnection).toBeNull();
      const adapterClass = Post.adapterClass();

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
