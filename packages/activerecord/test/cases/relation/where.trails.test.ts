import { describe, it, expect } from "vitest";
import "../../../lib/index.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Post } from "../../../lib/test-helpers/models/post.js";

describe("WhereTest", () => {
  fixtures([]);

  it("array first arg discards extra positional rest", () => {
    const withStray = (Post.all().where as (...args: unknown[]) => { toSql(): string })(
      ["id = ?", 1],
      2,
    );
    const withoutStray = (Post.all().where as (...args: unknown[]) => { toSql(): string })([
      "id = ?",
      1,
    ]);
    expect(withStray.toSql()).toEqual(withoutStray.toSql());
  });
});
