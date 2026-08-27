import { describe, it, expect } from "vitest";

import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

describe("Relation eager_loading? memo", () => {
  fixtures(["posts", "comments"]);

  it("memoizes a truthy result instead of recomputing it", () => {
    const relation = Post.eagerLoad(":comments");
    expect(relation.isEagerLoading).toBe(true);

    relation.eagerLoadValues = [];
    relation.includesValues = [];
    expect(relation.isEagerLoading).toBe(true);
  });

  it("recomputes a falsy result, as Ruby's ||= does", () => {
    const relation = Post.all();
    expect(relation.isEagerLoading).toBe(false);

    relation.eagerLoadValues = ["comments"];
    expect(relation.isEagerLoading).toBe(true);
  });

  it("clears the memo in reset", () => {
    const relation = Post.eagerLoad(":comments");
    expect(relation.isEagerLoading).toBe(true);

    relation.eagerLoadValues = [];
    relation.reset();
    expect(relation.isEagerLoading).toBe(false);
  });
});
