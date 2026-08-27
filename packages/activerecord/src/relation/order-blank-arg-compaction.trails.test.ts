import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { UnknownAttributeReference } from "../errors.js";

describe("order blank arg compaction", () => {
  fixtures([]);

  it("compacts a blank order arg in order", () => {
    expect(Post.all().order("").toSql()).not.toContain("ORDER BY");
  });

  it("raises from the bang method, which does not compact", () => {
    const rel = Post.all() as unknown as { orderBang(arg: string): unknown };
    expect(() => rel.orderBang("")).toThrow(UnknownAttributeReference);
  });
});
